#!/bin/bash
# gera_mapa.sh — Regenera o projeto.md com base no estado atual do projeto
# Uso: bash gera_mapa.sh
# Execute sempre que adicionar arquivos ou mudar a estrutura do projeto
# No Windows: rode com Git Bash ou WSL

PROJECT_NAME="Controle de Retirada de Paletes"
OUTPUT="projeto.md"
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
  tree -I "node_modules|.git|dist|build|.cache|*.log|conversas" --noreport >> "$OUTPUT"
else
  find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/conversas/*" \
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

# Mapeia script/link em arquivos HTML
echo "### HTML (script src / link href)" >> "$OUTPUT"
grep -r --include="*.html" \
  -E '(src="[^"]*\.(js|css)"|href="[^"]*\.css")' \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=conversas \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** carrega:" >> "$OUTPUT"
    grep -oE '(src="[^"]*"|href="[^"]*")' "$file" \
      | grep -E '\.(js|css)"' \
      | sed 's/^/  - /' >> "$OUTPUT"
done

# Mapeia localStorage keys usadas no JS
echo "" >> "$OUTPUT"
echo "### localStorage keys" >> "$OUTPUT"
grep -r --include="*.js" --include="*.html" \
  -E "localStorage\.(get|set)Item\(" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=conversas \
  -l . 2>/dev/null | sort | while read file; do
    echo "" >> "$OUTPUT"
    echo "**$file** usa:" >> "$OUTPUT"
    grep -oE "localStorage\.(get|set)Item\('[^']*'" "$file" \
      | sed "s/localStorage\.\(get\|set\)Item('//;s/'$//" \
      | sort -u \
      | sed 's/^/  - `/' | sed 's/$/`/' >> "$OUTPUT"
done

cat >> "$OUTPUT" << FOOTER

---

## Arquivos críticos (NÃO modificar sem aviso)

- \`app.js\` — toda lógica de negócio, state, rendering, localStorage
- \`style.css\` — todos os estilos globais e responsivos
- \`index.html\` — estrutura da SPA, modais, sidebar

---

## Observações

Mapa gerado automaticamente. Para adicionar regras específicas,
edite o projeto.md diretamente após rodar este script.
FOOTER

echo "projeto.md gerado com sucesso em: $OUTPUT"
