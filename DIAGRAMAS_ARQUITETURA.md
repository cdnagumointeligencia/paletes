# Diagramas de Fluxo e Arquitetura

Visualizações dos problemas e soluções implementadas.

---

## 1. FLUXO ATUAL (COM PROBLEMAS)

### Problema: Deleção local antes de Firestore confirmar

```
┌─────────────┐
│   Usuário   │
└──────┬──────┘
       │
       │ Clica em "Deletar"
       ▼
┌─────────────────────────┐
│ Confirmação Modal       │
└──────┬──────────────────┘
       │
       │ Confirma deleção
       ▼
┌─────────────────────────────────────────────┐
│ app1.js: confirmDeleteBtn click handler      │
│  - state.deleting = true                    │
│  - await window.FB.deleteSchedule()         │
└──────┬──────────────────────────────────────┘
       │
       ├─────────────────────────────────────────────┐
       │                                             │
       ▼ (Síncrono)                                 ▼ (Assíncrono)
┌──────────────────────────┐               ┌──────────────────────┐
│ UI atualizada (Imediato) │               │ Firestore processando│
│ - Remove do state.sched. │               │                      │
│ - Render()               │               └──────┬───────────────┘
│ - Toast "sucesso"        │                      │
└──────────────────────────┘                      │
                                                  ├─── OK? ───────┐
                                                  │               │
                                                  │               │ SIM (commit)
                                                  │               ▼
                                                  │         ┌────────────────┐
                                                  │         │ Listener atualiz│
                                                  │         │ state novamente │
                                                  │         └────────────────┘
                                                  │
                                                  │ NÃO (error)
                                                  ▼
                                            ┌──────────────────┐
                                            │ Firestore rejeita│
                                            │ (conflito, etc)  │
                                            └──────┬───────────┘
                                                   │
                                                   │ Listener retrai
                                                   │ agendamento deletado
                                                   ▼
                                            ┌──────────────────┐
                                            │ ⚠️ PROBLEMA:    │
                                            │ Usuário vê sucesso│
                                            │ Mas dado volta!  │
                                            └──────────────────┘

❌ RISCO: Perda de confiança, dados inconsistentes
```

---

## 2. FLUXO CORRIGIDO (SOLUÇÃO)

### Solução: Aguardar Firestore antes de atualizar UI

```
┌─────────────┐
│   Usuário   │
└──────┬──────┘
       │
       │ Clica em "Deletar"
       ▼
┌─────────────────────────┐
│ Confirmação Modal       │
└──────┬──────────────────┘
       │
       │ Confirma deleção
       ▼
┌─────────────────────────────────────────────┐
│ app1.js: confirmDeleteBtn click handler      │
│  - state.deleting = true                    │
│  - await window.FB.deleteSchedule()         │ ◄─── AGUARDA
└──────┬──────────────────────────────────────┘
       │
       │ ████████████ Esperando Firebase
       │
       ├─────────────────────────────────────────────┐
       │                                             │
       ▼ (Após confirmação do Firestore)             │
┌──────────────────────────────┐                 ┌──────────────────────┐
│ UI atualizada (Após sucesso) │                 │ Firestore           │
│ ✅ Remover do state.sched.   │◄────────────────│ - Deleta documento   │
│ ✅ Render()                  │ (Listener)      │ - Deleta lock        │
│ ✅ Toast "sucesso"           │                 │ - OK = true          │
└──────────────────────────────┘                 └──────────────────────┘

┌──────────────────────────────────────────────┐
│ Se Firestore rejeitar:                       │
│ ✅ Catch error                               │
│ ✅ Reverter (do backup)                      │
│ ✅ Toast "erro ao deletar"                   │
│ ✅ Não alterar UI                            │
└──────────────────────────────────────────────┘

✅ BENEFÍCIO: Dados sempre sincronizados
✅ UI reflete realidade (Firestore)
✅ Sem perda de dados
```

---

## 3. ARQUITETURA: FONTE DA VERDADE

### Visão Geral do Fluxo de Dados

