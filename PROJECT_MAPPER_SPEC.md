# SPEC — Project Mapper para IA
> Versão 1.0 | Anthony @ Inteligencia
> Leia este arquivo inteiro antes de executar qualquer ação.

---

## Objetivo

Este spec instrui a IA a executar duas tarefas ao iniciar um projeto novo:

1. **Gerar o `projeto.md`** — mapa do projeto lido automaticamente pela IA em toda sessão
2. **Gerar o `gera_mapa.sh`** — script bash que regenera o `projeto.md` quando o projeto evoluir

---

## Quando executar este spec

O usuário vai dizer algo como:

- "Lê o PROJECT_MAPPER_SPEC e mapeia o projeto"
- "Inicializa o mapa do projeto"
- "Cria o projeto.md desse projeto"

Ao receber qualquer uma dessas frases, execute o protocolo abaixo na íntegra.

---

## PROTOCOLO DE EXECUÇÃO

### FASE 1 — Reconhecimento do projeto

Antes de gerar qualquer arquivo, colete as seguintes informações explorando o diretório raiz:

```
1. Liste TODOS os arquivos e pastas (exceto: node_modules, .git, dist, build, .cache)
2. Identifique a stack tecnológica:
   - Frontend: HTML / CSS / JS / Framework (React, Vue, etc.)
   - Backend: Node.js / Express / outro
   - Banco de dados: PostgreSQL / SQLite / Firebase / outro / nenhum
   - Comunicação: REST / WebSocket / outro
3. Leia os seguintes arquivos se existirem:
   - package.json → dependências e scripts
   - .env.example ou .env → variáveis de ambiente (NUNCA expor valores reais)
   - README.md → descrição existente
   - Qualquer arquivo de configuração na raiz (.config.js, config.json, etc.)
4. Identifique o arquivo de entrada principal (index.html, server.js, app.js, main.js)
5. Identifique arquivos críticos que outros dependem (shared.js, utils.js, db/pool.js, etc.)
   - Use grep para encontrar imports/requires entre arquivos
```

Pergunte ao usuário apenas se NÃO conseguir determinar:
- O nome do sistema/produto
- Se há arquivos que **nunca devem ser modificados sem aviso explícito**
- O IP/porta do servidor (se aplicável)

---

### FASE 2 — Gerar o `projeto.md`

Crie o arquivo `projeto.md` na raiz do projeto com a seguinte estrutura:

```markdown
# [NOME DO SISTEMA] — Mapa do Projeto
> Gerado automaticamente pelo PROJECT_MAPPER_SPEC
> Atualizado em: [DATA]

---

## Identidade do projeto

- **Nome:** [nome do sistema]
- **Descrição:** [uma linha descrevendo o que o sistema faz]
- **Contexto:** [onde roda — ex: servidor interno CD, IP fixo 192.168.x.x]
- **Stack:** [ex: HTML + CSS + JS puro / Node.js + Express / PostgreSQL]

---

## Estrutura de arquivos

[Árvore de arquivos relevantes com anotação de responsabilidade de cada um]

Exemplo:
├── index.html          → Interface principal, controle de UI
├── shared.js           → ⚠️ ARQUIVO CRÍTICO — lógica de negócio compartilhada
├── server.js           → Backend Express, porta 3001
├── db/
│   ├── pool.js         → Conexão PostgreSQL
│   └── schema.sql      → Estrutura das tabelas
└── public/
    └── style.css       → Estilos globais

---

## Dependências entre arquivos

[Liste quais arquivos importam quais — gerado por análise de imports/requires]

Exemplo:
- `index.html` importa → `shared.js`, `style.css`
- `server.js` importa → `db/pool.js`, `middlewares/auth.js`
- `totem.html` importa → `shared.js`

---

## Arquivos críticos (NÃO modificar sem aviso)

[Liste os arquivos que não devem ser alterados diretamente]

- `shared.js` — qualquer alteração afeta N telas simultaneamente
- `db/pool.js` — configuração de conexão, alterar pode derrubar o sistema

---

## Variáveis de ambiente

[Liste as variáveis necessárias sem expor valores]

- `DB_HOST` — host do banco PostgreSQL
- `DB_PORT` — porta do banco (padrão: 5432)
- `PORT` — porta do servidor Express

---

## Scripts disponíveis

[Extraído do package.json ou identificado manualmente]

- `npm start` → [o que faz]
- `npm run dev` → [o que faz]
- `node server.js` → [o que faz]

---

## Regras deste projeto

[Regras específicas identificadas ou informadas pelo usuário]

- CSS inline apenas em componentes completamente isolados
- Toda alteração em `shared.js` requer confirmação prévia do usuário
- Banco de dados: nunca fazer DROP sem confirmação explícita
- Commits: [padrão se houver]

---

## Portas e endpoints principais

[Se aplicável]

- Frontend: http://[IP]:[PORTA]
- API: http://[IP]:[PORTA]/api
- WebSocket: ws://[IP]:[PORTA]

---

## Observações

[Qualquer informação relevante não coberta acima]
```

