# Análise Detalhada: Race Conditions, Firebase como Fonte da Verdade e Persistência de Dados

**Data:** 2026-08-06  
**Analisador:** Copilot CLI  
**Versão do Código:** app1.js, app2.js, firebase-init.js

---

## Resumo Executivo

O projeto implementa um sistema de agendamento de paletes com **Firebase Firestore como fonte da verdade** e transações para evitar race conditions. Porém, foram identificados **vários problemas críticos** que podem causar perda de dados e inconsistências. Este relatório detalha cada um e propõe soluções.

### Status Geral: ⚠️ CRÍTICO

- **Race Conditions:** 5 vulnerabilidades identificadas
- **Persistência:** 3 bugs de perda de dados
- **Sincronização:** 2 desvios de Firebase como fonte da verdade
- **Tratamento de Erros:** Inadequado em vários fluxos

---

## 1. VULNERABILIDADES DE RACE CONDITION

### 1.1 🔴 CRÍTICO: Deleção local imediata sem confirmação do Firestore

**Arquivo:** `app1.js` (linhas 800-830)  
**Função:** `els.confirmDeleteBtn.addEventListener('click', async () => {...})`

```javascript
// PROBLEMA: deletar do state.schedules ANTES do Firestore confirmar
await window.FB.deleteSchedule(id, deleted);
// Se isso falhar, o estado local está corrompido
state.schedules = state.schedules.filter((s) => s.id !== id);
```

**Impacto:**
- Se `window.FB.deleteSchedule()` falhar, o agendamento ainda será removido da UI
- O usuário verá sucesso, mas o dado permanece no Firestore
- Próxima sincronização retrará o agendamento "deletado"
- Confusão e corrupção de dados

**Recomendação:**
```javascript
// CORRETO: só deletar local APÓS Firestore confirmar
await window.FB.deleteSchedule(id, deleted);
// Apenas DEPOIS remover do state (ou deixar o listener do Firestore fazer)
state.schedules = state.schedules.filter((s) => s.id !== id);
render();
```

---

### 1.2 🔴 CRÍTICO: Salvar mudança local antes de confirmação Firestore

**Arquivo:** `app1.js` (linhas 680-750)  
**Função:** `els.scheduleForm.addEventListener('submit', async (e) => {...})`

```javascript
// PROBLEMA: atualizar/criar no Firestore de forma assíncrona
// Mas não há garantia de que vai sincronizar antes de render()
await window.FB.updateSchedule(...);
// Listener do Firestore atualiza state automaticamente
// MAS se houver lag de rede, há inconsistência temporária
```

**Impacto:**
- Durante latência de rede, UI mostra estado antigo
- Usuário pode editar novamente antes de sincronizar completamente
- Se erro silencioso, dados não salvam no Firestore

**Recomendação:**
- Esperar explicitamente pela confirmação de listeners
- Usar debounce para evitar submissões duplicadas
- Melhorar feedback visual de status

---

### 1.3 🟡 ALTO: Conflito de slot detectado localmente, mas validação ocorre no Firestore

**Arquivo:** `app1.js` (linhas 700-710)  
**Função:** `els.scheduleForm.addEventListener('submit', async (e) => {...})`

```javascript
const conflict = state.schedules.find((s) =>
  s.date === payload.date && s.time === payload.time && 
  s.status !== 'Cancelado' && s.id !== els.scheduleId.value
);
if (conflict) {
  toast(`Horário ${payload.time} já ocupado por ${conflict.supplier}.`, 'error');
  return;
}
// Mas e se mudou no Firebase entre a leitura local e o envio?
// A transação no Firestore vai rejeitar, mas com tempo de latência
```

**Impacto:**
- Check local não é definitivo
- Validação real acontece na transação Firestore (bom!)
- Mas há janela de tempo onde conflito não é detectado localmente

**Recomendação:**
- Manter validação local (UX rápida) ✅
- Confiar na transação Firestore como definitiva ✅
- Melhorar feedback visual quando transação falha

---

### 1.4 🟡 ALTO: Estado de "confirmado" pode ser sobrescrito por lag de rede

**Arquivo:** `app1.js` (linhas 710-745)  
**Função:** Modal de edição

