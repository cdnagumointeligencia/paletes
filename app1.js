// ==========================================================================
// Controle de Retirada de Paletes — lógica da aplicação
// Persistência em localStorage. Sem dependências externas.
// ==========================================================================

(() => {
  'use strict';

  const TIME_SLOTS = ['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const PAGE_CD = 'cd1';
  const STORAGE_SCHEDULES = 'paletes.schedules.' + PAGE_CD;
  const STORAGE_SUPPLIERS = 'paletes.suppliers';
  const STORAGE_HISTORY = 'paletes.history.' + PAGE_CD;

  const FAKE_SUPPLIERS = ['Distribuidora Vale Verde', 'Transportes Rota Norte', 'Log Express Paulista'];

  const WEEKDAYS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  // ---------- Migração: chaves legadas compartilhadas → separadas por CD ----------
  (function migrateLegacyStorage() {
    try {
      var legacySchedules = localStorage.getItem('paletes.schedules');
      if (legacySchedules !== null) {
        var arr = JSON.parse(legacySchedules);
        if (Array.isArray(arr)) {
          var cd1 = arr.filter(function (s) { return (s.cd || 'cd1') === 'cd1'; });
          var cd2 = arr.filter(function (s) { return (s.cd || 'cd1') === 'cd2'; });
          localStorage.setItem('paletes.schedules.cd1', JSON.stringify(loadJSON('paletes.schedules.cd1', []).concat(cd1)));
          localStorage.setItem('paletes.schedules.cd2', JSON.stringify(loadJSON('paletes.schedules.cd2', []).concat(cd2)));
        }
        localStorage.removeItem('paletes.schedules');
      }
      var legacyHistory = localStorage.getItem('paletes.history');
      if (legacyHistory !== null) {
        var hist = JSON.parse(legacyHistory);
        if (Array.isArray(hist)) {
          ['paletes.history.cd1', 'paletes.history.cd2'].forEach(function (key) {
            var existing = loadJSON(key, []);
            if (!Array.isArray(existing)) existing = [];
            var existingIds = {};
            existing.forEach(function (h) { if (h && h.id) existingIds[h.id] = true; });
            var merged = existing.slice();
            hist.forEach(function (h) { if (h && h.id && !existingIds[h.id]) merged.push(h); });
            localStorage.setItem(key, JSON.stringify(merged.slice(0, 500)));
          });
        }
        localStorage.removeItem('paletes.history');
      }
    } catch (e) {}
  })();

  // ---------- State ----------
  let state = {
    schedules: [], // will be populated from Firestore listener
    suppliers: loadJSON(STORAGE_SUPPLIERS, []).filter((s) => !FAKE_SUPPLIERS.includes(s.name)),
    history: loadHistory(),
    currentDate: new Date(),
    currentView: 'calendar',
    editingScheduleId: null,
    pendingDeleteId: null,
    searchQuery: '',
    historyTypeFilter: 'all',
    historyActionFilter: 'all',
    historySearchQuery: '',
  };
  // localStorage schedules are deprecated; suppliers still loaded locally until migration
  saveSuppliers();

  // Attach Firestore listener for schedules if FB is available
  if (window.FB && typeof window.FB.listenSchedulesByCD === 'function') {
    window.FB.listenSchedulesByCD(PAGE_CD, function(docs) {
      state.schedules = docs.filter((s) => !FAKE_SUPPLIERS.includes(s.supplier));
      render();
    });
  } else {
    console.info('FB not initialized yet; loading schedules from localStorage as fallback.');
    try {
      state.schedules = loadJSON(STORAGE_SCHEDULES, []).filter((s) => !FAKE_SUPPLIERS.includes(s.supplier));
    } catch (e) {}
  }

  (function ensureUsersDefaults() {
    try {
      var raw = localStorage.getItem('paletes.users');
      if (!raw) {
        var defaults = {
          admin: { username: 'admin', password: 'Admin123', role: 'Admin' },
          operador: { username: 'operador', password: 'op123', role: 'Operador' }
        };
        localStorage.setItem('paletes.users', JSON.stringify(defaults));
        return;
      }
      var users = JSON.parse(raw);
      if (!users || typeof users !== 'object' || Array.isArray(users)) {
        localStorage.setItem('paletes.users', JSON.stringify({ admin: { username: 'admin', password: 'Admin123', role: 'Admin' } }));
        return;
      }
      if (!users.admin) users.admin = { username: 'admin', password: 'Admin123', role: 'Admin' };
      localStorage.setItem('paletes.users', JSON.stringify(users));
    } catch (e) {}
  })();

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (key === STORAGE_SCHEDULES && !Array.isArray(parsed)) {
        console.warn('[Paletes] Dados corrompidos na chave "' + key + '", usando fallback.');
        return fallback;
      }
      if (key === STORAGE_SUPPLIERS && !Array.isArray(parsed)) {
        console.warn('[Paletes] Dados corrompidos na chave "' + key + '", usando fallback.');
        return fallback;
      }
      return parsed;
    } catch (e) {
      console.warn('[Paletes] Erro ao ler "' + key + '":', e.message);
      return fallback;
    }
  }
  function saveSchedules() { console.info('saveSchedules is a no-op; using Firestore for persistence'); }
  function saveSuppliers() { localStorage.setItem(STORAGE_SUPPLIERS, JSON.stringify(state.suppliers)); }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }
  function saveHistory() { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.history)); }

  function addHistoryEvent(type, action, title, details) {
    state.history.unshift({
      id: uid(),
      timestamp: new Date().toISOString(),
      type,
      action,
      title,
      details,
      user: currentUser ? (currentUser.username) : 'Sistema',
    });
    if (state.history.length > 500) state.history = state.history.slice(0, 500);
    saveHistory();
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
      reports: $('#reportsView'),
      history: $('#historyView'),
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
    scheduleTipoPalete: $('#scheduleTipoPalete'),
    closeModal: $('#closeModal'),
    cancelBtn: $('#cancelBtn'),
    deleteBtn: $('#deleteBtn'),
    saveBtn: $('#saveBtn'),

    confirmModal: $('#confirmModal'),
    closeConfirmModal: $('#closeConfirmModal'),
    confirmDetails: $('#confirmDetails'),
    cancelConfirmBtn: $('#cancelConfirmBtn'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),

    toastContainer: $('#toastContainer'),
    themeToggle: $('#themeToggle'),
    historyList: $('#historyList'),
    historyStats: $('#historyStats'),
    historyTypeFilter: $('#historyTypeFilter'),
    historyActionFilter: $('#historyActionFilter'),
    historySearchInput: $('#historySearchInput'),
    clearHistoryBtn: $('#clearHistoryBtn'),
    logoutBackupModal: $('#logoutBackupModal'),
    closeLogoutBackupModal: $('#closeLogoutBackupModal'),
    logoutWithBackup: $('#logoutWithBackup'),
    logoutWithoutBackup: $('#logoutWithoutBackup'),
    cancelLogout: $('#cancelLogout'),
  };

  // ---------- Theme ----------
  const STORAGE_THEME = 'paletes.theme.' + PAGE_CD;
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
    els.sidebarUserName.textContent = currentUser.username;
    els.sidebarUserRole.textContent = currentUser.role || '';
  }

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
        const isConfirmed = entry.status === 'Confirmado';
        return `
          <div class="day-slot-row">
            <div class="slot-card status-${entry.status.toLowerCase()}" data-id="${entry.id}">
              <div class="slot-supplier">${escapeHtml(entry.supplier)}</div>
              <div class="slot-meta">
                <span>${isConfirmed ? '<i class="fas fa-check-circle" style="color:var(--status-confirmado)"></i>' : ''} ${entry.pallets} pl <span class="badge ${(entry.tipoPalete || 'CHEP') === 'CHEP' ? 'chep' : 'pbr'}">${entry.tipoPalete || 'CHEP'}</span> <span class="cd-tag ${(entry.cd || 'cd1') === 'cd2' ? 'cd2' : ''}">${(entry.cd || 'cd1').toUpperCase()}</span></span>
                <span>${escapeHtml(entry.driver)}</span>
                <span class="status-pill ${entry.status}">${entry.status}</span>
                ${isConfirmed && entry.confirmedBy ? `<span class="confirmed-by"><i class="fas fa-user-check"></i> ${escapeHtml(entry.confirmedBy)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }
      if (cancelledEntry) {
        return `
          <div class="day-slot-row">
            <button type="button" class="slot-empty slot-cancelled" data-time="${time}">
              <i class="fas fa-rotate-left"></i> Cancelado — reagendar
            </button>
          </div>`;
      }
      return `
        <div class="day-slot-row">
          <button type="button" class="slot-empty" data-time="${time}">
            <i class="fas fa-plus"></i> Livre — agendar
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
      els.scheduleListBody.innerHTML = `<tr class="empty-row"><td colspan="9">Nenhum agendamento encontrado.</td></tr>`;
      return;
    }

    els.scheduleListBody.innerHTML = rows.map((s) => {
      const isConfirmed = s.status === 'Confirmado';
      return `
      <tr>
        <td class="mono">${formatDateBR(s.date)}<br>${s.time}</td>
        <td>${escapeHtml(s.supplier)}</td>
        <td class="mono">${isConfirmed ? '<i class="fas fa-check-circle" style="color:var(--status-confirmado);font-size:11px"></i> ' : ''}${s.pallets}</td>
        <td><span class="badge ${(s.tipoPalete || 'CHEP') === 'CHEP' ? 'chep' : 'pbr'}">${s.tipoPalete || 'CHEP'}</span></td>
        <td><span class="cd-tag ${(s.cd || 'cd1') === 'cd2' ? 'cd2' : ''}">${(s.cd || 'cd1').toUpperCase()}</span></td>
        <td>${escapeHtml(s.driver)}</td>
        <td class="mono">${escapeHtml(s.plate)}</td>
        <td><span class="status-pill ${s.status}">${s.status}</span>${isConfirmed && s.confirmedBy ? `<br><span class="confirmed-by-text"><i class="fas fa-user-check"></i> ${escapeHtml(s.confirmedBy)}</span>` : ''}</td>
        <td>
          <div class="table-actions">
            <button class="icon-btn" data-action="edit" data-id="${s.id}" aria-label="Editar"><i class="fas fa-pen"></i></button>
            <button class="icon-btn danger" data-action="delete" data-id="${s.id}" aria-label="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');

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
    const header = ['Data', 'Horário', 'Fornecedor', 'Paletes', 'Tipo', 'CD', 'Motorista', 'Placa', 'Status', 'Observações'];
    const rows = [...state.schedules]
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((s) => [s.date, s.time, s.supplier, s.pallets, s.tipoPalete || 'CHEP', s.cd || 'cd1', s.driver, s.plate, s.status, (s.notes || '').replace(/\n/g, ' ')]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(';')).join('\r\n');
    downloadFile(`agendamentos_paletes_${fmtDate(new Date())}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
    toast('Arquivo CSV exportado.', 'success');
  }

  function csvEscape(v) {
    const s = String(v ?? '').replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
        <thead><tr><th>Horário</th><th>Fornecedor</th><th>Paletes</th><th>Tipo</th><th>CD</th><th>Motorista</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td class="mono">${r.time}</td><td>${escapeHtml(r.supplier)}</td><td class="mono">${r.pallets}</td><td><span class="badge ${(r.tipoPalete || 'CHEP') === 'CHEP' ? 'chep' : 'pbr'}">${r.tipoPalete || 'CHEP'}</span></td><td><span class="cd-tag ${(r.cd || 'cd1') === 'cd2' ? 'cd2' : ''}">${(r.cd || 'cd1').toUpperCase()}</span></td><td>${escapeHtml(r.driver)}</td><td><span class="status-pill ${r.status}">${r.status}</span></td></tr>`).join('')}
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
    setFieldsLocked(false);
    els.scheduleDate.disabled = false;
    els.scheduleTime.disabled = false;
    els.saveBtn.style.display = '';
    els.saveBtn.disabled = false;

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
      els.scheduleTipoPalete.value = s.tipoPalete || 'CHEP';
      els.notes.value = s.notes || '';
      els.deleteBtn.style.display = 'inline-flex';
      if (s.status === 'Confirmado') {
        setFieldsLocked(true);
        els.scheduleDate.disabled = true;
        els.scheduleTime.disabled = true;
        els.saveBtn.style.display = 'none';
        els.deleteBtn.style.display = 'none';
      }
    } else {
      els.modalTitle.textContent = 'Novo Agendamento';
      els.scheduleId.value = '';
      els.scheduleDate.value = presetDate || fmtDate(state.currentDate);
      if (presetTime) els.scheduleTime.value = presetTime;
      els.status.value = 'Agendado';
      els.scheduleTipoPalete.value = 'CHEP';
      els.deleteBtn.style.display = 'none';
    }
    els.scheduleModal.classList.add('open');
    setTimeout(() => els.supplierInput.focus(), 50);
  }

  function setFieldsLocked(locked) {
    const fields = [els.pallets, els.scheduleTipoPalete, els.supplierInput, els.driver, els.plate, els.status, els.notes];
    fields.forEach((f) => { if (f) f.disabled = locked; });
    const formGroups = document.querySelectorAll('#scheduleForm .form-group label');
    const LOCK_HTML = ' <span class="locked-badge"><i class="fas fa-lock"></i></span>';
    const LOCK_RE = / <span class="locked-badge"><i class="fas fa-lock"><\/i><\/span>/g;
    formGroups.forEach((lbl) => {
      lbl.innerHTML = lbl.innerHTML.replace(LOCK_RE, '');
    });
    if (locked) {
      formGroups.forEach((lbl) => {
        lbl.innerHTML += LOCK_HTML;
      });
    }
  }

  els.status.addEventListener('change', () => {
    const editing = state.editingScheduleId ? state.schedules.find((sc) => sc.id === state.editingScheduleId) : null;
    if (editing && editing.status === 'Confirmado') {
      setFieldsLocked(true);
    } else {
      setFieldsLocked(false);
    }
  });

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

  els.scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editing = els.scheduleId.value ? state.schedules.find((sc) => sc.id === els.scheduleId.value) : null;
    const wasConfirmed = editing && editing.status === 'Confirmado';
    const statusChanged = wasConfirmed && els.status.value !== 'Confirmado';
    const fieldsLocked = wasConfirmed && !statusChanged;
    const willConfirm = els.status.value === 'Confirmado' && (!editing || !wasConfirmed);

    if (willConfirm) {
      if (!confirm('Ao confirmar o agendamento, a edição será bloqueada. Esta ação não pode ser desfeita. Deseja continuar?')) {
        return;
      }
    }

    const pallets = fieldsLocked ? editing.pallets : Number(els.pallets.value);
    if (!fieldsLocked && pallets > 1000) {
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
      cd: PAGE_CD,
      tipoPalete: fieldsLocked ? editing.tipoPalete : els.scheduleTipoPalete.value,
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

    if (els.scheduleId.value) {
      const s = state.schedules.find((sc) => sc.id === els.scheduleId.value);
      const oldStatus = s.status;
      // update via Firestore
      try {
        const patch = { ...payload };
        if (payload.status === 'Confirmado' && oldStatus !== 'Confirmado') {
          patch.confirmedBy = currentUser ? currentUser.username : 'unknown';
          patch.confirmedAt = new Date().toISOString();
        }
        await window.FB.updateSchedule(els.scheduleId.value, patch);
        addHistoryEvent('agendamento', 'edicao', 'Agendamento editado',
          `${payload.supplier} — ${formatDateBR(payload.date)} ${payload.time} — ${payload.pallets} paletes ${payload.tipoPalete} — ${payload.status}`);
        toast('Agendamento atualizado.', 'success');
      } catch (err) {
        console.error('Erro ao atualizar agendamento:', err);
        toast('Erro ao atualizar agendamento: ' + (err.message || err), 'error');
        return;
      }
    } else {
      // create via Firestore (atomic)
      try {
        if (payload.status === 'Confirmado') {
          payload.confirmedBy = currentUser ? currentUser.username : 'unknown';
          payload.confirmedAt = new Date().toISOString();
        }
        const newId = await window.FB.createScheduleAtomic(payload);
        addHistoryEvent('agendamento', 'criacao', 'Agendamento criado',
          `${payload.supplier} — ${formatDateBR(payload.date)} ${payload.time} — ${payload.pallets} paletes ${payload.tipoPalete} — ${payload.status}`);
        toast('Agendamento criado.', 'success');
      } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        toast('Erro ao criar agendamento: ' + (err.message || err), 'error');
        return;
      }
    }

    // no local save; Firestore listener will update state
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
  els.confirmDeleteBtn.addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;
    const id = state.pendingDeleteId;
    const deleted = state.schedules.find((s) => s.id === id);
    try {
      await window.FB.deleteSchedule(id, deleted);
      // Firestore listener will update state; optionally remove locally for immediate UI
      state.schedules = state.schedules.filter((s) => s.id !== id);
      closeConfirmModal();
      render();
      if (deleted) {
        addHistoryEvent('agendamento', 'exclusao', 'Agendamento excluído',
          `${deleted.supplier} — ${formatDateBR(deleted.date)} ${deleted.time} — ${deleted.pallets} paletes`);
      }
      toast('Agendamento excluído. Horário liberado.', 'success');
    } catch (err) {
      console.error('Erro ao excluir agendamento:', err);
      toast('Erro ao excluir agendamento: ' + (err.message || err), 'error');
    }
  });

  // ---------- Escape helper ----------
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Close modals on overlay click / Escape
  [els.scheduleModal, els.confirmModal, els.logoutBackupModal].forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.scheduleModal.classList.remove('open');
      els.confirmModal.classList.remove('open');
      els.logoutBackupModal.classList.remove('open');
    }
  });

  // ---------- History ----------
  els.historyTypeFilter.addEventListener('change', (e) => { state.historyTypeFilter = e.target.value; renderHistory(); });
  els.historyActionFilter.addEventListener('change', (e) => { state.historyActionFilter = e.target.value; renderHistory(); });
  els.historySearchInput.addEventListener('input', (e) => { state.historySearchQuery = e.target.value.trim().toLowerCase(); renderHistory(); });
  els.clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('Limpar todo o histórico de movimentações?')) return;
    state.history = [];
    saveHistory();
    renderHistory();
    toast('Histórico limpo.', 'success');
  });

  function renderHistory() {
    let items = [...state.history];

    if (state.historyTypeFilter !== 'all') items = items.filter((h) => h.type === state.historyTypeFilter);
    if (state.historyActionFilter !== 'all') items = items.filter((h) => h.action === state.historyActionFilter);
    if (state.historySearchQuery) {
      const q = state.historySearchQuery;
      items = items.filter((h) =>
        h.title.toLowerCase().includes(q) ||
        h.details.toLowerCase().includes(q) ||
        h.user.toLowerCase().includes(q)
      );
    }

    const total = state.history.length;
    const agendamentos = state.history.filter((h) => h.type === 'agendamento').length;
    const fornecedores = state.history.filter((h) => h.type === 'fornecedor').length;
    const usuarios = state.history.filter((h) => h.type === 'usuario').length;

    els.historyStats.innerHTML = `
      <div class="history-stat-card"><i class="fas fa-list"></i><div class="stat-info"><span class="stat-value">${total}</span><span class="stat-label">Total</span></div></div>
      <div class="history-stat-card"><i class="fas fa-calendar-check"></i><div class="stat-info"><span class="stat-value">${agendamentos}</span><span class="stat-label">Agendamentos</span></div></div>
      <div class="history-stat-card"><i class="fas fa-truck"></i><div class="stat-info"><span class="stat-value">${fornecedores}</span><span class="stat-label">Fornecedores</span></div></div>
      <div class="history-stat-card"><i class="fas fa-users"></i><div class="stat-info"><span class="stat-value">${usuarios}</span><span class="stat-label">Usuários</span></div></div>
    `;

    if (!items.length) {
      els.historyList.innerHTML = `<div class="empty-state"><i class="fas fa-clock-rotate-left"></i>${total === 0 ? 'Nenhum registro no histórico ainda.' : 'Nenhum registro encontrado com os filtros aplicados.'}</div>`;
      return;
    }

    els.historyList.innerHTML = items.slice(0, 200).map((h) => {
      const iconMap = { agendamento: 'fa-calendar-check', fornecedor: 'fa-truck', usuario: 'fa-users' };
      const actionLabel = { criacao: 'Criação', edicao: 'Edição', exclusao: 'Exclusão' };
      const date = new Date(h.timestamp);
      const dateStr = formatDateBR(fmtDate(date)) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="history-item">
          <div class="history-item-icon ${h.type}"><i class="fas ${iconMap[h.type] || 'fa-circle'}"></i></div>
          <div class="history-item-content">
            <div class="history-item-title">${escapeHtml(h.title)}</div>
            <div class="history-item-details">${escapeHtml(h.details)}</div>
            <div class="history-item-meta">
              <span class="history-item-badge ${h.action}">${actionLabel[h.action] || h.action}</span>
              <span><i class="fas fa-user" style="margin-right:3px;"></i>${escapeHtml(h.user)}</span>
              <span><i class="fas fa-clock" style="margin-right:3px;"></i>${dateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---------- Backup ----------
  const BACKUP_PREFIXES = ['paletes.', 'nagumo_'];

  function collectBackupData() {
    const data = { _meta: { version: 1, timestamp: new Date().toISOString(), app: 'paletes-agendamento' } };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === 'paletes.session') continue;
      if (BACKUP_PREFIXES.some((p) => key.startsWith(p))) {
        try { data[key] = JSON.parse(localStorage.getItem(key)); } catch(e) { data[key] = localStorage.getItem(key); }
      }
    }
    return data;
  }

   function exportBackup() {
     const data = collectBackupData();
     downloadFile('backup_paletes_' + fmtDate(new Date()) + '_' + Date.now() + '.json', JSON.stringify(data, null, 2), 'application/json');
     toast('Backup exportado com sucesso!', 'success');
   }

  function doBackupAndLogout() {
    exportBackup();
    setTimeout(() => {
      localStorage.removeItem('paletes.session');
      window.location.href = 'login.html';
    }, 800);
  }

  function doLogout() {
    localStorage.removeItem('paletes.session');
    window.location.href = 'login.html';
  }

  els.logoutBtn.addEventListener('click', () => {
    els.logoutBackupModal.classList.add('open');
  });
  els.logoutWithBackup.addEventListener('click', doBackupAndLogout);
  els.logoutWithoutBackup.addEventListener('click', doLogout);
  els.cancelLogout.addEventListener('click', () => els.logoutBackupModal.classList.remove('open'));
  els.closeLogoutBackupModal.addEventListener('click', () => els.logoutBackupModal.classList.remove('open'));

  // ---------- Master render ----------
  function render() {
    renderHeaderDate();
    renderStats();
    if (state.currentView === 'calendar') renderCalendar();
    if (state.currentView === 'list') renderList();
    if (state.currentView === 'history') renderHistory();
  }

  render();
})();
