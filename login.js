(function() {
  'use strict';

  // Check if already logged in (sessão salva no Firestore, sem localStorage)
  (async function tryRestore() {
    try {
      await window.FB.whenReady();
      const session = await window.FB.restoreSession();
      if (session && session.username) {
        const sessCd = session.cd === 'CD2' ? 'CD2' : 'CD1';
        window.location.href = sessCd === 'CD2' ? 'index2.html' : 'index1.html';
        return;
      }
    } catch (e) {}
    initLogin();
  })();

  function initLogin() {
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

      window.FB.validateUser(username, password).then(function (user) {
        if (!user) {
          showError('Usuário ou senha inválidos.');
          return;
        }
        // Salvar sessão no Firestore e redirecionar
        return window.FB.saveSession({
          username: user.username,
          role: user.role,
          cd: cd,
          loginTime: new Date().toISOString()
        }).then(function () {
          window.location.href = cd === 'CD2' ? 'index2.html' : 'index1.html';
        });
      }).catch(function () {
        showError('Erro ao entrar. Verifique sua conexão e tente novamente.');
      });
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
  }
})();
