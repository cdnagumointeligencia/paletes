# Correções para Race Conditions e Persistência

Este arquivo contém os patches para os problemas identificados na análise.

## PATCH 1: Corrigir deleção local prematura (CRÍTICO)

**Arquivo:** app1.js  
**Problema:** Estado é deletado da UI antes de Firestore confirmar  
**Solução:** Deixar o listener do Firestore fazer a atualização

### Antes (linhas 800-830):
```javascript
els.confirmDeleteBtn.addEventListener('click', async () => {
  if (!state.pendingDeleteId || state.deleting) return;
  state.deleting = true;
  els.confirmDeleteBtn.disabled = true;
  try {
    const id = state.pendingDeleteId;
    const deleted = state.schedules.find((s) => s.id === id);
    await window.FB.deleteSchedule(id, deleted);
    // PROBLEMA: deletar local ANTES de confirmar
    state.schedules = state.schedules.filter((s) => s.id !== id);
    closeConfirmModal();
    render();
    // ...
  } catch (err) {
    // ...
  }
});
```

### Depois (Correto):
```javascript
els.confirmDeleteBtn.addEventListener('click', async () => {
  if (!state.pendingDeleteId || state.deleting) return;
  state.deleting = true;
  els.confirmDeleteBtn.disabled = true;
  try {
    const id = state.pendingDeleteId;
    const deleted = state.schedules.find((s) => s.id === id);
    
    // Firestore deletará e o listener atualizará automaticamente
    await window.FB.deleteSchedule(id, deleted);
    
    // SÓ aqui, ou nem é necessário (listener faz)
    closeConfirmModal();
    // render() é chamado pelo listener do Firestore
    
    if (deleted) {
      addHistoryEvent('agendamento', 'exclusao', 'Agendamento excluído',
        `${deleted.supplier} — ${formatDateBR(deleted.date)} ${deleted.time} — ${deleted.pallets} paletes`);
    }
    toast('Agendamento excluído. Horário liberado.', 'success');
  } catch (err) {
    console.error('Erro ao excluir agendamento:', err);
    toast('Erro ao excluir agendamento: ' + (err.message || err), 'error');
  } finally {
    state.deleting = false;
    els.confirmDeleteBtn.disabled = false;
  }
});
```

---

## PATCH 2: Garantir atomicidade na criação/edição (CRÍTICO)

**Arquivo:** app1.js  
**Problema:** State é modificado antes de Firebase confirmar  
**Solução:** Usar estado "pendente" e só confirmar após Firestore

### Adicionar ao state (linha 62):
```javascript
let state = {
  // ... existente ...
  optimisticUpdates: {}, // { scheduleId: { old: {...}, new: {...} } }
};
```