```
                    FIREBASE FIRESTORE
                    (FONTE DA VERDADE)
                    ┌────────────────────┐
                    │ Collections:       │
                    │ - schedules        │
                    │ - suppliers        │
                    │ - history          │
                    │ - slotLocks        │
                    └────────┬───────────┘
                             │
                    ┌────────┴───────────┬──────────────┬─────────────┐
                    │                   │              │             │
                    ▼                   ▼              ▼             ▼
        ┌─────────────────────┐  ┌──────────────┐  ┌────────┐  ┌───────┐
        │ onSnapshot()        │  │ onSnapshot() │  │onSnap()│  │onSnap()
        │ schedules listener  │  │ suppliers    │  │history │  │slotLock
        └────────┬────────────┘  └──────┬───────┘  └───┬────┘  └───┬───┘
                 │                       │              │          │
                 ▼                       ▼              ▼          ▼
        ┌─────────────────────┐  ┌──────────────┐  ┌────────┐  ┌──────┐
        │ state.schedules     │  │ state.supp.  │  │state.h.│  │(não │
        │ ← Firestore         │  │ ← Firestore  │  │← FB    │  │ usado)
        └────────┬────────────┘  └──────┬───────┘  └───┬────┘  └──────┘
                 │                       │              │
                 └───────────┬───────────┴──────────────┘
                             │
                    ┌────────▼─────────┐
                    │  APP STATE       │
                    │ - schedules      │
                    │ - suppliers      │
                    │ - history        │
                    │ - views          │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  render()        │
                    │ (UI updated)     │
                    └──────────────────┘

📌 REGRA OURO: Todas as mudanças → Firestore PRIMEIRO
              Depois → listener atualiza state → render()
```

---

## 4. FLUXO DE OPERAÇÕES CRÍTICAS

### Criação + History (Atomicidade)

```
┌─────────────────────────────────────────────────────────────┐
│ Usuário submeta formulário "Novo Agendamento"              │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ app1.js: scheduleForm.addEventListener('submit')            │
│  1. Validação local (conflito de slot)                      │
│  2. Validação de limite (1000 paletes)                      │
│  3. Criar payload                                            │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ window.FB.createScheduleAtomic(payload, historyEvent)       │
│ ✅ TRANSAÇÃO FIRESTORE (runTransaction):                   │
│    1. Verificar se slotLock existe (NÃO deve existir)      │
│    2. Se existe → REJEITAR ("Slot already reserved")       │
│    3. Se não existe:                                        │
│       a. Criar documento em /schedules/{id}                │
│       b. Criar lock em /slotLocks/{hash}                   │
│       c. Criar history em /history/{id}                    │
│    4. TUDO OU NADA (atomicidade)                           │
└────────┬───────────────────────────────────────────────────┘
         │
    ┌────┴───────────────────────┐
    │                            │
    ▼ SUCESSO                    ▼ FALHA
┌──────────────────┐     ┌──────────────────────┐
│ Retorna newId    │     │ Lança erro           │
│                  │     │ (catch em app1.js)   │
└──────┬───────────┘     └──────┬───────────────┘
       │                        │
       ▼                        ▼
┌──────────────────┐     ┌──────────────────────┐
│ Listener recebe  │     │ Toast: "Erro ao     │
│ novo doc via     │     │ criar agendamento"  │
│ onSnapshot()     │     │ User tenta novamente │
└──────┬───────────┘     └──────────────────────┘
       │
       ▼
┌──────────────────┐
│ state.schedules  │
│ adicionado       │
│ render()         │
│ Toast: sucesso   │
└──────────────────┘

🔒 PROTEÇÃO: slotLocks previne dupla reserva mesmo com race condition
📊 AUDITORIA: history entra NA MESMA transação
🔄 SINCRONIZAÇÃO: listener atualiza state automaticamente
```

---

## 5. OFFLINE SYNC QUEUE

### Fluxo de Sincronização com Fila

```
┌─────────────┐
│ Usuário     │
└──────┬──────┘
       │
       ├─ Cria agendamento ────┐
       │                       │
       │ (OFFLINE)             ▼
       │                ┌──────────────┐
       │                │ Firestore    │
       │                │ indisponível │
       │                └──────────────┘
       │
       ├─ Edita agendamento ───┐
       │                       │
       │                       ▼
       ├─ Deleta agendamento ┌─────────────────────────┐
       │                     │ Todas as ops: localStorage
       │ (ONLINE)            │ + pendingHistoryEvents[]
       │ (detectado)         └────────┬────────────────┘
       │                              │
       │                              │ Reconexão detectada
       │                              │ (listener retorna)
       │                              ▼
       │                    ┌──────────────────────────┐
       │                    │ syncPendingHistoryEvents()
       │                    │ - Para cada evento        │
       │                    │ - sendToFirestore()      │
       │                    │ - Se sucesso: remove     │
       │                    │ - Se erro: tenta novamente
       │                    └────────┬─────────────────┘
       │                             │
       │                             ▼
       │                    ┌──────────────────────────┐
       │                    │ ✅ Histórico sincronizado│
       │                    │ ✅ localStorage limpo    │
       │                    └──────────────────────────┘
       ▼
   SUCESSO

🔄 A CADA 30 SEGUNDOS: retry automático
📲 NOTIFICAÇÃO: "Modo offline" mostra ao usuário
✅ RECUPERAÇÃO: dados não se perdem
```

