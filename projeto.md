# Controle de Retirada de Paletes — Mapa do Projeto
> Gerado automaticamente pelo PROJECT_MAPPER_SPEC
> Atualizado em: 25/07/2026

---

## Identidade do projeto

- **Nome:** Controle de Retirada de Paletes
- **Descrição:** Sistema de agendamento e controle de retirada de paletes por fornecedores, com gestão de estoque por CD (Centro de Distribuição)
- **Contexto:** Aplicação local, acessada via navegador em rede interna (IP fixo da máquina)
- **Stack:** HTML + CSS + JS puro (sem framework, sem backend, sem package.json)
- **Armazenamento:** localStorage do navegador (sem banco de dados)

---

## Estrutura de arquivos

```
├── index.html              → Interface principal (SPA) — calendar, list, suppliers, reports, settings, history, backup
├── app.js                  → ⚠️ ARQUIVO CRÍTICO — toda lógica de negócio, state, rendering, localStorage
├── style.css               → ⚠️ ARQUIVO CRÍTICO — todos os estilos globais e responsivos
├── login.html              → Tela de login (JS inline, autenticação via localStorage)
├── gerenciamento.html      → Gestão de estoque por CD (JS inline, estoque em localStorage)
├── PROJECT_MAPPER_SPEC.md  → Spec de mapeamento (este arquivo)
├── projeto.md              → Mapa do projeto (lido por IA em toda sessão)
└── conversas/              → Histórico de backups e documentação de decisions
    ├── backup_24_07_2026/  → Backup completo dos arquivos em 24/07/2026
    ├── integracao_estoque_agendamento.md
    └── integracao_tipo_palete_correcoes.md
```

---

## Dependências entre arquivos

- `index.html` carrega → `style.css`, `app.js`, Google Fonts (Oswald, Inter, IBM Plex Mono), Font Awesome 6.4.0
- `login.html` → JS inline (sem dependência de app.js)
- `gerenciamento.html` → JS inline (sem dependência de app.js)
- `app.js` → lê/escreve `nagumo_paletes_v1` do localStorage (mesmo key usada por gerenciamento.html)
- `app.js` → lê/escreve `paletes.session` para controle de sessão

---

## Arquivos críticos (NÃO modificar sem aviso)

- `app.js` — qualquer alteração afeta todas as views simultaneamente (calendário, lista, fornecedores, relatórios, histórico, backup)
- `style.css` — alterações afetam todas as páginas (index.html, gerenciamento.html usa estilos inline próprios)
- `index.html` — estrutura da SPA, modais, sidebar — alterar com cuidado

---

## Variáveis de ambiente

Nenhuma. Sistema 100% frontend com localStorage. Não há backend, banco de dados nem `.env`.

---

## Chaves de localStorage utilizadas

| Chave | Conteúdo |
|---|---|
| `paletes.schedules` | Agendamentos (JSON array) |
| `paletes.suppliers` | Fornecedores cadastrados |
| `paletes.history` | Eventos de auditoria/histórico |
| `paletes.users` | Usuários do sistema |
| `paletes.session` | Sessão ativa (excluída do backup) |
| `nagumo_paletes_v1` | Estoque por CD (chave compartilhada com gerenciamento.html) |

---

## Scripts disponíveis

Nenhum. Projeto estático — basta abrir os arquivos HTML no navegador.

---

## Regras deste projeto

- `app.js` e `style.css` são arquivos críticos — alterações afetam todo o sistema
- A chave `nagumo_paletes_v1` é compartilhada entre `app.js` e `gerenciamento.html` — nunca renomear sem sincronizar ambas as páginas
- Backup exclui `paletes.session` por segurança
- Formato de data: DD/MM/YYYY (pt-BR)
- Usuários: admin (acesso total), usuario (acesso limitado)
- CSS: fontes Oswald (títulos), Inter (corpo), IBM Plex Mono (dados numéricos)

---

## Portas e endpoints principais

Nenhum. Sistema roda localmente via `file://` ou servidor estático simples (ex: Live Server do VS Code).

---

## Observações

- A pasta `conversas/` contém backups e documentação de decisões técnicas — não é code
- O `PROJECT_MAPPER_SPEC.md` é a spec que gerou este mapa — pode ser removido após uso
- `gerenciamento.html` é uma página isolada com seu próprio JS inline — não depende de `app.js`