### Modificar submit do form (linhas 680-780):
```javascript
els.scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (state.submitting) return;
  state.submitting = true;
  els.saveBtn.disabled = true;

  try {
    const editing = els.scheduleId.value ? 
      state.schedules.find((sc) => sc.id === els.scheduleId.value) : null;
    
    // ... validações existentes ...

    const payload = {
      date: els.scheduleDate.value,
      time: els.scheduleTime.value,
      supplier: els.supplierInput.value.trim(),
      pallets: Number(els.pallets.value),
      driver: els.driver.value.trim(),
      plate: els.plate.value.trim().toUpperCase(),
      status: els.status.value,
      cd: PAGE_CD,
      tipoPalete: els.scheduleTipoPalete.value,
      notes: els.notes.value.trim(),
      createdBy: currentUser ? currentUser.username : 'unknown',
    };

    // ... validações de conflito ...

    const historyEvent = {
      type: 'agendamento',
      action: els.scheduleId.value ? 'edicao' : 'criacao',
      title: els.scheduleId.value ? 'Agendamento editado' : 'Agendamento criado',
      details: `${payload.supplier} — ${formatDateBR(payload.date)} ${payload.time} — ${payload.pallets} paletes ${payload.tipoPalete} — ${payload.status}`,
      user: currentUser ? currentUser.username : 'Sistema',
    };

    if (els.scheduleId.value) {
      const s = state.schedules.find((sc) => sc.id === els.scheduleId.value);
      const oldStatus = s.status;
      const patch = { ...payload };
      
      if (payload.status === 'Confirmado' && oldStatus !== 'Confirmado') {
        patch.confirmedBy = currentUser ? currentUser.username : 'unknown';
        patch.confirmedAt = new Date().toISOString();
      }

      // Guardar estado antigo para rollback
      state.optimisticUpdates[els.scheduleId.value] = {
        old: { ...s },
        new: patch,
      };

      try {
        await window.FB.updateSchedule(els.scheduleId.value, patch, historyEvent);
        toast('Agendamento atualizado.', 'success');
        // Listener do Firestore atualiza state automaticamente
      } catch (err) {
        console.error('Erro ao atualizar agendamento:', err);
        // Reverter optimistic update
        if (state.optimisticUpdates[els.scheduleId.value]) {
          const idx = state.schedules.findIndex(sc => sc.id === els.scheduleId.value);
          if (idx >= 0) {
            state.schedules[idx] = state.optimisticUpdates[els.scheduleId.value].old;
            render();
          }
          delete state.optimisticUpdates[els.scheduleId.value];
        }
        toast('Erro ao atualizar agendamento: ' + (err.message || err), 'error');
        return;
      }
    } else {
      if (payload.status === 'Confirmado') {
        payload.confirmedBy = currentUser ? currentUser.username : 'unknown';
        payload.confirmedAt = new Date().toISOString();
      }

      try {
        const newId = await window.FB.createScheduleAtomic(payload, historyEvent);
        toast('Agendamento criado.', 'success');
        // Listener do Firestore adiciona ao state automaticamente
      } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        toast('Erro ao criar agendamento: ' + (err.message || err), 'error');
        return;
      }
    }

    closeScheduleModal();
    render();
  } finally {
    state.submitting = false;
    els.saveBtn.disabled = false;
  }
});
```

---

## PATCH 3: Inicializar suppliers vazio (do Firestore) (ALTO)

**Arquivo:** app1.js  
**Problema:** Suppliers vêm do localStorage, não do Firestore  
**Solução:** Inicializar vazio e deixar listener preencher

### Antes (linha 65):
```javascript
suppliers: loadJSON(STORAGE_SUPPLIERS, []).filter((s) => !FAKE_SUPPLIERS.includes(s.name)),
```

### Depois:
```javascript
suppliers: [], // Firestore listener vai preencher via subscribeSuppliers()
```

### E garantir que subscribeSuppliers é chamado imediatamente (após linha 140):
```javascript
waitForFB().then((FB) => {
  if (FB) {
    // Inicializar listeners assim que Firebase está pronto
    subscribeSchedules();
    subscribeSuppliers();  // ← ESSENCIAL
    subscribeHistory();
  } else {
    console.warn('FB não inicializado após 15s. Tentando com localStorage (fallback).');
    try {
      state.schedules = loadJSON(STORAGE_SCHEDULES, []).filter((s) => !FAKE_SUPPLIERS.includes(s.supplier));
      state.suppliers = loadJSON(STORAGE_SUPPLIERS, []).filter((s) => !FAKE_SUPPLIERS.includes(s.name));
    } catch (e) {
      console.error('Erro ao carregar localStorage:', e);
    }
    // Mostrar notificação de modo offline
    toast('Modo offline: dados podem estar desatualizados. Verifique sua conexão.', 'error');
    render();
  }
});
```

---

## PATCH 4: Render quando suppliers mudam (ALTO)

**Arquivo:** app1.js  
**Problema:** Supplier atualizado no Firestore, mas UI não renderiza  
**Solução:** Chamar render quando suppliers mudam

### Antes (linhas 118-125):
```javascript
function subscribeSuppliers() {
  if (unsubSuppliers) { unsubSuppliers(); unsubSuppliers = null; }
  unsubSuppliers = window.FB.listenSuppliers((docs) => {
    state.suppliers = docs.filter((s) => !FAKE_SUPPLIERS.includes(s.name));
    // Falta render!
  });
}
```

