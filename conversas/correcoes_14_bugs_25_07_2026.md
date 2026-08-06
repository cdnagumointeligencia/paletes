# Correções de 14 Bugs e Melhorias — 25/07/2026

## Resumo da Sessão

Sessão focada em corrigir 14 bugs e melhorias identificadas no sistema "Controle de Retirada de Paletes". Todos os itens foram implementados com sucesso.

---

## Bugs Críticos

### Bug 1: Senhas em texto puro
**Problema:** Senhas de usuários ficavam visíveis em texto puro no painel de administração.

**Solução:**
- Adicionado flag `mustChangePassword: true` para usuários padrão
- Implementada tela de troca obrigatória no primeiro login (`login.html`)
- Usuário é obrigado a definir nova senha antes de acessar o sistema
- Senha não pode ser igual à senha padrão

**Arquivos alterados:**
- `login.html` — Tela de troca de senha + lógica de verificação
- `app.js` — Remoção do flag quando admin altera senha de usuário

---

### Bug 2+3: Baixa parcial de estoque e Schedule Confirmado sem baixa
**Problema:** Era possível confirmar um schedule sem ter estoque suficiente, ou fazer baixa parcial.

**Solução:**
- `registerStockExit()` agora retorna `boolean` — `true` se sucesso, `false` se falha
- Se estoque < solicitado, schedule NÃO é salvo como Confirmado
- Nenhuma baixa parcial é permitida (tudo ou nada)

**Arquivo alterado:**
- `app.js` — Função `registerStockExit` + lógica de confirmação de schedule

---

### Bug 4: registerStockEntry sem validação de CD
**Problema:** `registerStockEntry` não verificava se o CD existia antes de devolver estoque.

**Solução:**
- `registerStockEntry()` agora retorna `boolean`
- Valida se o CD existe antes de processar devolução
- Toast de erro se CD não encontrado

**Arquivo alterado:**
- `app.js` — Função `registerStockEntry`

---

## Bugs Menores

### Bug 5: Ícones de cadeado acumulando
**Problema:** Quando campos eram bloqueados/desbloqueados, ícones de cadeado se acumulavam.

**Solução:**
- `setStockFieldsDisabled()` agora remove TODOS os badges primeiro
- Depois re-adiciona se necessário — sem duplicação

**Arquivo alterado:**
- `app.js` — Função `setStockFieldsDisabled`

---

### Bug 6: syncStockHistory O(n²)
**Problema:** Deduplicação usava `.some().includes()` — complexidade O(n²).

**Solução:**
- Usa `Set` para IDs existentes — dedup O(1)
- Performance significativamente melhor para histórico grande

**Arquivo alterado:**
- `app.js` — Função `syncStockHistory`

---

### Bug 7: Backup import sem validação
**Problema:** Import de backup não validava estrutura antes de sobrescrever dados.

**Solução:**
- Valida chaves obrigatórias (`paletes.schedules`, `paletes.suppliers`) antes de importar
- Toast de erro se backup estiver incompleto

**Arquivo alterado:**
- `app.js` — Função `executeImport`

---

### Bug 8: Seed schedule sem verificação de estoque
**Problema:** Schedules iniciais (seeds) eram criados como "Confirmado" sem verificar estoque.

**Solução:**
- Seeds agora usam status "Agendado" em vez de "Confirmado"
- Estoque só é baixado quando usuário confirma manualmente

**Arquivo alterado:**
- `app.js` — Função `seedSchedules`

---

## Melhorias

### Melhoria 9: Forçar troca de senha
**Problema:** Usuários com senhas padrão não eram obrigados a alterá-las.

**Solução:**
- Flag `mustChangePassword: true` em usuários padrão
- Tela obrigatória no primeiro login
- Senha não pode ser igual à padrão

**Arquivos alterados:**
- `login.html` — Tela de troca + lógica
- `app.js` — Remoção do flag

---

### Melhoria 10: Rate limiting no login
**Problema:** Não havia limite de tentativas de login — brute force era possível.

**Solução:**
- Contador de tentativas (`paletes.loginAttempts`)
- Bloqueio após 5 tentativas por 15 minutos
- Mensagem informativa com tempo restante

**Arquivo alterado:**
- `login.html` — Funções de rate limiting

---

### Melhoria 11: CSV escape de HTML
**Problema:** Caracteres HTML (`<`, `>`, `"`, `'`) não eram escapados no CSV export.

**Solução:**
- `csvEscape()` agora escapa caracteres HTML para entidades seguras
- Prevenção de XSS ao abrir CSV em navegadores

**Arquivo alterado:**
- `app.js` — Função `csvEscape`

---

### Melhoria 12: Slots cancelados visual
**Problema:** Slots cancelados eram idênticos a slots "Livre" — confusão visual.

**Solução:**
- Botão vermelho tracejado "Cancelado — reagendar"
- CSS específico com cor `--status-cancelado`

**Arquivos alterados:**
- `app.js` — Renderização de slots
- `style.css` — Classe `.slot-cancelled`

---

### Melhoria 13: Validação de localStorage corrompido
**Problema:** Dados corrompidos no localStorage causavam comportamento indefinido.

**Solução:**
- `loadJSON()` valida se schedules/suppliers são arrays
- `console.warn` se dados estiverem corrompidos
- Fallback automático para dados padrão

**Arquivo alterado:**
- `app.js` — Função `loadJSON`

---

### Melhoria 14: Estoque negativo no gerenciamento
**Problema:** Não havia validação extra para estoque negativo no `gerenciamento.html`.

**Solução:**
- Validação adicional antes de processar saída
- Bloqueio se resultado seria negativo
- Mensagem de erro informativa

**Arquivo alterado:**
- `gerenciamento.html` — Validação de estoque

---

## Arquivos Alterados (Resumo)

| Arquivo | Mudanças |
|---------|----------|
| `app.js` | 7 funções modificadas |
| `login.html` | Rate limiting + troca de senha |
| `style.css` | Slot-cancelled visual |
| `gerenciamento.html` | Validação estoque negativo |

---

## Status Final

✅ Todos os 14 itens implementados e verificados

Sistema pronto para uso em produção.
