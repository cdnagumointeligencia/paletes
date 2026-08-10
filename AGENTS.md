# AGENTS.md

## Regra de manutenção obrigatória

Toda vez que houver **qualquer alteração na página** (regra de negócio, novo comportamento, correção de bug, layout, novos campos, refatoração, etc.):

1. **Sempre atualize o documento `REGRAS-DO-NEGOCIO.md`** — mantê-lo fiel ao comportamento atual do sistema e registrar a mudança na seção "Histórico de Alterações" (com data e, se aplicável, hash do commit). Este passo é obrigatório e incondicional.
2. **Só crie ou atualize arquivos na pasta `conversas/` se o usuário solicitar explicitamente** — não criar por conta própria.

Não feche a tarefa sem executar o passo 1.

## Contexto do projeto

- App: agendamento de retirada de paletes (web estático no GitHub Pages).
- Backend: Firebase (Firestore é a fonte da verdade; login anônimo + sessão própria).
- Arquivos: `login.html` + `login.js`/`config.js` (login e configurações), `index1.html`/`app1.js` (CD1), `index2.html`/`app2.js` (CD2), `firebase-init.js` (Firebase), `style1.css`/`style2.css`.
- Remoto: `https://github.com/cdnagumointeligencia/paletes.git` (branch `main`).
- Não rodar testes automatizados por conta própria; pedir ao usuário para testar no navegador quando necessário.