### Depois:
```javascript
function subscribeSuppliers() {
  if (unsubSuppliers) { unsubSuppliers(); unsubSuppliers = null; }
  unsubSuppliers = window.FB.listenSuppliers((docs) => {
    state.suppliers = docs.filter((s) => !FAKE_SUPPLIERS.includes(s.name));
    // Renderizar se a view depende de suppliers
    if (state.currentView === 'suppliers' || state.currentView === 'calendar') {
      render();
    }
  });
}
```

---

## PATCH 5: Melhorar tratamento de erros com retry (CRÍTICO)

**Arquivo:** app1.js  
**Problema:** Firebase timeout (15s) sem retry  
**Solução:** Implementar retry exponencial

### Adicionar função de retry (antes de waitForFB, linha 130):
```javascript
function waitForFBWithRetry(maxRetries = 3, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let retries = 0;
    
    function attempt() {
      retries++;
      console.log(`Tentando inicializar Firebase (tentativa ${retries}/${maxRetries})...`);
      
      const startTime = Date.now();
      const timer = setInterval(() => {
        if (window.FB && window.FB.whenReady) {
          clearInterval(timer);
          console.log(`Firebase inicializado na tentativa ${retries}`);
          resolve(window.FB);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(timer);
          
          if (retries < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000); // backoff exponencial
            console.warn(`Tentativa ${retries} falhou. Tentando novamente em ${delay}ms...`);
            setTimeout(attempt, delay);
          } else {
            console.error(`Firebase não inicializou após ${maxRetries} tentativas. Usando fallback.`);
            resolve(null);
          }
        }
      }, 100);
    }
    
    attempt();
  });
}
```

