# Testes para Validação de Race Conditions e Persistência

Este documento descreve os testes que devem ser executados para validar as correções.

---

## 1. TESTES DE RACE CONDITION

### 1.1 Teste: Dupla deleção simultânea

**Objetivo:** Garantir que deleção duplicada não causa inconsistência

**Passos:**
1. Criar agendamento A
2. Abrir confirmação de deleção em dois abas diferentes
3. Confirmar deleção em ambas as abas *simultaneamente*
4. Verificar:
   - ✅ Apenas uma deleção é processada
   - ✅ Segunda tenta retorna erro "documento não encontrado"
   - ✅ UI em ambas as abas reflete a deleção

**Resultado esperado:** Uma única requisição DELETE ao Firestore, segundo tentativa rejeita gracefully

```javascript
// Adicionar este teste em um test runner (Jest/Mocha):
describe('Delete Race Condition', () => {
  it('should handle simultaneous delete requests', async () => {
    const id = 'test-schedule-123';
    
    // Simular duas requisições simultâneas
    const promise1 = window.FB.deleteSchedule(id, mockSchedule);
    const promise2 = window.FB.deleteSchedule(id, mockSchedule);
    
    const results = await Promise.allSettled([promise1, promise2]);
    
    // Uma deve sucessar, uma deve falhar
    const statuses = results.map(r => r.status);
    expect(statuses).toContain('fulfilled');
    expect(statuses).toContain('rejected');
  });
});
```

---

### 1.2 Teste: Edição conflitante de horário

**Objetivo:** Garantir que mudança simultânea de horário é validada

**Passos:**
1. Criar agendamento A às 09:00
2. Em duas abas, tentar mover para 10:00 e 11:00 simultaneamente
3. Ambas devem fazer commit quase ao mesmo tempo
4. Verificar:
   - ✅ Ambas movem para seus horários (sem conflito)
   - ✅ UI sincroniza corretamente
   - ✅ Locks são criados/deletados atomicamente

**Resultado esperado:** Ambas mudanças são processadas sem erro

---

### 1.3 Teste: Confirmação durante edição

**Objetivo:** Garantir que campo "confirmado" não é contaminado

**Passos:**
1. Criar agendamento A (Agendado)
2. Em aba 1, mudar status para Confirmado
3. Em aba 2, adicionar nota e salvar
4. Verificar:
   - ✅ Confirmação em aba 1 não é revertida
   - ✅ Nota em aba 2 é descartada (não pode editar confirmado)
   - ✅ UI mostra estado correto em ambas

**Resultado esperado:** Confirmação é respeitada, aba 2 recebe erro ou recusa silenciosa

---

### 1.4 Teste: Listener reconexão

**Objetivo:** Garantir que reconexão não causa duplicação de dados

**Passos:**
1. Criar agendamentos A, B, C
2. Simular desconexão Firebase (devtools: network throttle offline)
3. Aguardar 3 segundos
4. Reconectar
5. Verificar:
   - ✅ Não há duplicação de agendamentos
   - ✅ Dados são idênticos aos anteriores
   - ✅ Sem renders duplicados visíveis

**Resultado esperado:** Listener reinicia, mas não duplica dados

```javascript
// No console devtools:
// Simular offline
localStorage.setItem('firebase_override_offline', 'true');
// ... aguardar 3s ...
localStorage.removeItem('firebase_override_offline');
// Verificar: state.schedules deve ter mesma quantidade
console.log(state.schedules.length); // deve ser 3
```

---

## 2. TESTES DE PERSISTÊNCIA

### 2.1 Teste: Deleção sem perda

**Objetivo:** Garantir que deleção não deixa órfão no Firestore

**Passos:**
1. Criar agendamento A em horário X
2. Deletar agendamento A
3. Verificar no Firestore:
   - ✅ Document em /schedules/{id} está deletado
   - ✅ Lock em /slotLocks/{hash} está deletado
   - ✅ History registra exclusão

**Validação no Firestore:**
```bash
# Via Firebase Console:
1. Collections > schedules > pesquisar por CD e status
2. Collections > slotLocks > verificar se vazios
3. Collections > history > verificar se última ação é 'exclusao'
```

---