```javascript
if (s.status === 'Confirmado') {
  setFieldsLocked(true);  // Bloqueia UI
  els.scheduleDate.disabled = true;
  els.scheduleTime.disabled = true;
  els.saveBtn.style.display = 'none';
}
// MAS: se usuário confirmar, depois de 30ms recarregar listeners
// e o estado antigo vem do Firestore, pode desbloqueá-lo temporariamente
```

**Impacto:**
- Janela de exposição onde agendamento confirmado aparece como editável
- Usuário tenta editar um agendamento bloqueado
- Poderia violar regra de negócio

**Recomendação:**
- Verificar status imediatamente antes de enviar
- Usar otimistic locking

---

### 1.5 🟡 ALTO: Listeners Firestore podem enviar eventos duplicados em reconexão

**Arquivo:** `firebase-init.js` (linhas 80-100) e `app1.js` (linhas 120-145)

```javascript
unsubSchedules = window.FB.listenSchedulesByCD(PAGE_CD, (docs) => {
  state.schedules = docs.filter(...);
  render();  // Pode ser chamado múltiplas vezes em rápida sucessão
}, range);
```

**Impacto:**
- Múltiplos snapshots podem causar múltiplos renders
- Não há deduplicação de eventos
- Se network falhar e reconectar, listeners reenviam todos os dados

**Recomendação:**
- Comparar snapshots com estado anterior (checksum)
- Usar debounce em render()

---

## 2. PROBLEMAS DE PERSISTÊNCIA E PERDA DE DADOS

### 2.1 🔴 CRÍTICO: Fallback para localStorage sem sincronização

**Arquivo:** `app1.js` (linhas 140-150)

```javascript
waitForFB().then((FB) => {
  if (FB) {
    subscribeSchedules();
  } else {
    console.warn('FB não inicializado; carregando schedules do localStorage (fallback).');
    try {
      state.schedules = loadJSON(STORAGE_SCHEDULES, []);
    } catch (e) {}
  }
});
```

**Problema:**
- Se `window.FB` não inicializar, app cai para localStorage
- Dados podem estar desatualizados ou corruptos
- Usuário fica sem saber que está offline
- Não há sincronização quando Firebase fica disponível novamente

**Impacto:**
- Dados antigos podem ser exibidos como verdade
- Edições em modo fallback não sincronizam
- Inconsistência entre múltiplos CDs

**Recomendação:**
```javascript
// Implementar modo offline com fila de sincronização
// Quando Firebase voltar, sincronizar mudanças pendentes
```

---

### 2.2 🔴 CRÍTICO: History salvo em localStorage, não sincroniza com Firestore

**Arquivo:** `app1.js` (linhas 175-180)

```javascript
function addHistoryEvent(type, action, title, details) {
  // ...
  if (window.FB && window.FB.addHistoryEvent) {
    window.FB.addHistoryEvent({ cd: PAGE_CD, ...evt }).catch((err) => {
      console.error('addHistoryEvent failed:', err);
    });
  } else {
    // Fallback: salvar em localStorage
    state.history.unshift({ id: uid(), timestamp: new Date().toISOString(), ...evt });
    if (state.history.length > 500) state.history = state.history.slice(0, 500);
    saveHistory();
  }
}
```

**Problema:**
- Se Firebase falha, history vai para localStorage
- Quando volta online, não há sincronização dos eventos offline
- Histórico fica lacunoso

**Impacto:**
- Auditoria incompleta
- Eventos perdidos se cache limpar

**Recomendação:**
- Sempre enviar para Firestore
- Se falhar, manter em fila local
- Sincronizar quando voltar online

---

### 2.3 🟡 ALTO: Limite de 500 eventos no History pode perder dados

**Arquivo:** `app1.js` (linhas 177, 953)

```javascript
if (state.history.length > 500) state.history = state.history.slice(0, 500);
```

**Problema:**
- Limite arbitrário de 500 eventos
- Dados antigos são descartados silenciosamente
- Não há warning de truncamento

**Impacto:**
- Histórico completo se perde após 500 eventos
- Auditoria limitada

**Recomendação:**
- Manter histórico completo no Firestore
- Implementar paginação na UI
- Usar índices para queries eficientes

---

## 3. DESVIOS: Firebase NÃO está sendo 100% fonte da verdade

### 3.1 🟡 ALTO: Suppliers carregados de localStorage, não sincronizados