### Atualizar inicialização (linhas 130-150):
```javascript
waitForFBWithRetry().then((FB) => {
  if (FB) {
    subscribeSchedules();
    subscribeSuppliers();
    subscribeHistory();
  } else {
    console.warn('Firebase não inicializado. Modo offline ativado.');
    showOfflineNotification();
    try {
      state.schedules = loadJSON(STORAGE_SCHEDULES, []).filter((s) => !FAKE_SUPPLIERS.includes(s.supplier));
      state.suppliers = loadJSON(STORAGE_SUPPLIERS, []).filter((s) => !FAKE_SUPPLIERS.includes(s.name));
    } catch (e) {
      console.error('Erro ao carregar localStorage:', e);
    }
    render();
  }
});

function showOfflineNotification() {
  const notif = document.createElement('div');
  notif.className = 'offline-banner';
  notif.innerHTML = `
    <i class="fas fa-wifi-slash"></i>
    <span>Modo offline. Dados podem estar desatualizados. Verifique sua conexão.</span>
  `;
  document.body.insertBefore(notif, document.body.firstChild);
  
  // Adicionar CSS
  const style = document.createElement('style');
  style.textContent = `
    .offline-banner {
      background: var(--status-cancelado);
      color: white;
      padding: 12px;
      text-align: center;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
  `;
  document.head.appendChild(style);
}
```

---

## PATCH 6: Sincronizar history offline (CRÍTICO)

**Arquivo:** app1.js  
**Problema:** Events offline não sincronizam ao voltar online  
**Solução:** Implementar fila de sincronização

### Adicionar ao state:
```javascript
let state = {
  // ... existente ...
  pendingHistoryEvents: [], // Eventos offline aguardando sincronização
};
```

### Atualizar addHistoryEvent:
```javascript
function addHistoryEvent(type, action, title, details) {
  const evt = {
    id: uid(),
    type,
    action,
    title,
    details,
    user: currentUser ? (currentUser.username) : 'Sistema',
    timestamp: new Date().toISOString(),
  };

  if (window.FB && window.FB.addHistoryEvent) {
    window.FB.addHistoryEvent({ cd: PAGE_CD, ...evt })
      .then(() => {
        // Sucesso
        console.log('Evento de história sincronizado:', evt.id);
      })
      .catch((err) => {
        console.error('Erro ao sincronizar evento de história:', err);
        // Guardar para sincronização posterior
        state.pendingHistoryEvents.push({ ...evt, cd: PAGE_CD });
        localStorage.setItem('paletes.pending_history_' + PAGE_CD, 
          JSON.stringify(state.pendingHistoryEvents));
      });
  } else {
    // Offline: guardar para sincronização posterior
    state.pendingHistoryEvents.push({ ...evt, cd: PAGE_CD });
    localStorage.setItem('paletes.pending_history_' + PAGE_CD, 
      JSON.stringify(state.pendingHistoryEvents));
  }
  
  // Atualizar UI imediatamente (optimistic)
  state.history.unshift(evt);
  if (state.history.length > 500) state.history = state.history.slice(0, 500);
  renderHistory();
}

// Função para sincronizar eventos pendentes
function syncPendingHistoryEvents() {
  if (!window.FB || !window.FB.addHistoryEvent || state.pendingHistoryEvents.length === 0) {
    return Promise.resolve();
  }

  const pending = [...state.pendingHistoryEvents];
  return Promise.all(
    pending.map(evt =>
      window.FB.addHistoryEvent(evt)
        .then(() => {
          state.pendingHistoryEvents = state.pendingHistoryEvents.filter(e => e.id !== evt.id);
        })
        .catch(err => {
          console.error('Erro ao sincronizar evento:', evt.id, err);
        })
    )
  ).then(() => {
    localStorage.setItem('paletes.pending_history_' + PAGE_CD,
      JSON.stringify(state.pendingHistoryEvents));
  });
}

// Chamar periodicamente (a cada 30s) ou quando voltar online
setInterval(() => {
  syncPendingHistoryEvents().catch(err => console.error('Erro ao sincronizar:', err));
}, 30000);
```

---

## PATCH 7: Remover ou validar funções no-op (ALTO)

**Arquivo:** app1.js  
**Problema:** Funções vazias podem confundir  
**Solução:** Remover ou adicionar throw

### Antes (linhas 165-167):
```javascript
function saveSchedules() { /* no-op: Firestore é a fonte da verdade */ }
function saveSuppliers() { /* no-op: Firestore é a fonte da verdade */ }
```

### Depois (remover completamente):
```javascript
// Removidas: saveSchedules() e saveSuppliers()
// Firestore é a fonte da verdade. Todas as mudanças devem passar por window.FB.*
```

---

## PATCH 8: Adicionar verificação de CD no payload (CRÍTICO)

**Arquivo:** firebase-init.js  
**Problema:** Sem validação de CD  
**Solução:** Validar CD no Firestore

### No file: firestore.rules, adicionar:
```javascript
match /schedules/{document=**} {
  allow create: if request.auth != null && request.resource.data.cd in ['cd1', 'cd2'];
  allow update: if request.auth != null && resource.data.cd in ['cd1', 'cd2'] && request.resource.data.cd == resource.data.cd;
  allow delete: if request.auth != null;
}
```

---

## RESUMO DOS PATCHES

| # | Arquivo | Severidade | Aplicar | Status |
|---|---------|-----------|---------|--------|
| 1 | app1.js | CRÍTICO | Deletar após Firestore confirmar | Pronto |
| 2 | app1.js | CRÍTICO | Optimistic updates + rollback | Pronto |
| 3 | app1.js | ALTO | Init suppliers vazio | Pronto |
| 4 | app1.js | ALTO | Render ao mudar suppliers | Pronto |
| 5 | app1.js | CRÍTICO | Retry com backoff | Pronto |
| 6 | app1.js | CRÍTICO | Sync history pendente | Pronto |
| 7 | app1.js | ALTO | Remover no-ops | Pronto |
| 8 | firestore.rules | CRÍTICO | Validação de CD | Pronto |

---

Aplicar estes patches em ordem para garantir consistência e evitar perda de dados.