---

### FASE 3 — Gerar o `gera_mapa.sh`

Crie o arquivo `gera_mapa.sh` na raiz do projeto com o seguinte conteúdo adaptado ao projeto:

```bash
#!/bin/bash
# gera_mapa.sh — Regenera o projeto.md com base no estado atual do projeto
# Uso: bash gera_mapa.sh
# Execute sempre que adicionar arquivos ou mudar a estrutura do projeto

PROJECT_NAME="[NOME DO SISTEMA]"
OUTPUT="PROJETO.md"
DATE=$(date '+%d/%m/%Y %H:%M')

echo "Gerando mapa do projeto: $PROJECT_NAME..."

cat > "$OUTPUT" << HEADER
# $PROJECT_NAME — Mapa do Projeto
> Gerado automaticamente por gera_mapa.sh
> Atualizado em: $DATE

---

## Estrutura de arquivos

HEADER

# Árvore de arquivos (exclui pastas desnecessárias)
if command -v tree &> /dev/null; then
  tree -I "node_modules|.git|dist|build|.cache|*.log" --noreport >> "$OUTPUT"
else
  find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -name "*.log" \
    | sort >> "$OUTPUT"
fi

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "## Dependências entre arquivos (imports/requires)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Mapeia imports em arquivos JS
echo "### JavaScript / Node.js" >> "$OUTPUT"
grep -r --include="*.js" \
  -E "(import .+ from|require\()" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** importa:" >> "$OUTPUT"
    grep -E "(import .+ from|require\()" "$file" \
      | grep -v "node_modules" \
      | sed 's/^/  - /' >> "$OUTPUT"
done

# Mapeia script src em arquivos HTML
echo "" >> "$OUTPUT"
echo "### HTML (script src)" >> "$OUTPUT"
grep -r --include="*.html" \
  -E 'src="[^"]*\.js"' \
  --exclude-dir=node_modules \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** carrega:" >> "$OUTPUT"
    grep -oE 'src="[^"]*\.js"' "$file" \
      | sed 's/src=//;s/"//g' \
      | sed 's/^/  - /' >> "$OUTPUT"
done

cat >> "$OUTPUT" << FOOTER

---

## Arquivos críticos (NÃO modificar sem aviso)

[Atualize esta seção manualmente conforme o projeto evoluir]

---

## Observações

Mapa gerado automaticamente. Para adicionar regras específicas,
edite o projeto.md diretamente após rodar este script.
FOOTER

echo "✅ projeto.md gerado com sucesso em: $OUTPUT"
```

Após criar o script, torne-o executável:
```bash
chmod +x gera_mapa.sh
```

---

### FASE 4 — Confirmação final

Após gerar os dois arquivos, apresente ao usuário:

```
✅ Mapa do projeto criado com sucesso.

Arquivos gerados:
  - projeto.md       → lido automaticamente pela IA em toda sessão
  - gera_mapa.sh    → rode sempre que a estrutura do projeto mudar

Próximas sessões:
  IA vai ler o projeto.md automaticamente.
  Nenhuma configuração adicional necessária.

Para atualizar o mapa após mudanças no projeto:
  bash gera_mapa.sh
```

---

## Restrições obrigatórias

- **Nunca** expor valores de variáveis de ambiente (senhas, tokens, IPs internos sensíveis)
- **Nunca** modificar arquivos existentes do projeto durante este processo
- **Nunca** instalar dependências externas para executar este spec
- Se um arquivo listado como crítico não for identificável automaticamente, **perguntar** ao usuário antes de assumir
- O `projeto.md` gerado deve ser **leve** — se ultrapassar 200 linhas, resumir a seção de dependências

---

## Compatibilidade

Este spec funciona com:
- Claude Code CLI (principal target)
- OpenCode CLI
- Cursor (via regras de projeto)
- Qualquer agente que leia arquivos markdown de contexto

---

*PROJECT_MAPPER_SPEC.md — mantido por Anthony @ Inteligencia*