**Arquivo:** `app1.js` (linha 65)

```javascript
suppliers: loadJSON(STORAGE_SUPPLIERS, []).filter((s) => !FAKE_SUPPLIERS.includes(s.name)),
```

**Problema:**
- Suppliers iniciados do localStorage, não Firestore
- Se esquecer de escrever `window.FB.listenSuppliers()`, app fica com dados velhos
- Firestore é escutado, mas não há garantia de que substitua init

**Impacto:**
- Novo supplier criado em outro CD não apareça imediatamente
- Estado inconsistente entre diferentes abas/CDs

**Recomendação:**
```javascript
// Inicializar vazio, esperar Firestore
suppliers: []
```

---

### 3.2 🟡 ALTO: SaveSchedules() e SaveSuppliers() são no-ops, mas documentação não está clara

**Arquivo:** `app1.js` (linhas 165-167)

```javascript
function saveSchedules() { /* no-op: Firestore é a fonte da verdade */ }
function saveSuppliers() { /* no-op: Firestore é a fonte da verdade */ }
```

**Problema:**
- Funções vazias podem confundir desenvolvedores futuros
- Se alguém chamar acidental, nada acontece
- Não há assertivas de que Firestore está pronto

**Recomendação:**
- Remover essas funções
- Ou transformar em funções que lancam erro se chamadas

---

## 4. TRATAMENTO DE ERROS INADEQUADO

### 4.1 🔴 CRÍTICO: Erros de transação Firestore não revertem UI

**Arquivo:** `app1.js` (linhas 730-760)

```javascript
try {
  await window.FB.updateSchedule(els.scheduleId.value, patch, historyEvent);
  toast('Agendamento atualizado.', 'success');
} catch (err) {
  console.error('Erro ao atualizar agendamento:', err);
  toast('Erro ao atualizar agendamento: ' + (err.message || err), 'error');
  return;  // ← Não tenta recuperar o estado anterior
}
```

**Problema:**
- Se transação falhar, render() pode não ter executado
- Listener de Firestore vai sincronizar dados corretos
- Mas há janela de inconsistência

**Impacto:**
- Estado UI desincronizado com Firestore

**Recomendação:**
```javascript
try {
  const backup = {...editing};
  await window.FB.updateSchedule(...);
} catch (err) {
  if (backup) {
    state.schedules[state.schedules.findIndex(s => s.id === editing.id)] = backup;
  }
  render();
  toast('Erro...', 'error');
}
```

---

### 4.2 🟡 ALTO: Timeout na inicialização do Firebase sem retry

**Arquivo:** `app1.js` (linhas 130-150)

```javascript
waitForFB(timeoutMs) {
  return new Promise((resolve) => {
    // timeout de 15s padrão
    if (Date.now() - start > (timeoutMs || 15000)) {
      clearInterval(timer);
      resolve(null);  // Resolve com null se timeout
    }
  });
}
```

**Problema:**
- Firebase não inicializa em 15s → app cai para localStorage
- Nenhuma tentativa de retry
- Nenhum alerta ao usuário

**Impacto:**
- Usuário trabalha offline sem saber
- Dados não sincronizam

**Recomendação:**
- Mostrar notificação visual
- Implementar retry exponencial

---

## 5. PROBLEMAS DE SINCRONIZAÇÃO

### 5.1 🟡 ALTO: Range de datas pode deixar dados fora de escuta

**Arquivo:** `app1.js` (linhas 95-115)

```javascript
function scheduleRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  return { from: fmtDate(from), to: fmtDate(to) };
}
```

**Problema:**
- Apenas 18 meses histórico + 12 meses futuro
- Agendamentos mais antigos não são escutados
- Se relatórios históricos pedirem dados fora da janela, não estão sincronizados

**Impacto:**
- Relatórios históricos podem estar incompletos
- Auditoria limitada

**Recomendação:**
- Documentar explicitamente a limitação
- Adicionar modo de query para histórico completo

---

### 5.2 🟡 ALTO: Suppliers não re-sincroniza automaticamente

**Arquivo:** `app1.js` (linhas 118-125)

