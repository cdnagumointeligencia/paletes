Registro da conversa — Migração para Firebase / passos realizados
Data: 2026-08-06T13:05:18.538-03:00
Usuário: marcos.marques

Resumo do estado e pontos onde paramos

1) Correções aplicadas no código local (antes da migração):
- login.js: Removida lógica de tentativas/tempo de bloqueio, mantendo apenas bloqueio por erro até senha correta.
- Corrigido problema de persistência de usuários: app1.js e app2.js atualizados para garantir criação/uso de usuários padrão sem sobrescrever a lista existente.

2) Validação de separação por CD (cd1 / cd2):
- Confirmado que schedules e history usam chaves separadas por CD: paletes.schedules.cd1 / paletes.schedules.cd2 e paletes.history.cd1 / paletes.history.cd2.
- Usuários e fornecedores são globais (paletes.users, paletes.suppliers).

3) Preparação e início da migração para Firebase:
- Criado arquivo firebase-init.js com inicialização do Firebase (SDK modular) e helpers expostos em window.FB:
  - listenSchedulesByCD(cd, onChange)
  - createScheduleAtomic(payload) usando documento lock (slotLocks) e runTransaction
  - updateSchedule(id, patch), deleteSchedule(id, schedule), releaseSlotLock, addHistoryEvent, createSupplier, flushBatchedUpdates
- Substituído placeholder firebaseConfig pelo valor temporário fornecido pelo usuário (projeto: paletes-3356a). (Nota: chave API pública incluída)
- Atualizado login.html para carregar firebase-init.js como module antes de login.js
- Adicionado auto sign-in anônimo (signInAnonymously) em firebase-init.js para garantir request.auth != null (regras exigem auth)

4) Integração parcial com Firestore (sem remover completamente o fallback local):
- app1.js e app2.js:
  - Substituída persistência local de schedules por listener Firestore (window.FB.listenSchedulesByCD(PAGE_CD,...)) — state.schedules agora populado por listener.
  - Substituída criação/edição/exclusão para usar window.FB.createScheduleAtomic / updateSchedule / deleteSchedule.
  - saveSchedules() foi convertido para no-op (log) porque Firestore lida com persistência.
  - Mantido suppliers/local fallback até migração completa.

5) Regras e configuração Firestore:
- Copiado padrão de firestore.rules do projeto "Projeto SAC ONLINE" para este projeto — regras exigem request.auth != null (autenticacao anônima satisfaz).
- firebase.json e firestore.indexes.json criados (indexes vazios por enquanto).

6) Script de migração criado: migrate-localstorage-to-firestore.js
- Funcionalidades:
  - dry-run preview: migrate.previewMigration() mostra contagens e amostras
  - execução: await migrate.runMigration({commit:true, migrateUsers:false, batchSize:200}) para escrever em Firestore
  - Não migra senhas; cria userMeta se migrateUsers=true (sem credenciais)
  - Usa batches e serverTimestamp para campos migratedAt

7) Testes e próximos passos recomendados (lista):
- Habilitar Authentication (anon) no Firebase Console — já feito.
- Testar localmente servindo os arquivos http (http-server ou python -m http.server) e abrir login.html para confirmar inicialização e sign-in anônimo no console.
- Executar migrate.previewMigration() e revisar amostras; depois executar com commit:true quando pronto.
- Criar repositório GitHub e empurrar código; configurar GitHub Pages ou GitHub Actions para deploy.
- Planejar migração de usuários (reset de senha/creation via Auth) e endurecer regras Firestore para produção (custom claims para admin, controles por coleção).

Arquivos criados/modificados (para referência rápida)
- Criados:
  - firebase-init.js (inicialização + helpers)
  - migrate-localstorage-to-firestore.js (migration helper)
  - firestore.rules (copiado do Projeto SAC ONLINE)
  - firebase.json, firestore.indexes.json
- Modificados:
  - login.html (inclui firebase-init.js)
  - login.js (removida lógica de bloqueio por tentativas)
  - app1.js, app2.js (integração Firestore: listeners e chamadas create/update/delete)

Observações de segurança e operação
- Não comitar service account JSON nem secrets no repo.
- API keys client-side são públicos (ok); service account privado deve ficar em GitHub Secrets para CI.
- Regras de teste permitem apenas usuários autenticados. Para produção, é necessário regras mais refinadas por coleção e claims.

Onde paramos
- tudo preparado localmente. O firebaseConfig já foi adicionado ao firebase-init.js (chaves públicas do projeto).
- O usuário pediu script de migração (feito).
- Próximo: executar migrate.previewMigration() no navegador para revisar, e posteriormente migrate.runMigration({commit:true}) quando pronto.

Salvar este arquivo como registro de progresso e ponto de retomada.

-- Fim do registro --