---

## 6. RETRY COM BACKOFF EXPONENCIAL

### Tentativa de Inicialização do Firebase

```
Tentativa 1: 0ms       ┐
             ▌        │
             ▌        │
             ▌  Falha │
             ▌        │
   ┌─────────▼────────▼──┐
   │ Aguardando 2s        │
   │ (2^1 * 1000)         │
   └──────────┬───────────┘
              │
   Tentativa 2: ~2000ms ┐
             ▌         │
             ▌         │
             ▌  Falha  │
             ▌         │
   ┌─────────▼────────▼──┐
   │ Aguardando 4s        │
   │ (2^2 * 1000)         │
   └──────────┬───────────┘
              │
   Tentativa 3: ~4000ms ┐
             ▌         │
             ▌         │
             ▌  ✅ OK! │
             ▌         │
   ┌─────────▼────────▼──┐
   │ Firebase inicializado│
   └──────────┬───────────┘
              │
              ▼
        App operacional

📊 LÓGICA:
- Max 3 tentativas
- Timeout: 15s por tentativa
- Backoff: exponencial até 10s
- Máximo: 15 + 15 + 15 = 45s

✅ BENEFÍCIO:
- Não sobrecarrega rede
- Respeita rate limiting
- Fallback gracioso
```

---

## 7. MATRIX: Antes vs Depois

```
┌────────────────────┬──────────────────┬──────────────────┐
│ Operação           │ ANTES (❌ Risco) │ DEPOIS (✅ Seguro)│
├────────────────────┼──────────────────┼──────────────────┤
│ CRIAR Schedule     │ UI imediato      │ Aguarda Firestore│
│ + History          │ History offline  │ History atomicidade
│                    │ Pode duplicar    │ ✅ Garantido     │
├────────────────────┼──────────────────┼──────────────────┤
│ EDITAR Schedule    │ Sem validação    │ Validação em tx  │
│ + Lock migration   │ Race condition   │ Atomicidade      │
│                    │ Lock orfão       │ ✅ Garantido     │
├────────────────────┼──────────────────┼──────────────────┤
│ DELETAR Schedule   │ UI antes FB      │ Aguarda FB       │
│ + Lock            │ Dados reaparecem │ UI final         │
│                    │ Auditoria perdida│ ✅ Garantido     │
├────────────────────┼──────────────────┼──────────────────┤
│ Offline Sync      │ Sem fila         │ Fila com retry   │
│ History           │ Dados se perdem  │ Sincroniza 30s   │
│                    │ Sem notificação  │ ✅ Notifica user │
├────────────────────┼──────────────────┼──────────────────┤
│ Suppliers Init    │ localStorage     │ Firestore listener│
│                    │ Dados desatualizados│ ✅ Sempre atual  │
│                    │ Sem sincronização   │ Global sync      │
├────────────────────┼──────────────────┼──────────────────┤
│ Firebase Timeout  │ Timeout = offline │ Retry 3x        │
│                   │ Sem notificação  │ Notifica user   │
│                   │ Sem retry        │ ✅ Gracious fallb│
└────────────────────┴──────────────────┴──────────────────┘
```

---

## 8. ESTADO DO SISTEMA

### Antes das correções:
```
╔════════════════════════════════════════╗
║  INSTÁVEL                              ║
║                                        ║
║  ❌ Race conditions possíveis          ║
║  ❌ Perda de dados em deleção         ║
║  ❌ Sem sincronização offline         ║
║  ❌ Firebase não é fonte da verdade   ║
║  ❌ História incompleta               ║
║                                        ║
║  🚫 NÃO RECOMENDADO PARA PRODUÇÃO    ║
╚════════════════════════════════════════╝
```

### Depois das correções:
```
╔════════════════════════════════════════╗
║  ROBUSTO                               ║
║                                        ║
║  ✅ Sem race conditions                ║
║  ✅ Atomicidade garantida              ║
║  ✅ Sincronização offline              ║
║  ✅ Firebase é fonte única da verdade │
║  ✅ História completa e imutável      ║
║  ✅ Retry automático                  ║
║  ✅ Notificações de status            ║
║                                        ║
║  ✅ PRONTO PARA PRODUÇÃO              ║
╚════════════════════════════════════════╝
```

---

**FIM DOS DIAGRAMAS**

Estes diagramas ilustram visualmente os problemas e as soluções implementadas nos patches.