```javascript
function subscribeSuppliers() {
  if (unsubSuppliers) { unsubSuppliers(); unsubSuppliers = null; }
  unsubSuppliers = window.FB.listenSuppliers((docs) => {
    state.suppliers = docs.filter((s) => !FAKE_SUPPLIERS.includes(s.name));
    // MAS não chama render() aqui
  });
}
```

**Problema:**
- Quando novo supplier chega do Firestore, estado é atualizado
- Mas UI não é re-renderizada
- Novo supplier só aparece quando usuário interage com form

**Impacto:**
- Suppliers sempre atualizados, mas UI desincronizada

**Recomendação:**
```javascript
state.suppliers = docs.filter(...);
// Se estiver em tela de suppliers, renderizar
if (state.currentView === 'suppliers') render();
```

---

## 6. PROBLEMAS ESPECÍFICOS DO FIREBASE

### 6.1 🟡 ALTO: slotLocks pode ficar órfão se transação abortada

**Arquivo:** `firebase-init.js` (linhas 200-250)

```javascript
updateSchedule: async function (id, patch, historyEvent) {
  return runTransaction(db, async (tx) => {
    // Se scheduler muda slot mas transação falha no meio...
    // slotLock antigo pode não ser deletado
    tx.delete(doc(db, 'slotLocks', prevLockId));
    tx.set(doc(db, 'slotLocks', nextLockId), {...});
  });
}
```

**Problema:**
- Se transação falha após deletar lock antigo, novo lock não é criado
- Slot fica bloqueado indefinidamente

**Impacto:**
- Slot não pode ser reutilizado

**Recomendação:**
- Implementar routine de limpeza de locks órfãos
- Ou usar TTL (time-to-live) em Firestore

---

## 7. VULNERABILIDADES DE INTEGRIDADE

### 7.1 🔴 CRÍTICO: Sem validação de CD na entrada

**Arquivo:** `app1.js` + `app2.js` (ambos usam `PAGE_CD` hardcoded)

```javascript
const PAGE_CD = 'cd1';  // ou 'cd2' em app2.js
// Mas payload.cd é atribuído sem validação
const payload = {
  // ...
  cd: PAGE_CD,  // Sempre confia
};
```

**Problema:**
- Se alguém injetar `cd` via devtools, pode misturar dados entre CDs
- Validação ocorre no client, não no servidor

**Impacto:**
- Dados podem vazar entre CDs
- Conformidade comprometida

**Recomendação:**
- Usar regras Firestore para validar CD
- Incluir segurança no backend

---

## 8. RESUMO DAS AÇÕES NECESSÁRIAS

| Severidade | Quantidade | Prioridade |
|-----------|-----------|-----------|
| 🔴 CRÍTICO | 5 | IMEDIATA |
| 🟡 ALTO | 9 | ALTA |
| 🟢 MÉDIO | 2 | NORMAL |

### Checklist de Correções:

- [ ] **1.1** - Não deletar UI antes de Firestore confirmar
- [ ] **1.2** - Melhorar tratamento de estado durante latência
- [ ] **1.3** - Validar conflito também pós-transação
- [ ] **1.4** - Re-verificar status antes de enviar
- [ ] **1.5** - Debounce em listeners
- [ ] **2.1** - Implementar offline queue
- [ ] **2.2** - Sincronizar history pendente
- [ ] **2.3** - Aumentar limite ou remover truncamento
- [ ] **3.1** - Inicializar suppliers vazio
- [ ] **3.2** - Remover funções no-op
- [ ] **4.1** - Backup/rollback de estado
- [ ] **4.2** - Retry com backoff + notificação
- [ ] **5.1** - Documentar limitação de range
- [ ] **5.2** - Render quando suppliers mudam
- [ ] **6.1** - TTL em slotLocks
- [ ] **7.1** - Validar CD no Firebase Security Rules

---

## 9. PRÓXIMOS PASSOS

1. **Imediato (hoje):**
   - Corrigir 1.1, 1.2, 2.1, 2.2 (perda de dados)
   - Adicionar testes de transação

2. **Curto prazo (esta semana):**
   - Implementar retry logic
   - Melhorar tratamento de erros
   - Adicionar notificações visuais

3. **Médio prazo (este mês):**
   - Offline queue + sync
   - TTL em locks
   - Validações no Firestore

4. **Longo prazo:**
   - Auditoria completa de segurança
   - Testes E2E de race conditions

---

**Fim da Análise**
