// ==========================================================================
// Painel de Configurações (hub — tela de login)
// Fornecedores, Usuários (acesso restrito ao Admin) e Backup.
// Todos os dados são persistidos no Firestore (sem localStorage).
// ==========================================================================

(function () {
  'use strict';

  var STORAGE_SUPPLIERS = 'paletes.suppliers'; // usado apenas para formatos legados de import
  var CD_SCHEDULE_KEYS = ['paletes.schedules.cd1', 'paletes.schedules.cd2'];
  var CD_HISTORY_KEYS = ['paletes.history.cd1', 'paletes.history.cd2'];

  // ---------- Helpers ----------
  function $(sel) { return document.querySelector(sel); }

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDateTimeBR(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Toast ----------
  var toastContainer = $('#toastContainer');
  function toast(message, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    var icon = kind === 'success' ? 'fa-check-circle' : kind === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = '<i class="fas ' + icon + '"></i><span></span>';
    t.querySelector('span').textContent = message;
    toastContainer.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      setTimeout(function () { t.remove(); }, 220);
    }, 3200);
  }

  // ---------- Histórico ----------
  function addHistoryEvent(type, action, title, details) {
    // Grava no Firestore (um evento por CD) para os listeners das app pages.
    if (window.FB && window.FB.addHistoryEvent) {
      var evt = { type: type, action: action, title: title, details: details, user: 'Admin' };
      ['cd1', 'cd2'].forEach(function (cd) {
        window.FB.addHistoryEvent({ cd: cd, ...evt }).catch(function (err) {
          console.error('addHistoryEvent (Firestore) failed:', err);
        });
      });
    }
  }

  // ---------- Overlay helpers ----------
  window.fecharOverlay = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  };

  var allOverlays = document.querySelectorAll('.modal-overlay');
  Array.prototype.forEach.call(allOverlays, function (overlay) {
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('open'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Array.prototype.forEach.call(document.querySelectorAll('.modal-overlay'), function (o) { o.classList.remove('open'); });
    }
  });

  // ==========================================================================
  // Modal principal de Configurações
  // ==========================================================================
  var modalConfig = $('#modalConfig');

  function resetModalConfig() {
    Array.prototype.forEach.call(configTabs, function (t) { t.classList.remove('active'); });
    Array.prototype.forEach.call(configPanes, function (p) { p.classList.remove('active'); });

    // esconder área de senha antiga e mostrar gestão de usuários diretamente
    var userSenhaArea = document.getElementById('userConfigSenhaArea');
    if (userSenhaArea) userSenhaArea.style.display = 'none';
    var userGestaoArea = document.getElementById('userConfigGestaoArea');
    if (userGestaoArea) userGestaoArea.style.display = 'block';

    var userFormAreaEl = document.getElementById('userConfigFormArea');
    if (userFormAreaEl) userFormAreaEl.classList.add('hidden');
    editingUserId = null;

    var supplierFormAreaEl = document.getElementById('supplierConfigFormArea');
    if (supplierFormAreaEl) supplierFormAreaEl.classList.add('hidden');

    var backupGestaoAreaEl = document.getElementById('backupConfigGestaoArea');
    if (backupGestaoAreaEl) backupGestaoAreaEl.style.display = 'block';

    pendingImportData = null;
    var backupConfirmEl = document.getElementById('backupConfigConfirm');
    if (backupConfirmEl) backupConfirmEl.classList.remove('open');
    var backupFileInputEl = document.getElementById('backupConfigFileInput');
    if (backupFileInputEl) backupFileInputEl.value = '';
  }

  window.abrirModalConfig = function () {
    // Abrir modal de autenticação (modal estilizado) antes de mostrar as configs
    var adminModal = document.getElementById('modalAdminAuth');
    if (!adminModal) {
      // fallback: abrir diretamente
      resetModalConfig();
      modalConfig.classList.add('open');
      setTimeout(function () { var el = document.getElementById('userConfigSenhaInput'); if (el) el.focus(); }, 120);
      return;
    }
    // abrir modal de autenticação e focar o campo
    adminModal.classList.add('open');
    setTimeout(function () {
      var pwd = document.getElementById('adminAuthPassword');
      if (pwd) pwd.focus();
    }, 100);
  };

  // Handlers do modal de autenticação (faz a validação e então abre o modal principal)
  (function() {
    var adminModal = document.getElementById('modalAdminAuth');
    if (!adminModal) return;
    var pwdInput = document.getElementById('adminAuthPassword');
    var submitBtn = document.getElementById('adminAuthSubmit');
    var cancelBtn = document.getElementById('adminAuthCancel');
    var closeBtn = document.getElementById('adminAuthClose');
    var errEl = document.getElementById('adminAuthError');

    function openConfigAfterAuth() {
      adminModal.classList.remove('open');
      resetModalConfig();
      modalConfig.classList.add('open');
      refreshUsers();
      setTimeout(function () { var el = document.getElementById('userConfigSenhaInput'); if (el) el.focus(); }, 120);
    }

    function validarAdminModal() {
      var pwd = pwdInput ? pwdInput.value : '';
      if (!pwd) return;
      window.FB.validateUser('admin', pwd).then(function (admin) {
        if (admin && admin.role === 'Admin') {
          if (errEl) errEl.style.display = 'none';
          pwdInput.value = '';
          openConfigAfterAuth();
        } else {
          if (errEl) errEl.style.display = 'block';
          pwdInput.value = '';
          pwdInput.focus();
        }
      }).catch(function () {
        if (errEl) errEl.style.display = 'block';
        pwdInput.value = '';
        pwdInput.focus();
      });
    }

    submitBtn.addEventListener('click', validarAdminModal);
    cancelBtn.addEventListener('click', function () { adminModal.classList.remove('open'); });
    closeBtn.addEventListener('click', function () { adminModal.classList.remove('open'); });
    pwdInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') validarAdminModal(); });
  })();

  // ---------- Abas ----------
  var configTabs = document.querySelectorAll('.config-tab');
  var configPanes = document.querySelectorAll('.config-pane');
  Array.prototype.forEach.call(configTabs, function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(configTabs, function (t) { t.classList.toggle('active', t === tab); });
      Array.prototype.forEach.call(configPanes, function (p) { p.classList.toggle('active', p.id === tab.dataset.tab); });
      if (tab.dataset.tab === 'configPaneFornecedores') renderSuppliersList();
      if (tab.dataset.tab === 'configPaneUsuarios') refreshUsers();
      if (tab.dataset.tab === 'configPaneBackup' && backupGestaoArea.style.display === 'block') renderBackupCurrentInfo();
    });
  });

  // ==========================================================================
  // Fornecedores
  // ==========================================================================
  var supplierList = $('#supplierConfigList');
  var addSupplierBtn = $('#addSupplierConfigBtn');
  var supplierFormArea = $('#supplierConfigFormArea');
  var supplierForm = $('#supplierConfigForm');
  var supplierFormTitle = $('#supplierConfigFormTitle');
  var supplierFormId = $('#supplierConfigId');
  var supplierNameInput = $('#supplierConfigName');
  var supplierPhoneInput = $('#supplierConfigPhone');
  var supplierEmailInput = $('#supplierConfigEmail');
  var cancelSupplierBtn = $('#cancelSupplierConfigBtn');

  // Fornecedores via Firestore (fonte da verdade). Cache local para renderização síncrona.
  var suppliersCache = [];
  var suppliersLoaded = false;

  function getSuppliers() {
    if (window.FB && typeof window.FB.listenSuppliers === 'function') {
      return suppliersCache;
    }
    return [];
  }

  function subscribeSuppliers() {
    // firebase-init.js é módulo (deferido): pode ainda não ter definido window.FB
    // quando este script roda. Espera até existir e então registra o listener.
    function register() {
      if (window.FB && typeof window.FB.listenSuppliers === 'function') {
        window.FB.listenSuppliers(function (docs) {
          suppliersCache = docs || [];
          suppliersLoaded = true;
          if (supplierList) renderSuppliersList();
        });
      } else {
        setTimeout(register, 100);
      }
    }
    register();
  }
  subscribeSuppliers();

  function renderSuppliersList() {
    var suppliers = getSuppliers();
    if (!suppliers.length) {
      supplierList.innerHTML = '<div class="empty-state"><i class="fas fa-truck"></i>Nenhum fornecedor cadastrado ainda.</div>';
      return;
    }
    supplierList.innerHTML = suppliers.map(function (s) {
      return `
        <div class="supplier-card">
          <div class="supplier-card-top">
            <div class="supplier-name">${escapeHtml(s.name)}</div>
          </div>
          <div class="supplier-meta">
            ${s.phone ? '<span><i class="fas fa-phone"></i>' + escapeHtml(s.phone) + '</span>' : ''}
            ${s.email ? '<span><i class="fas fa-envelope"></i>' + escapeHtml(s.email) + '</span>' : ''}
          </div>
          <div class="supplier-card-actions">
            <button type="button" class="btn btn-secondary" data-action="edit-supplier" data-id="${escapeHtml(s.id)}" style="flex:1;justify-content:center;">
              <i class="fas fa-pen"></i> Editar
            </button>
            <button type="button" class="btn btn-danger" data-action="delete-supplier" data-id="${escapeHtml(s.id)}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    supplierList.querySelectorAll('[data-action="edit-supplier"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openSupplierForm(btn.dataset.id); });
    });
    supplierList.querySelectorAll('[data-action="delete-supplier"]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteSupplier(btn.dataset.id); });
    });
  }

  addSupplierBtn.addEventListener('click', function () { openSupplierForm(null); });
  cancelSupplierBtn.addEventListener('click', function () { supplierFormArea.classList.add('hidden'); });

  function openSupplierForm(id) {
    var suppliers = getSuppliers();
    if (id) {
      var s = suppliers.find(function (sp) { return sp.id === id; });
      if (!s) return;
      supplierFormTitle.textContent = 'Editar Fornecedor';
      supplierFormId.value = s.id;
      supplierNameInput.value = s.name;
      supplierPhoneInput.value = s.phone || '';
      supplierEmailInput.value = s.email || '';
    } else {
      supplierFormTitle.textContent = 'Novo Fornecedor';
      supplierForm.reset();
      supplierFormId.value = '';
    }
    supplierFormArea.classList.remove('hidden');
    setTimeout(function () { supplierNameInput.focus(); }, 100);
  }

  supplierForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = supplierFormId.value;
    var payload = {
      name: supplierNameInput.value.trim(),
      phone: supplierPhoneInput.value.trim(),
      email: supplierEmailInput.value.trim(),
    };

    if (!payload.name) {
      toast('Informe o nome do fornecedor.', 'error');
      return;
    }
    if (suppliersCache.some(function (sp) { return sp.id !== id && sp.name.toLowerCase() === payload.name.toLowerCase(); })) {
      toast('Já existe um fornecedor com esse nome.', 'error');
      return;
    }

    try {
      if (id) {
        var s = suppliersCache.find(function (sp) { return sp.id === id; });
        if (!s) { toast('Fornecedor não encontrado.', 'error'); return; }
        var oldName = s.name;
        await window.FB.updateSupplier(id, { name: payload.name, phone: payload.phone, email: payload.email });
        if (oldName !== payload.name && window.FB.renameSupplier) {
          await window.FB.renameSupplier(oldName, payload.name);
        }
        addHistoryEvent('fornecedor', 'edicao', 'Fornecedor editado', payload.name + (payload.phone ? ' — ' + payload.phone : ''));
        toast('Fornecedor atualizado.', 'success');
      } else {
        await window.FB.createSupplier(payload);
        addHistoryEvent('fornecedor', 'criacao', 'Fornecedor cadastrado', payload.name + (payload.phone ? ' — ' + payload.phone : ''));
        toast('Fornecedor cadastrado.', 'success');
      }
    } catch (err) {
      console.error('Erro ao salvar fornecedor:', err);
      toast('Erro ao salvar fornecedor: ' + (err.message || err), 'error');
      return;
    }

    supplierFormArea.classList.add('hidden');
    renderSuppliersList();
  });

  async function deleteSupplier(id) {
    var s = suppliersCache.find(function (sp) { return sp.id === id; });
    if (!s) return;
    if (window.FB && window.FB.scheduleCountBySupplier) {
      var inUseCount = await window.FB.scheduleCountBySupplier(s.name);
      if (inUseCount > 0 && !confirm('"' + s.name + '" possui ' + inUseCount + ' agendamento(s) vinculado(s). Excluir mesmo assim?')) return;
    }
    try {
      await window.FB.deleteSupplier(id);
    } catch (err) {
      console.error('Erro ao excluir fornecedor:', err);
      toast('Erro ao excluir fornecedor.', 'error');
      return;
    }
    addHistoryEvent('fornecedor', 'exclusao', 'Fornecedor excluído', s.name);
    renderSuppliersList();
    toast('Fornecedor removido.', 'success');
  }

  // ==========================================================================
  // Usuários (Firestore: users/{username})
  // ==========================================================================
  var gestaoArea = $('#userConfigGestaoArea');
  var usersList = $('#userConfigList');
  var addUserBtn = $('#addUserConfigBtn');
  var userFormArea = $('#userConfigFormArea');
  var userForm = $('#userConfigForm');
  var userFormTitle = $('#userConfigFormTitle');
  var userFormId = $('#userConfigUserId');
  var userLoginInput = $('#userConfigUserLogin');
  var userPasswordInput = $('#userConfigUserPassword');
  var userRoleSelect = $('#userConfigUserRole');
  var passwordHint = $('#userConfigPasswordHint');
  var deleteUserBtn = $('#userConfigDeleteUser');
  var cancelUserBtn = $('#cancelUserConfigBtn');
  var editingUserId = null;

  var usersCache = {};
  var usersLoaded = false;

  function getUsers() {
    return usersCache;
  }

  function refreshUsers() {
    if (window.FB && window.FB.getUsersAll) {
      return window.FB.getUsersAll().then(function (users) {
        usersCache = users || {};
        usersLoaded = true;
        if (usersList) renderUsersList();
        return usersCache;
      });
    }
    usersLoaded = true;
    return Promise.resolve(usersCache);
  }

  function renderUsersList() {
    var users = getUsers();
    var keys = Object.keys(users);
    if (!keys.length) {
      usersList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i>Nenhum usuário cadastrado.</div>';
      return;
    }
    usersList.innerHTML = keys.map(function (key) {
      var u = users[key];
      var isAdmin = key === 'admin';
      return `
        <div class="user-card">
          <div class="user-card-top">
            <div>
              <div class="user-name">@${escapeHtml(u.username)}</div>
              <span class="user-role-badge ${u.role === 'Admin' ? 'admin' : ''}">${escapeHtml(u.role)}</span>
            </div>
            ${isAdmin ? '<div style="font-size:12px;color:var(--text-faint);"><i class="fas fa-lock" title="Administrador fixo"></i></div>' : ''}
          </div>
          ${isAdmin ? '' : '<div class="user-card-actions">\n            <button type="button" class="btn btn-secondary" data-action="edit-user" data-key="' + escapeHtml(key) + '" style="flex:1;justify-content:center;">\n              <i class="fas fa-pen"></i> Editar\n            </button>\n            <button type="button" class="btn btn-danger" data-action="delete-user" data-key="' + escapeHtml(key) + '">\n              <i class="fas fa-trash"></i>\n            </button>\n          </div>'}
        </div>
      `;
    }).join('');

    usersList.querySelectorAll('[data-action="edit-user"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openUserForm(btn.dataset.key); });
    });
    usersList.querySelectorAll('[data-action="delete-user"]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteUser(btn.dataset.key); });
    });
  }

  addUserBtn.addEventListener('click', function () { openUserForm(null); });
  cancelUserBtn.addEventListener('click', function () { userFormArea.classList.add('hidden'); });

  function openUserForm(key) {
    var users = getUsers();
    if (key === 'admin') {
      toast('Administrador é fixo e não pode ser editado.', 'error');
      return;
    }
    editingUserId = key || null;
    if (key && users[key]) {
      var u = users[key];
      userFormTitle.textContent = 'Editar Usuário';
      userFormId.value = key;
      userLoginInput.value = u.username;
      userLoginInput.disabled = true;
      userPasswordInput.value = '';
      userPasswordInput.required = false;
      passwordHint.style.display = 'block';
      userRoleSelect.value = u.role;
      deleteUserBtn.style.display = 'inline-flex';
    } else {
      userFormTitle.textContent = 'Novo Usuário';
      userForm.reset();
      userFormId.value = '';
      userLoginInput.disabled = false;
      userPasswordInput.required = true;
      passwordHint.style.display = 'none';
      userRoleSelect.value = 'Operador';
      deleteUserBtn.style.display = 'none';
    }
    userFormArea.classList.remove('hidden');
  }

  function closeUserForm() {
    userFormArea.classList.add('hidden');
    editingUserId = null;
  }

  function deleteUser(key) {
    var users = getUsers();
    if (!users[key]) return;
    if (key === 'admin') {
      toast('Não é possível excluir o administrador padrão.', 'error');
      return;
    }
    if (!confirm('Excluir o usuário "@' + users[key].username + '"?')) return;
    var deleted = users[key];
    window.FB.deleteUser(key).then(function () {
      addHistoryEvent('usuario', 'exclusao', 'Usuário excluído', '@' + deleted.username + ' — ' + deleted.role);
      return refreshUsers();
    }).then(function () {
      toast('Usuário excluído.', 'success');
    }).catch(function (err) {
      console.error('Erro ao excluir usuário:', err);
      toast('Erro ao excluir usuário.', 'error');
    });
  }

  deleteUserBtn.addEventListener('click', function () {
    if (editingUserId) deleteUser(editingUserId);
    closeUserForm();
  });

  userForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = userFormId.value;
    var login = userLoginInput.value.trim().toLowerCase();
    var password = userPasswordInput.value;
    var role = userRoleSelect.value;

    if (key === 'admin') {
      toast('Administrador é fixo e não pode ser alterado.', 'error');
      return;
    }

    if (!login || login.length < 3) {
      toast('Usuário deve ter pelo menos 3 caracteres.', 'error');
      return;
    }

    var p;
    if (key) {
      p = window.FB.updateUser(key, { password: password || null, role: role })
        .then(function () {
          addHistoryEvent('usuario', 'edicao', 'Usuário editado', '@' + login + ' — ' + role);
          toast('Usuário atualizado.', 'success');
        });
    } else {
      if (!password || password.length < 4) {
        toast('Senha deve ter pelo menos 4 caracteres.', 'error');
        return;
      }
      if (getUsers()[login]) {
        toast('Este nome de usuário já existe.', 'error');
        return;
      }
      p = window.FB.createUser(login, password, role)
        .then(function () {
          addHistoryEvent('usuario', 'criacao', 'Usuário criado', '@' + login + ' — ' + role);
          toast('Usuário criado.', 'success');
        });
    }

    p.then(function () {
      closeUserForm();
      return refreshUsers();
    }).catch(function (err) {
      console.error('Erro ao salvar usuário:', err);
      toast('Erro ao salvar usuário: ' + (err.message || err), 'error');
    });
  });

  // ==========================================================================
  // Backup (acesso restrito ao Admin — autenticado ao abrir as Configurações)
  // ==========================================================================

  var backupGestaoArea = $('#backupConfigGestaoArea');

  var backupCurrentInfo = $('#backupConfigCurrentInfo');
  var backupExportBtn = $('#backupConfigExportBtn');
  var backupImportBtn = $('#backupConfigImportBtn');
  var backupFileInput = $('#backupConfigFileInput');
  var backupConfirm = $('#backupConfigConfirm');
  var backupConfirmBody = $('#backupConfigConfirmBody');
  var pendingImportData = null;

  function collectBackupData() {
    // Dados atuais: fonte da verdade no Firestore.
    return { _meta: { version: 2, timestamp: new Date().toISOString(), app: 'paletes-agendamento', source: 'firestore' } };
  }

  function countRecords(data) {
    // Formato Firestore (exportAll): { schedules, suppliers, history }
    if (Array.isArray(data.schedules) || Array.isArray(data.history) || Array.isArray(data.suppliers)) {
      return {
        agendamentos: Array.isArray(data.schedules) ? data.schedules.length : 0,
        fornecedores: Array.isArray(data.suppliers) ? data.suppliers.length : 0,
        historico: Array.isArray(data.history) ? data.history.length : 0,
        usuarios: (data._users && typeof data._users === 'object') ? Object.keys(data._users).length : 0,
      };
    }
    // Formato legado (chaves localStorage em backup antigo)
    var agendamentos = 0;
    var historico = 0;
    CD_SCHEDULE_KEYS.forEach(function (key) {
      if (Array.isArray(data[key])) agendamentos += data[key].length;
    });
    CD_HISTORY_KEYS.forEach(function (key) {
      if (Array.isArray(data[key])) historico += data[key].length;
    });
    return {
      agendamentos: agendamentos,
      fornecedores: Array.isArray(data[STORAGE_SUPPLIERS]) ? data[STORAGE_SUPPLIERS].length : 0,
      historico: historico,
      usuarios: data._users ? Object.keys(data._users).length : 0,
    };
  }

  function backupInfoHtml(counts, ts) {
    return `
      <h4>Dados Atuais do Sistema</h4>
      <div class="backup-current-row"><span>Agendamentos</span><strong>${counts.agendamentos}</strong></div>
      <div class="backup-current-row"><span>Fornecedores</span><strong>${counts.fornecedores}</strong></div>
      <div class="backup-current-row"><span>Histórico de Atividades</span><strong>${counts.historico}</strong></div>
      <div class="backup-current-row"><span>Usuários</span><strong>${counts.usuarios}</strong></div>
      <div class="backup-current-row"><span>Último backup salvo</span><strong>${ts ? formatDateTimeBR(ts) : 'Nenhum'}</strong></div>
    `;
  }

  function renderBackupCurrentInfo() {
    if (window.FB && window.FB.exportAll) {
      window.FB.exportAll().then(function (d) {
        var counts = countRecords(d);
        backupCurrentInfo.innerHTML = backupInfoHtml(counts, (d._meta && d._meta.timestamp) || null);
      }).catch(function (err) {
        console.error('Erro ao consultar dados do Firestore:', err);
        var data = collectBackupData();
        backupCurrentInfo.innerHTML = backupInfoHtml(countRecords(data), data._meta ? data._meta.timestamp : null);
      });
      return;
    }
    var data = collectBackupData();
    backupCurrentInfo.innerHTML = backupInfoHtml(countRecords(data), data._meta ? data._meta.timestamp : null);
  }

  function exportBackup() {
    if (window.FB && window.FB.exportAll) {
      // Fonte da verdade: Firestore (schedules, suppliers, history)
      window.FB.exportAll().then(function (d) {
        d._meta = { version: 2, timestamp: new Date().toISOString(), app: 'paletes-agendamento', source: 'firestore' };
        return window.FB.getUsersAll().then(function (users) {
          d._users = users || {};
          downloadFile('backup_paletes_' + fmtDate(new Date()) + '_' + Date.now() + '.json', JSON.stringify(d, null, 2), 'application/json');
          toast('Backup exportado do Firestore!', 'success');
        });
      }).catch(function (err) {
        console.error('Erro ao exportar backup do Firestore:', err);
        toast('Erro ao exportar backup do Firestore.', 'error');
      });
    } else {
      var data = collectBackupData();
      downloadFile('backup_paletes_' + fmtDate(new Date()) + '_' + Date.now() + '.json', JSON.stringify(data, null, 2), 'application/json');
      toast('Backup exportado com sucesso!', 'success');
    }
  }

  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var backup = JSON.parse(e.target.result);
        if (!backup._meta || !backup._meta.timestamp) {
          toast('Arquivo de backup inválido ou formato antigo.', 'error');
          return;
        }

        var currentData = collectBackupData();
        var currentCounts = countRecords(currentData);
        var backupCounts = countRecords(backup);
        var backupDate = new Date(backup._meta.timestamp);
        var currentDate = new Date();

        var diffMs = currentDate - backupDate;
        var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        var isOlder = diffMs > 0;

        var warningHtml = '';
        if (isOlder && diffHours > 1) {
          var diffDays = Math.floor(diffHours / 24);
          var timeStr = diffDays > 0 ? diffDays + ' dia(s)' : diffHours + ' hora(s)';
          warningHtml = `
            <div style="background:rgba(255,92,92,0.1); border:1px solid rgba(255,92,92,0.3); border-radius:8px; padding:12px; margin-bottom:14px;">
              <p style="color:#ff5c5c; font-weight:600; margin:0 0 4px; font-size:13px;">
                <i class="fas fa-exclamation-triangle"></i> Atenção: Este backup é mais antigo
              </p>
              <p style="color:var(--text-muted); margin:0; font-size:12.5px;">
                Criado há ${timeStr} (${formatDateTimeBR(backup._meta.timestamp)}).
                Importar irá substituir os dados atuais mais recentes.
              </p>
            </div>
          `;
        }

        var rows = [
          ['Agendamentos', currentCounts.agendamentos, backupCounts.agendamentos],
          ['Fornecedores', currentCounts.fornecedores, backupCounts.fornecedores],
          ['Histórico', currentCounts.historico, backupCounts.historico],
          ['Usuários', currentCounts.usuarios, backupCounts.usuarios],
        ];

        backupConfirmBody.innerHTML = `
          ${warningHtml}
          <p style="font-size:13px; color:var(--text-muted); margin:0 0 12px;">
            <strong>Backup de:</strong> ${formatDateTimeBR(backup._meta.timestamp)}
          </p>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; font-size:12.5px; margin-bottom:14px;">
            <div style="font-weight:600; color:var(--text-faint);">Tipo</div>
            <div style="font-weight:600; color:var(--text-faint); text-align:center;">Atual</div>
            <div style="font-weight:600; color:var(--text-faint); text-align:center;">No Backup</div>
            ${rows.map(function (r) {
              return '<div style="color:var(--text-muted);">' + r[0] + '</div>' +
                '<div style="text-align:center; font-family:var(--font-mono); color:var(--text);">' + r[1] + '</div>' +
                '<div style="text-align:center; font-family:var(--font-mono); color:var(--text);">' + r[2] + '</div>';
            }).join('')}
          </div>
          <p style="font-size:12.5px; color:var(--text); margin:0; font-weight:600;">
            Os dados atuais serão SUBSTITUÍDOS. Um backup de segurança será salvo automaticamente antes da importação.
          </p>
        `;

        pendingImportData = backup;
        backupConfirm.classList.add('open');
      } catch (err) {
        toast('Arquivo de backup inválido.', 'error');
      }
      backupFileInput.value = '';
    };
    reader.readAsText(file);
  }

  async function executeImport() {
    if (!pendingImportData) return;
    var data = pendingImportData;
    var importData = { schedules: [], suppliers: [], history: [] };

    // Normaliza formatos: Firestore (schedules/suppliers/history) ou legado (chaves localStorage)
    if (Array.isArray(data.schedules)) {
      importData.schedules = data.schedules;
    } else {
      CD_SCHEDULE_KEYS.forEach(function (key, idx) {
        var cd = idx === 0 ? 'cd1' : 'cd2';
        var arr = Array.isArray(data[key]) ? data[key] : [];
        arr.forEach(function (s) { importData.schedules.push(Object.assign({}, s, { cd: s.cd || cd })); });
      });
    }
    if (Array.isArray(data.history)) {
      importData.history = data.history;
    } else {
      CD_HISTORY_KEYS.forEach(function (key, idx) {
        var cd = idx === 0 ? 'cd1' : 'cd2';
        var arr = Array.isArray(data[key]) ? data[key] : [];
        arr.forEach(function (h) { importData.history.push(Object.assign({}, h, { cd: h.cd || cd })); });
      });
    }
    if (Array.isArray(data.suppliers)) {
      importData.suppliers = data.suppliers;
    } else if (Array.isArray(data[STORAGE_SUPPLIERS])) {
      importData.suppliers = data[STORAGE_SUPPLIERS];
    }

    try {
      if (window.FB && window.FB.importAll) {
        await window.FB.importAll(importData);
      }
    } catch (err) {
      console.error('Erro ao importar backup no Firestore:', err);
      toast('Erro ao importar backup no Firestore.', 'error');
      return;
    }

    // Usuários importados para o Firestore
    var usersToImport = data._users || data['paletes.users'];
    if (usersToImport && typeof usersToImport === 'object' && window.FB) {
      var entries = Object.keys(usersToImport);
      for (var i = 0; i < entries.length; i++) {
        var uname = entries[i];
        var uobj = usersToImport[uname];
        try {
          var existing = await window.FB.getUser(uname);
          if (existing) {
            await window.FB.updateUser(uname, { role: uobj.role || 'Operador' });
          } else {
            await window.FB.createUser(uname, (uobj.password || 'Operador123'), (uobj.role || 'Operador'));
          }
        } catch (e) {
          console.error('Erro ao importar usuário ' + uname + ':', e);
        }
      }
    }

    pendingImportData = null;
    backupConfirm.classList.remove('open');
    toast('Backup importado com sucesso! Recarregando...', 'success');
    setTimeout(function () { window.location.reload(); }, 1200);
  }

  backupExportBtn.addEventListener('click', exportBackup);
  backupImportBtn.addEventListener('click', function () { backupFileInput.click(); });
  backupFileInput.addEventListener('change', function (e) { handleImportFile(e.target.files[0]); });
  $('#backupConfigCloseConfirm').addEventListener('click', function () { backupConfirm.classList.remove('open'); pendingImportData = null; });
  $('#backupConfigCancelImport').addEventListener('click', function () { backupConfirm.classList.remove('open'); pendingImportData = null; });
  $('#backupConfigConfirmImport').addEventListener('click', executeImport);
})();