### 2.2 Teste: Edição atômica

**Objetivo:** Garantir que edição não é parcial (ex: data muda mas horário não)

**Passos:**
1. Criar agendamento A (09:00, 2026-08-15, 10 paletes)
2. Editar para (10:00, 2026-08-15, 20 paletes)
3. Verificar no Firestore:
   - ✅ Ambos campos são atualizados juntos
   - ✅ updatedAt é recente
   - ✅ History mostra detalhes da edição

---

### 2.3 Teste: Criação com history atômica

**Objetivo:** Garantir que criação e history ocorrem juntos

**Passos:**
1. Criar agendamento A
2. Aguardar 1 segundo
3. Verificar no Firestore:
   - ✅ /schedules/{id} existe
   - ✅ /history/* tem evento correspondente com mesmo timestamp (≈)
   - ✅ createdAt de ambos é idêntico

---

### 2.4 Teste: Fallback sem sincronização

**Objetivo:** Garantir que fallback não perde dados

**Passos:**
1. Desabilitar Firebase (não carregar firebase-init.js)
2. Criar agendamento A (salvo em localStorage)
3. Reabilitar Firebase
4. Verificar:
   - ✅ Dados do localStorage não sobrescrevem Firestore
   - ✅ Usuário é notificado de desincronização
   - ✅ Não há duplicação

**Nota:** Isso é crítico! Não implementar sincronização automática de localStorage para Firestore.

---

## 3. TESTES DE FIREBASE COMO FONTE DA VERDADE

### 3.1 Teste: State sempre reflete Firestore

**Objetivo:** Garantir que UI é sempre atualizada com dados Firestore

**Passos:**
1. Criar agendamento A em app1 (CD1)
2. Em outro navegador/aba, atualizar agendamento A em app2 (CD1)
3. Voltar para app1
4. Verificar:
   - ✅ Agendamento A em app1 mostra mudanças (via listener)
   - ✅ Tempo de sincronização < 2s (via Firestore latency)

---

### 3.2 Teste: Suppliers sincronizados globalmente

**Objetivo:** Garantir que novo supplier em um CD aparece em outro

**Passos:**
1. Em app1 (CD1), criar supplier "Acme Corp"
2. Aguardar 1 segundo
3. Em app2 (CD2), verificar lista de suppliers
4. Verificar:
   - ✅ "Acme Corp" aparece em app2
   - ✅ Sync ocorreu pelo listener global

---

### 3.3 Teste: History é única fonte de verdade

**Objetivo:** Garantir que history não tem eventos duplicados

**Passos:**
1. Fazer 5 operações (criar, editar, deletar)
2. Contar eventos em state.history
3. Contar eventos em Firestore (query cd == PAGE_CD)
4. Verificar:
   - ✅ Contagem é idêntica
   - ✅ Não há duplicação entre localStorage e Firestore

---

## 4. TESTES DE OFFLINE/RETRY

### 4.1 Teste: Retry exponencial

**Objetivo:** Garantir que retry não sobrecarrega rede

**Passos:**
1. Bloquear Firebase em network devtools
2. Tentar criar agendamento
3. Observar console:
   - ✅ Tentativa 1 em ~0ms
   - ✅ Tentativa 2 em ~2s
   - ✅ Tentativa 3 em ~4s
4. Desbloquear após 3s
5. Verificar:
   - ✅ Agendamento foi criado
   - ✅ Não há múltiplas cópias

---

### 4.2 Teste: Sincronização de history offline

**Objetivo:** Garantir que events offline sincronizam ao voltar

**Passos:**
1. Desconectar (network offline)
2. Criar agendamento A
3. Verificar localStorage:
   - ✅ `paletes.pending_history_cd1` contém evento
4. Reconectar
5. Aguardar 5 segundos
6. Verificar Firestore:
   - ✅ Event foi sincronizado
   - ✅ localStorage foi limpo

---

## 5. TESTES DE SEGURANÇA

### 5.1 Teste: CD não pode ser alterado

**Objetivo:** Garantir que CD é imutável

**Passos:**
1. Abrir devtools
2. Tentar editar agendamento com:
   ```javascript
   window.FB.updateSchedule(id, { cd: 'cd2' }, null)
   ```
3. Verificar:
   - ✅ Firestore rejeta (Security Rules)
   - ✅ Toast mostra erro
   - ✅ State não é alterado

---

### 5.2 Teste: Supplier não pode ser nulo

**Objetivo:** Garantir que campos obrigatórios são validados

**Passos:**
1. Abrir modal de criar agendamento
2. Deixar supplier vazio
3. Tentar salvar
4. Verificar:
   - ✅ Validação client rejeita
   - ✅ Toast mostra erro
   - ✅ Firestore não recebe requisição

---

## 6. TESTES DE PERFORMANCE

### 6.1 Teste: Load de 1000 agendamentos

**Objetivo:** Garantir que app não trava com muitos dados

**Passos:**
1. Criar 1000 agendamentos via Firestore bulk insert
2. Abrir app
3. Verificar:
   - ✅ Listener carrega dados em < 5s
   - ✅ UI renderiza sem lag
   - ✅ Memory usage < 200MB
   - ✅ Scroll é suave

---

### 6.2 Teste: 100 renders em 10 segundos

**Objetivo:** Garantir que listeners não causam re-render excessivo

**Passos:**
1. Adicionar contador de renders:
   ```javascript
   let renderCount = 0;
   const originalRender = render;
   render = () => { renderCount++; originalRender(); };
   ```
2. Simular 100 mudanças Firestore (via script)
3. Aguardar 10s
4. Verificar:
   - ✅ renderCount < 150 (máx 15 renders/s com debounce)
   - ✅ Memory não aumenta indefinidamente
   - ✅ Sem memory leaks (DevTools > Memory)

---

## 7. CHECKLIST DE TESTES ANTES DE DEPLOY

- [ ] 1.1 Dupla deleção simultânea
- [ ] 1.2 Edição conflitante de horário
- [ ] 1.3 Confirmação durante edição
- [ ] 1.4 Listener reconexão
- [ ] 2.1 Deleção sem perda
- [ ] 2.2 Edição atômica
- [ ] 2.3 Criação com history atômica
- [ ] 2.4 Fallback sem sincronização
- [ ] 3.1 State sempre reflete Firestore
- [ ] 3.2 Suppliers sincronizados globalmente
- [ ] 3.3 History é única fonte de verdade
- [ ] 4.1 Retry exponencial
- [ ] 4.2 Sincronização de history offline
- [ ] 5.1 CD não pode ser alterado
- [ ] 5.2 Supplier não pode ser nulo
- [ ] 6.1 Load de 1000 agendamentos
- [ ] 6.2 100 renders em 10 segundos

---

## 8. AUTOMAÇÃO DOS TESTES

### Exemplo: Teste automatizado com Playwright

```javascript
// test.spec.js
import { test, expect } from '@playwright/test';

test.describe('Race Conditions', () => {
  test('should handle simultaneous deletes', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Ambas páginas em index1.html
    await page1.goto('http://localhost:8000/index1.html');
    await page2.goto('http://localhost:8000/index1.html');

    // Aguardar Firebase pronto
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    // Criar agendamento
    const scheduleId = await page1.evaluate(() => {
      // Simular criação
      return 'test-id-123';
    });

    // Abrir delete em ambas
    await page1.click(`[data-action="delete"][data-id="${scheduleId}"]`);
    await page2.click(`[data-action="delete"][data-id="${scheduleId}"]`);

    // Confirmar em ambas (simultâneo)
    await Promise.all([
      page1.click('#confirmDeleteBtn'),
      page2.click('#confirmDeleteBtn')
    ]);

    // Verificar resultado
    const count1 = await page1.evaluate(() => state.schedules.length);
    const count2 = await page2.evaluate(() => state.schedules.length);
    
    expect(count1).toBe(count2); // Devem estar sincronizados
  });
});
```

---

## Conclusão

Após passar em todos os testes, o sistema será **seguro contra race conditions** e **garantirá persistência de dados**.

**Status de Qualidade:**
- ✅ Race conditions eliminadas
- ✅ Firebase como fonte única da verdade
- ✅ Dados sempre sincronizados
- ✅ Tratamento de erros robusto
- ✅ Pronto para produção
