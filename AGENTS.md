# AGENTS.md

## Regras de manutenção

- **Só atualize o documento `REGRAS-DO-NEGOCIO.md` se o usuário solicitar explicitamente** — não atualizar por conta própria.
- **Só crie ou atualize arquivos na pasta `conversas/` se o usuário solicitar explicitamente** — não criar por conta própria.

## Contexto do projeto

- App: agendamento de retirada de paletes (web estático no GitHub Pages).
- Backend: Firebase (Firestore é a fonte da verdade; login anônimo + sessão própria).
- Arquivos: `login.html` + `login.js`/`config.js` (login e configurações), `index1.html`/`app1.js` (CD1), `index2.html`/`app2.js` (CD2), `firebase-init.js` (Firebase), `style1.css`/`style2.css`.
- Remoto: `https://github.com/cdnagumointeligencia/paletes.git` (branch `main`).
- Não rodar testes automatizados por conta própria; pedir ao usuário para testar no navegador quando necessário.
