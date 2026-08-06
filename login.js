(function() {
  'use strict';

  var USERS_KEY = 'paletes.users';
  var SESSION_KEY = 'paletes.session';

  // Check if already logged in
  var session = localStorage.getItem(SESSION_KEY);
  if (session) {
    try {
      var user = JSON.parse(session);
      if (user && user.username) {
        var sessCd = user.cd === 'CD2' ? 'CD2' : 'CD1';
        window.location.href = sessCd === 'CD2' ? 'index2.html' : 'index1.html';
        return;
      }
    } catch(e) {}
  }

  // No rate limiting: allow unlimited attempts; successful login always grants access
  // (Previously there was time-based blocking; removed per requirements.)

  // CD selecionado na tela de login
  var cdSelecionado = null;

  function selecionarCD(cd, el) {
    cdSelecionado = cd;
    document.querySelectorAll('.login-cd-card').forEach(function (card) {
      if (el) card.classList.toggle('selected', card === el);
    });
  }

  // Usuários padrão — senha é alterada apenas no painel de Configurações
  var DEFAULT_PASSWORDS = { admin: 'Admin123', operador: 'op123' };

  function getUsers() {
    var raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch(e) {}
    }
    var defaults = {
      admin: { username: 'admin', password: DEFAULT_PASSWORDS.admin, role: 'Admin' },
      operador: { username: 'operador', password: DEFAULT_PASSWORDS.operador, role: 'Operador' }
    };
    localStorage.setItem(USERS_KEY, JSON.stringify(defaults));
    return defaults;
  }

  function showError(msg) {
    var el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.add('show');
    document.querySelector('.login-card').classList.add('shake');
    setTimeout(function() {
      document.querySelector('.login-card').classList.remove('shake');
    }, 400);
  }

  function hideError() {
    document.getElementById('errorMsg').classList.remove('show');
  }

  function fazerLogin(cd, el) {
    hideError();
    selecionarCD(cd, el);


    var username = document.getElementById('username').value.trim().toLowerCase();
    var password = document.getElementById('password').value;

    if (!username || !password) {
      showError('Preencha usuário e senha.');
      return;
    }

    var users = getUsers();
    var user = users[username];

    if (!user || String(user.password).toLowerCase() !== String(password).toLowerCase()) {
      showError('Usuário ou senha inválidos.');
      return;
    }


    // Salvar sessão e redirecionar
    saveSessionAndRedirect(user, cd);
  }

  document.querySelectorAll('.login-cd-card').forEach(function (card) {
    card.addEventListener('click', function () {
      fazerLogin(this.dataset.cd, this);
    });
  });

  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!cdSelecionado) {
      showError('Selecione um CD para entrar.');
      return;
    }
    fazerLogin(cdSelecionado, null);
  });

  function saveSessionAndRedirect(user, cd) {
    var sessionData = {
      username: user.username,
      role: user.role,
      cd: cd,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    window.location.href = cd === 'CD2' ? 'index2.html' : 'index1.html';
  }
})();
