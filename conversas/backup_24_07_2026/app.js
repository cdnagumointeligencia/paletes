// ==========================================================================
// Controle de Retirada de Paletes — lógica da aplicação
// Persistência em localStorage. Sem dependências externas.
// ==========================================================================

(() => {
  'use strict';

  const TIME_SLOTS = ['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const STORAGE_SCHEDULES = 'paletes.schedules';
  const STORAGE_SUPPLIERS = 'paletes.suppliers';

  const WEEKDAYS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  // ---------- State ----------
  let state = {
    schedules: loadJSON(STORAGE_SCHEDULES, seedSchedules()),
    suppliers: loadJSON(STORAGE_SUPPLIERS, seedSuppliers()),
    currentDate: new Date(),
    currentView: 'calendar',
    editingScheduleId: null,
    editingSupplierId: null,
    pendingDeleteId: null,
    searchQuery: '',
  };
  saveSchedules();
  saveSuppliers();

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function saveSchedules() { localStorage.setItem(STORAGE_SCHEDULES, JSON.stringify(state.schedules)); }
  function saveSuppliers() { localStorage.setItem(STORAGE_SUPPLIERS, JSON.stringify(state.suppliers)); }

  function seedSuppliers() {
    return [
      { id: uid(), name: 'Distribuidora Vale Verde', category: 'Carreta', phone: '(11) 3456-7890', email: 'contato@valeverde.com.br' },
      { id: uid(), name: 'Transportes Rota Norte', category: 'Truck', phone: '(11) 2345-6789', email: 'operacoes@rotanorte.com.br' },
      { id: uid(), name: 'Log Express Paulista', category: 'Carreta', phone: '(11) 4567-8901', email: 'contato@logexpress.com.br' },
    ];
  }

  function seedSchedules() {
    const today = fmtDate(new Date());
    return [
      { id: uid(), date: today, time: '09:00', supplier: 'Distribuidora Vale Verde', pallets: 42, driver: 'Carlos Mendes', plate: 'ABC-1234', status: 'Confirmado', cd: 'cd1', notes: '', createdBy: 'admin' },
      { id: uid(), date: today, time: '14:00', supplier: 'Transportes Rota Norte', pallets: 18, driver: 'Roberto Silva', plate: 'DEF5678', status: 'Agendado', cd: 'cd1', notes: '', createdBy: 'admin' },
    ];
  }

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  // ---------- Date helpers ----------
  function fmtDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const els = {
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebarToggle'),
    mobileMenuBtn: $('#mobileMenuBtn'),
    sidebarUserName: $('#sidebarUserName'),
    sidebarUserRole: $('#sidebarUserRole'),
    logoutBtn: $('#logoutBtn'),
    navItems: document.querySelectorAll('.nav-item'),
    views: {
      calendar: $('#calendarView'),
      list: $('#listView'),
      suppliers: $('#suppliersView'),
      reports: $('#reportsView'),
      settings: $('#settingsView'),
    },
    currentDate: $('#currentDate'),
    prevDay: $('#prevDay'),
    nextDay: $('#nextDay'),
    todayBtn: $('#todayBtn'),
    searchInput: $('#searchInput'),
    newScheduleBtn: $('#newScheduleBtn'),

    statLivre: $('#statLivre'),
    statAgendado: $('#statAgendado'),
    statConfirmado: $('#statConfirmado'),
    statCancelado: $('#statCancelado'),
    statPaletes: $('#statPaletes'),

    timeSlots: $('#timeSlots'),
    daySlots: $('#daySlots'),
    dayName: $('#dayName'),
    dayNumber: $('#dayNumber'),

    statusFilter: $('#statusFilter'),
    exportBtn: $('#exportBtn'),
    scheduleListBody: $('#scheduleListBody'),

    addSupplierBtn: $('#addSupplierBtn'),
    suppliersList: $('#suppliersList'),

    dailyReportBtn: $('#dailyReportBtn'),
    monthlyReportBtn: $('#monthlyReportBtn'),
    supplierReportBtn: $('#supplierReportBtn'),
    reportOutput: $('#reportOutput'),

    scheduleModal: $('#scheduleModal'),
    modalTitle: $('#modalTitle'),
    scheduleForm: $('#scheduleForm'),
    scheduleId: $('#scheduleId'),
    scheduleDate: $('#scheduleDate'),
    scheduleTime: $('#scheduleTime'),
    supplierInput: $('#supplier'),
    supplierSuggestions: $('#supplierSuggestions'),
    pallets: $('#pallets'),
    driver: $('#driver'),
    plate: $('#plate'),
    status: $('#status'),
    notes: $('#notes'),
    scheduleCD: $('#scheduleCD'),
    closeModal: $('#closeModal'),
    cancelBtn: $('#cancelBtn'),
    deleteBtn: $('#deleteBtn'),

    confirmModal: $('#confirmModal'),
    closeConfirmModal: $('#closeConfirmModal'),
    confirmDetails: $('#confirmDetails'),
    cancelConfirmBtn: $('#cancelConfirmBtn'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),

    supplierModal: $('#supplierModal'),
    supplierModalTitle: $('#supplierModalTitle'),
    supplierForm: $('#supplierForm'),
    supplierId: $('#supplierId'),
    supplierName: $('#supplierName'),
    supplierCategory: $('#supplierCategory'),
    supplierPhone: $('#supplierPhone'),
    supplierEmail: $('#supplierEmail'),
    closeSupplierModal: $('#closeSupplierModal'),
    cancelSupplierBtn: $('#cancelSupplierBtn'),

    toastContainer: $('#toastContainer'),
    themeToggle: $('#themeToggle'),
    navSettings: $('#navSettings'),
    usersList: $('#usersList'),
    addUserBtn: $('#addUserBtn'),
    userModal: $('#userModal'),
    userModalTitle: $('#userModalTitle'),
    userForm: $('#userForm'),
    userId: $('#userId'),
    userLogin: $('#userLogin'),
    userNome: $('#userNome'),
    userPassword: $('#userPassword'),
    userRole: $('#userRole'),
    closeUserModal: $('#closeUserModal'),
    cancelUserBtn: $('#cancelUserBtn'),
    deleteUserBtn: $('#deleteUserBtn'),
  };

  // ---------- Theme ----------
  const STORAGE_THEME = 'paletes.theme';
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = els.themeToggle.querySelector('i');
    icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    els.themeToggle.setAttribute('aria-label', theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro');
    localStorage.setItem(STORAGE_THEME, theme);
  }
  applyTheme(localStorage.getItem(STORAGE_THEME) === 'light' ? 'light' : 'dark');
  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });

  // ---------- User session ----------
  function loadSession() {
    try {
      var raw = localStorage.getItem('paletes.session');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
  }

  const currentUser = loadSession();
  if (currentUser) {
    els.sidebarUserName.textContent = currentUser.nome || currentUser.username;
    els.sidebarUserRole.textContent = currentUser.role || '';
  }

  els.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('paletes.session');
    window.location.href = 'login.html';
  });

  // ---------- Toasts ----------
  function toast(message, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    const icon = kind === 'success' ? 'fa-check-circle' : kind === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
    t.querySelector('span').textContent = message;
    els.toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      setTimeout(() => t.remove(), 220);
    }, 3200);
  }

  // ---------- Navigation / views ----------
  function switchView(view) {
    state.currentView = view;
    Object.entries(els.views).forEach(([key, el]) => el.classList.toggle('hidden', key !== view));
    els.navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    render();
    if (window.innerWidth <= 900) els.sidebar.classList.remove('mobile-open');
  }

  els.navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  els.sidebarToggle.addEventListener('click', () => els.sidebar.classList.toggle('collapsed'));
  els.mobileMenuBtn.addEventListener('click', () => els.sidebar.classList.toggle('mobile-open'));

  els.prevDay.addEventListener('click', () => { state.currentDate.setDate(state.currentDate.getDate() - 1); render(); });
  els.nextDay.addEventListener('click', () => { state.currentDate.setDate(state.currentDate.getDate() + 1); render(); });
  els.todayBtn.addEventListener('click', () => { state.currentDate = new Date(); render(); });

  els.searchInput.addEventListener('input', (e) => { state.searchQuery = e.target.value.trim().toLowerCase(); renderList(); });
  els.statusFilter.addEventListener('change', renderList);
  els.exportBtn.addEventListener('click', exportCSV);

  // ---------- Header date ----------
  function renderHeaderDate() {
    const d = state.currentDate;
    els.currentDate.textContent = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
    els.dayName.textContent = WEEKDAYS[d.getDay()].slice(0, 3).toUpperCase();
    els.dayNumber.textContent = d.getDate();
  }

  // ---------- Stats ----------
  function schedulesForDate(dateStr) {
    return state.schedules.filter((s) => s.date === dateStr);
  }

  function renderStats() {
    const dateStr = fmtDate(state.currentDate);
    const todays = schedulesForDate(dateStr);
    const agendado = todays.filter((s) => s.status === 'Agendado').length;
    const confirmado = todays.filter((s) => s.status === 'Confirmado').length;
    const cancelado = todays.filter((s) => s.status === 'Cancelado').length;
    const ocupados = new Set(todays.filter((s) => s.status !== 'Cancelado').map((s) => s.time));
    const livre = TIME_SLOTS.length - ocupados.size;
    const totalPaletes = todays.filter((s) => s.status !== 'Cancelado').reduce((sum, s) => sum + Number(s.pallets || 0), 0);

    els.statLivre.textContent = livre;
    els.statAgendado.textContent = agendado;
    els.statConfirmado.textContent = confirmado;
    els.statCancelado.textContent = cancelado;
    els.statPaletes.textContent = totalPaletes;
  }

  // ---------- Calendar view ----------
  function renderCalendar() {
    els.timeSlots.innerHTML = TIME_SLOTS.map((t) => `<div class="time-slot">${t}</div>`).join('');
    const dateStr = fmtDate(state.currentDate);
    const todays = schedulesForDate(dateStr);

    els.daySlots.innerHTML = TIME_SLOTS.map((time) => {
      const entry = todays.find((s) => s.time === time && s.status !== 'Cancelado');
      const cancelledEntry = !entry ? todays.find((s) => s.time === time && s.status === 'Cancelado') : null;

      if (entry) {
        return `
          <div class="day-slot-row">
            <div class="slot-card status-${entry.status.toLowerCase()}" data-id="${entry.id}">
              <div class="slot-supplier">${escapeHtml(entry.supplier)}</div>
              <div class="slot-meta">
                <span>${entry.pallets} pl</span>
                <span>${escapeHtml(entry.driver)}</span>
                <span class="cd-tag">${(entry.cd || 'cd1').toUpperCase()}</span>
                <span class="status-pill ${entry.status}">${entry.status}</span>
              </div>
              ${entry.createdBy ? '<div class="slot-created-by"><i class="fas fa-user"></i> ' + escapeHtml(entry.createdBy) + '</div>' : ''}
            </div>
          </div>`;
      }
      return `
        <div class="day-slot-row">
          <button type="button" class="slot-empty" data-time="${time}">
            <i class="fas fa-plus"></i> ${cancelledEntry ? 'Reagendar' : 'Livre — agendar'}
          </button>
        </div>`;
    }).join('');

    els.daySlots.querySelectorAll('.slot-card').forEach((card) => {
      card.addEventListener('click', () => openScheduleModal(card.dataset.id));
    });
    els.daySlots.querySelectorAll('.slot-empty').forEach((btn) => {
      btn.addEventListener('click', () => openScheduleModal(null, dateStr, btn.dataset.time));
    });
  }

  // ---------- List view ----------
  function renderList() {
    const statusFilterValue = els.statusFilter.value;
    let rows = [...state.schedules].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (statusFilterValue !== 'all') rows = rows.filter((s) => s.status === statusFilterValue);
    if (state.searchQuery) {
      const q = state.searchQuery;
      rows = rows.filter((s) =>
        s.supplier.toLowerCase().includes(q) ||
        s.driver.toLowerCase().includes(q) ||
        s.plate.toLowerCase().includes(q) ||
        s.date.includes(q)
      );
    }

    if (!rows.length) {
      els.scheduleListBody.innerHTML = `<tr class="empty-row"><td colspan="8">Nenhum agendamento encontrado.</td></tr>`;
      return;
    }

    els.scheduleListBody.innerHTML = rows.map((s) => `
      <tr>
        <td class="mono">${formatDateBR(s.date)}<br>${s.time}</td>
        <td>${escapeHtml(s.supplier)}</td>
        <td class="mono">${s.pallets}</td>
        <td><span class="cd-tag">${(s.cd || 'cd1').toUpperCase()}</span></td>
        <td>${escapeHtml(s.driver)}</td>
        <td class="mono">${escapeHtml(s.plate)}</td>
        <td><span class="status-pill ${s.status}">${s.status}</span></td>
        <td>
          <div class="table-actions">
            <button class="icon-btn" data-action="edit" data-id="${s.id}" aria-label="Editar"><i class="fas fa-pen"></i></button>
            <button class="icon-btn danger" data-action="delete" data-id="${s.id}" aria-label="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');

    els.scheduleListBody.querySelectorAll('[data-action="edit"]').forEach((btn) =>
      btn.addEventListener('click', () => openScheduleModal(btn.dataset.id)));
    els.scheduleListBody.querySelectorAll('[data-action="delete"]').forEach((btn) =>
      btn.addEventListener('click', () => requestDelete(btn.dataset.id)));
  }

  function formatDateBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function exportCSV() {
    if (!state.schedules.length) { toast('Não há agendamentos para exportar.', 'error'); return; }
    const header = ['Data', 'Horário', 'Fornecedor', 'Paletes', 'Motorista', 'Placa', 'Status', 'Observações'];
    const rows = [...state.schedules]
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((s) => [s.date, s.time, s.supplier, s.pallets, s.driver, s.plate, s.status, (s.notes || '').replace(/\n/g, ' ')]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(';')).join('\r\n');
    downloadFile(`agendamentos_paletes_${fmtDate(new Date())}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
    toast('Arquivo CSV exportado.', 'success');
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Suppliers view ----------
  function renderSuppliers() {
    if (!state.suppliers.length) {
      els.suppliersList.innerHTML = `<div class="empty-state"><i class="fas fa-truck"></i>Nenhum fornecedor cadastrado ainda.</div>`;
      return;
    }
    els.suppliersList.innerHTML = state.suppliers.map((s) => `
      <div class="supplier-card">
        <div class="supplier-card-top">
          <div>
            <div class="supplier-name">${escapeHtml(s.name)}</div>
            <span class="supplier-category">${s.category}</span>
          </div>
        </div>
        <div class="supplier-meta">
          ${s.phone ? `<span><i class="fas fa-phone"></i>${escapeHtml(s.phone)}</span>` : ''}
          ${s.email ? `<span><i class="fas fa-envelope"></i>${escapeHtml(s.email)}</span>` : ''}
        </div>
        <div class="supplier-card-actions">
          <button class="btn btn-secondary" data-action="edit-supplier" data-id="${s.id}" style="flex:1;justify-content:center;">
            <i class="fas fa-pen"></i> Editar
          </button>
          <button class="btn btn-danger" data-action="delete-supplier" data-id="${s.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    els.suppliersList.querySelectorAll('[data-action="edit-supplier"]').forEach((btn) =>
      btn.addEventListener('click', () => openSupplierModal(btn.dataset.id)));
    els.suppliersList.querySelectorAll('[data-action="delete-supplier"]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const supplier = state.suppliers.find((sp) => sp.id === btn.dataset.id);
        if (!supplier) return;
        const inUse = state.schedules.some((s) => s.supplier === supplier.name);
        if (inUse && !confirm(`"${supplier.name}" possui agendamentos vinculados. Excluir mesmo assim?`)) return;
        state.suppliers = state.suppliers.filter((sp) => sp.id !== supplier.id);
        saveSuppliers();
        renderSuppliers();
        toast('Fornecedor removido.', 'success');
      }));
  }

  els.addSupplierBtn.addEventListener('click', () => openSupplierModal(null));

  function openSupplierModal(id) {
    state.editingSupplierId = id;
    if (id) {
      const s = state.suppliers.find((sp) => sp.id === id);
      els.supplierModalTitle.textContent = 'Editar Fornecedor';
      els.supplierId.value = s.id;
      els.supplierName.value = s.name;
      els.supplierCategory.value = s.category;
      els.supplierPhone.value = s.phone || '';
      els.supplierEmail.value = s.email || '';
    } else {
      els.supplierModalTitle.textContent = 'Novo Fornecedor';
      els.supplierForm.reset();
      els.supplierId.value = '';
    }
    els.supplierModal.classList.add('open');
  }
  function closeSupplierModal() { els.supplierModal.classList.remove('open'); }
  els.closeSupplierModal.addEventListener('click', closeSupplierModal);
  els.cancelSupplierBtn.addEventListener('click', closeSupplierModal);

  els.supplierForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = els.supplierId.value;
    const payload = {
      name: els.supplierName.value.trim(),
      category: els.supplierCategory.value,
      phone: els.supplierPhone.value.trim(),
      email: els.supplierEmail.value.trim(),
    };
    if (id) {
      const s = state.suppliers.find((sp) => sp.id === id);
      const oldName = s.name;
      Object.assign(s, payload);
      if (oldName !== payload.name) {
        state.schedules.forEach((sch) => { if (sch.supplier === oldName) sch.supplier = payload.name; });
        saveSchedules();
      }
      toast('Fornecedor atualizado.', 'success');
    } else {
      state.suppliers.push({ id: uid(), ...payload });
      toast('Fornecedor cadastrado.', 'success');
    }
    saveSuppliers();
    closeSupplierModal();
    renderSuppliers();
  });

  // ---------- Reports ----------
  els.dailyReportBtn.addEventListener('click', () => {
    const dateStr = fmtDate(state.currentDate);
    const rows = schedulesForDate(dateStr).sort((a, b) => a.time.localeCompare(b.time));
    const total = rows.filter((r) => r.status !== 'Cancelado').reduce((s, r) => s + Number(r.pallets), 0);
    els.reportOutput.classList.remove('hidden');
    els.reportOutput.innerHTML = `
      <h4>Relatório Diário — ${formatDateBR(dateStr)}</h4>
      <div class="report-summary-line"><span>Total de agendamentos</span><strong>${rows.length}</strong></div>
      <div class="report-summary-line"><span>Total de paletes (excl. cancelados)</span><strong>${total}</strong></div>
      ${renderReportTable(rows)}
    `;
  });

  els.monthlyReportBtn.addEventListener('click', () => {
    const y = state.currentDate.getFullYear(), m = state.currentDate.getMonth();
    const rows = state.schedules.filter((s) => {
      const d = parseDate(s.date);
      return d.getFullYear() === y && d.getMonth() === m;
    }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const total = rows.filter((r) => r.status !== 'Cancelado').reduce((s, r) => s + Number(r.pallets), 0);
    els.reportOutput.classList.remove('hidden');
    els.reportOutput.innerHTML = `
      <h4>Relatório Mensal — ${MONTHS[m]} de ${y}</h4>
      <div class="report-summary-line"><span>Total de agendamentos</span><strong>${rows.length}</strong></div>
      <div class="report-summary-line"><span>Total de paletes (excl. cancelados)</span><strong>${total}</strong></div>
      ${renderReportTable(rows)}
    `;
  });

  els.supplierReportBtn.addEventListener('click', () => {
    const bySupplier = {};
    state.schedules.forEach((s) => {
      if (!bySupplier[s.supplier]) bySupplier[s.supplier] = { count: 0, pallets: 0 };
      bySupplier[s.supplier].count++;
      if (s.status !== 'Cancelado') bySupplier[s.supplier].pallets += Number(s.pallets);
    });
    const names = Object.keys(bySupplier).sort();
    els.reportOutput.classList.remove('hidden');
    if (!names.length) {
      els.reportOutput.innerHTML = `<h4>Histórico por Fornecedor</h4><p style="color:var(--text-muted);font-size:13px;">Nenhum dado disponível.</p>`;
      return;
    }
    els.reportOutput.innerHTML = `
      <h4>Histórico por Fornecedor</h4>
      <table>
        <thead><tr><th>Fornecedor</th><th>Agendamentos</th><th>Paletes (excl. cancelados)</th></tr></thead>
        <tbody>
          ${names.map((n) => `<tr><td>${escapeHtml(n)}</td><td>${bySupplier[n].count}</td><td>${bySupplier[n].pallets}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  });

  function renderReportTable(rows) {
    if (!rows.length) return `<p style="color:var(--text-muted);font-size:13px;">Nenhum agendamento no período.</p>`;
    return `
      <table>
        <thead><tr><th>Horário</th><th>Fornecedor</th><th>Paletes</th><th>CD</th><th>Motorista</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td class="mono">${r.time}</td><td>${escapeHtml(r.supplier)}</td><td class="mono">${r.pallets}</td><td><span class="cd-tag">${(r.cd || 'cd1').toUpperCase()}</span></td><td>${escapeHtml(r.driver)}</td><td><span class="status-pill ${r.status}">${r.status}</span></td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  // ---------- Schedule modal ----------
  els.newScheduleBtn.addEventListener('click', () => openScheduleModal(null, fmtDate(state.currentDate)));

  function openScheduleModal(id, presetDate, presetTime) {
    state.editingScheduleId = id;
    els.scheduleForm.reset();
    els.supplierSuggestions.classList.remove('open');

    if (id) {
      const s = state.schedules.find((sc) => sc.id === id);
      els.modalTitle.textContent = 'Editar Agendamento';
      els.scheduleId.value = s.id;
      els.scheduleDate.value = s.date;
      els.scheduleTime.value = s.time;
      els.supplierInput.value = s.supplier;
      els.pallets.value = s.pallets;
      els.driver.value = s.driver;
      els.plate.value = s.plate;
      els.status.value = s.status;
      els.scheduleCD.value = s.cd || 'cd1';
      els.notes.value = s.notes || '';
      els.deleteBtn.style.display = 'inline-flex';
    } else {
      els.modalTitle.textContent = 'Novo Agendamento';
      els.scheduleId.value = '';
      els.scheduleDate.value = presetDate || fmtDate(state.currentDate);
      if (presetTime) els.scheduleTime.value = presetTime;
      els.status.value = 'Agendado';
      els.scheduleCD.value = 'cd1';
      els.deleteBtn.style.display = 'none';
    }
    els.scheduleModal.classList.add('open');
    setTimeout(() => els.supplierInput.focus(), 50);
  }

  function closeScheduleModal() { els.scheduleModal.classList.remove('open'); }
  els.closeModal.addEventListener('click', closeScheduleModal);
  els.cancelBtn.addEventListener('click', closeScheduleModal);

  els.deleteBtn.addEventListener('click', () => {
    if (state.editingScheduleId) requestDelete(state.editingScheduleId);
    closeScheduleModal();
  });

  // Plate auto-uppercase
  els.plate.addEventListener('input', () => {
    const pos = els.plate.selectionStart;
    els.plate.value = els.plate.value.toUpperCase();
    els.plate.setSelectionRange(pos, pos);
  });

  // Supplier autocomplete
  els.supplierInput.addEventListener('input', () => {
    const q = els.supplierInput.value.trim().toLowerCase();
    if (!q) { els.supplierSuggestions.classList.remove('open'); return; }
    const matches = state.suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { els.supplierSuggestions.classList.remove('open'); return; }
    els.supplierSuggestions.innerHTML = matches.map((s) => `<div data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join('');
    els.supplierSuggestions.classList.add('open');
    els.supplierSuggestions.querySelectorAll('div').forEach((d) => {
      d.addEventListener('click', () => {
        els.supplierInput.value = d.dataset.name;
        els.supplierSuggestions.classList.remove('open');
      });
    });
  });
  document.addEventListener('click', (e) => {
    if (!els.supplierInput.contains(e.target) && !els.supplierSuggestions.contains(e.target)) {
      els.supplierSuggestions.classList.remove('open');
    }
  });

  els.scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const pallets = Number(els.pallets.value);
    if (pallets > 1000) {
      toast('Máximo de 1000 paletes por slot.', 'error');
      return;
    }

    const payload = {
      date: els.scheduleDate.value,
      time: els.scheduleTime.value,
      supplier: els.supplierInput.value.trim(),
      pallets,
      driver: els.driver.value.trim(),
      plate: els.plate.value.trim().toUpperCase(),
      status: els.status.value,
      cd: els.scheduleCD.value,
      notes: els.notes.value.trim(),
      createdBy: currentUser ? currentUser.username : 'unknown',
    };

    // Conflict check: same date+time, active status, different id
    const conflict = state.schedules.find((s) =>
      s.date === payload.date && s.time === payload.time && s.status !== 'Cancelado' && s.id !== els.scheduleId.value
    );
    if (conflict) {
      toast(`Horário ${payload.time} já ocupado por ${conflict.supplier}.`, 'error');
      return;
    }

    // Auto-register new supplier if unknown
    if (!state.suppliers.some((s) => s.name.toLowerCase() === payload.supplier.toLowerCase())) {
      state.suppliers.push({ id: uid(), name: payload.supplier, category: 'Truck', phone: '', email: '' });
      saveSuppliers();
    }

    if (els.scheduleId.value) {
      const s = state.schedules.find((sc) => sc.id === els.scheduleId.value);
      const oldStatus = s.status;
      Object.assign(s, payload);
      if (payload.status === 'Confirmado' && oldStatus !== 'Confirmado') {
        registerStockExit(s);
      }
      toast('Agendamento atualizado.', 'success');
    } else {
      state.schedules.push({ id: uid(), ...payload });
      if (payload.status === 'Confirmado') {
        registerStockExit(state.schedules[state.schedules.length - 1]);
      }
      toast('Agendamento criado.', 'success');
    }
    saveSchedules();
    closeScheduleModal();
    render();
  });

  // ---------- Delete confirmation ----------
  function requestDelete(id) {
    const s = state.schedules.find((sc) => sc.id === id);
    if (!s) return;
    state.pendingDeleteId = id;
    els.confirmDetails.textContent = `${formatDateBR(s.date)} às ${s.time} — ${s.supplier} (${s.pallets} paletes)`;
    els.confirmModal.classList.add('open');
  }
  function closeConfirmModal() { els.confirmModal.classList.remove('open'); state.pendingDeleteId = null; }
  els.closeConfirmModal.addEventListener('click', closeConfirmModal);
  els.cancelConfirmBtn.addEventListener('click', closeConfirmModal);
  els.confirmDeleteBtn.addEventListener('click', () => {
    if (!state.pendingDeleteId) return;
    state.schedules = state.schedules.filter((s) => s.id !== state.pendingDeleteId);
    saveSchedules();
    closeConfirmModal();
    render();
    toast('Agendamento excluído. Horário liberado.', 'success');
  });

  // ---------- Stock integration ----------
  function registerStockExit(schedule) {
    const STOCK_KEY = 'nagumo_paletes_v1';
    let stockState;
    try {
      const raw = localStorage.getItem(STOCK_KEY);
      if (!raw) { toast('Estoque não encontrado no gerenciamento.', 'error'); return; }
      stockState = JSON.parse(raw);
      if (!stockState.cds || !stockState.cds[schedule.cd]) { toast('CD "' + schedule.cd + '" não encontrado no estoque.', 'error'); return; }
    } catch (e) {
      toast('Erro ao ler estoque do gerenciamento.', 'error');
      return;
    }

    const cd = stockState.cds[schedule.cd];
    const estoqueChep = cd.estoqueChep || 0;
    const estoquePbr = cd.estoquePbr || 0;
    const totalEstoque = estoqueChep + estoquePbr;

    if (totalEstoque <= 0) {
      toast('Estoque zerado no ' + cd.nome + '. Não é possível registrar saída.', 'error');
      return;
    }

    let qtdRestante = schedule.pallets;
    let movimentos = [];
    let tipoUsado = '';

    if (estoqueChep >= qtdRestante) {
      cd.estoqueChep -= qtdRestante;
      movimentos.push({ tipo: 'CHEP', qtd: qtdRestante });
      tipoUsado = 'CHEP';
      qtdRestante = 0;
    } else if (estoqueChep > 0) {
      movimentos.push({ tipo: 'CHEP', qtd: estoqueChep });
      tipoUsado = 'CHEP';
      qtdRestante -= estoqueChep;
      cd.estoqueChep = 0;
    }

    if (qtdRestante > 0) {
      if (estoquePbr >= qtdRestante) {
        cd.estoquePbr -= qtdRestante;
        movimentos.push({ tipo: 'PBR', qtd: qtdRestante });
        if (!tipoUsado) tipoUsado = 'PBR';
        qtdRestante = 0;
      } else {
        const disponivel = estoquePbr;
        if (disponivel > 0) {
          movimentos.push({ tipo: 'PBR', qtd: disponivel });
          if (!tipoUsado) tipoUsado = 'PBR';
          qtdRestante -= disponivel;
          cd.estoquePbr = 0;
        }
      }
    }

    if (qtdRestante > 0) {
      const totalDisponivel = totalEstoque;
      toast('Estoque insuficiente para ' + schedule.pallets + ' paletes. Disponível: ' + totalDisponivel + '. Saída parcial registrada.', 'error');
    }

    movimentos.forEach(function(m) {
      cd.historico.unshift({
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        dataHora: new Date().toISOString(),
        tipoPalete: m.tipo,
        movimento: 'Saída',
        quantidade: m.qtd,
        observacao: 'Baixa automática — agendamento ' + schedule.supplier + ' (' + schedule.date + ' ' + schedule.time + ')'
      });
    });

    try {
      localStorage.setItem(STOCK_KEY, JSON.stringify(stockState));
      const totalBaixado = schedule.pallets - qtdRestante;
      toast('Baixa de ' + totalBaixado + ' paletes registrada em ' + cd.nome + '.', 'success');
    } catch (e) {
      toast('Erro ao salvar estoque.', 'error');
    }
  }

  // ---------- Escape helper ----------
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Close modals on overlay click / Escape
  [els.scheduleModal, els.confirmModal, els.supplierModal].forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.scheduleModal.classList.remove('open');
      els.confirmModal.classList.remove('open');
      els.supplierModal.classList.remove('open');
      els.userModal.classList.remove('open');
    }
  });

  // ---------- User management ----------
  const USERS_KEY = 'paletes.users';
  let editingUserId = null;

  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {
      admin: { username: 'admin', password: 'admin123', role: 'Admin', nome: 'Administrador' },
      operador: { username: 'operador', password: 'op123', role: 'Operador', nome: 'Operador' }
    };
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function renderSettings() {
    const users = loadUsers();
    const keys = Object.keys(users);
    const list = els.usersList;

    if (!keys.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i>Nenhum usuário cadastrado.</div>';
      return;
    }

    list.innerHTML = keys.map(key => {
      const u = users[key];
      const isCurrentUser = currentUser && currentUser.username === u.username;
      return `
        <div class="user-card">
          <div class="user-card-top">
            <div>
              <div class="user-name">${escapeHtml(u.nome)}</div>
              <span class="user-role-badge ${u.role === 'Admin' ? 'admin' : ''}">${u.role}</span>
            </div>
            <span class="user-login">@${escapeHtml(u.username)}</span>
          </div>
          <div class="user-card-meta">
            ${isCurrentUser ? '<span class="current-user-tag"><i class="fas fa-check-circle"></i> Você</span>' : ''}
          </div>
          <div class="user-card-actions">
            <button class="btn btn-secondary" data-action="edit-user" data-key="${escapeHtml(u.username)}" style="flex:1;justify-content:center;">
              <i class="fas fa-pen"></i> Editar
            </button>
            ${!isCurrentUser ? `<button class="btn btn-danger" data-action="delete-user" data-key="${escapeHtml(u.username)}">
              <i class="fas fa-trash"></i>
            </button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
      btn.addEventListener('click', () => openUserModal(btn.dataset.key));
    });
    list.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
      btn.addEventListener('click', () => deleteUser(btn.dataset.key));
    });
  }

  function openUserModal(key) {
    const users = loadUsers();
    editingUserId = key;

    if (key && users[key]) {
      const u = users[key];
      els.userModalTitle.textContent = 'Editar Usuário';
      els.userId.value = key;
      els.userLogin.value = u.username;
      els.userLogin.disabled = true;
      els.userNome.value = u.nome;
      els.userPassword.value = '';
      els.userPassword.required = false;
      document.getElementById('passwordHint').style.display = 'block';
      els.userRole.value = u.role;
      els.deleteUserBtn.style.display = 'inline-flex';
    } else {
      els.userModalTitle.textContent = 'Novo Usuário';
      els.userId.value = '';
      els.userLogin.value = '';
      els.userLogin.disabled = false;
      els.userNome.value = '';
      els.userPassword.value = '';
      els.userPassword.required = true;
      document.getElementById('passwordHint').style.display = 'none';
      els.userRole.value = 'Operador';
      els.deleteUserBtn.style.display = 'none';
    }
    els.userModal.classList.add('open');
  }

  function closeUserModal() {
    els.userModal.classList.remove('open');
    editingUserId = null;
  }

  function deleteUser(key) {
    const users = loadUsers();
    if (!users[key]) return;
    if (key === 'admin') {
      toast('Não é possível excluir o administrador padrão.', 'error');
      return;
    }
    if (currentUser && currentUser.username === key) {
      toast('Você não pode excluir seu próprio usuário.', 'error');
      return;
    }
    if (!confirm(`Excluir o usuário "${users[key].nome}"?`)) return;
    delete users[key];
    saveUsers(users);
    renderSettings();
    toast('Usuário excluído.', 'success');
  }

  els.addUserBtn.addEventListener('click', () => openUserModal(null));
  els.closeUserModal.addEventListener('click', closeUserModal);
  els.cancelUserBtn.addEventListener('click', closeUserModal);
  els.deleteUserBtn.addEventListener('click', () => {
    if (editingUserId) deleteUser(editingUserId);
    closeUserModal();
  });

  els.userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const users = loadUsers();
    const key = els.userId.value;
    const login = els.userLogin.value.trim().toLowerCase();
    const nome = els.userNome.value.trim();
    const password = els.userPassword.value;
    const role = els.userRole.value;

    if (!login || login.length < 3) {
      toast('Usuário deve ter pelo menos 3 caracteres.', 'error');
      return;
    }
    if (!nome) {
      toast('Nome é obrigatório.', 'error');
      return;
    }

    if (key) {
      // Editing existing user
      if (password) {
        users[key].password = password;
      }
      users[key].nome = nome;
      users[key].role = role;
      toast('Usuário atualizado.', 'success');
    } else {
      // Creating new user
      if (!password || password.length < 4) {
        toast('Senha deve ter pelo menos 4 caracteres.', 'error');
        return;
      }
      if (users[login]) {
        toast('Este nome de usuário já existe.', 'error');
        return;
      }
      users[login] = { username: login, password, role, nome };
      toast('Usuário criado.', 'success');
    }

    saveUsers(users);
    closeUserModal();
    renderSettings();
  });

  // ---------- Close user modal on overlay click ----------
  els.userModal.addEventListener('click', (e) => { if (e.target === els.userModal) closeUserModal(); });

  // ---------- Master render ----------
  function render() {
    renderHeaderDate();
    renderStats();
    if (currentUser && currentUser.role === 'Admin') {
      els.navSettings.style.display = '';
    }
    if (state.currentView === 'calendar') renderCalendar();
    if (state.currentView === 'list') renderList();
    if (state.currentView === 'suppliers') renderSuppliers();
    if (state.currentView === 'settings') renderSettings();
  }

  render();
})();
