# Boas Práticas Firebase/Firestore — Economia de Leituras e Escritas

**Propósito:** guia de referência genérico, aplicável a qualquer projeto que use Firestore como banco de dados. Não é específico de nenhum sistema — é uma checklist de padrões que causam consumo desnecessário de cota (e como evitá-los), destinado a orientar quem for **codificar** ou **revisar código** com Firestore.

---

## 1. Princípio central

> **Toda escrita que não muda dado nenhum é uma escrita desperdiçada. Toda leitura que já foi feita por um listener ativo é uma leitura desperdiçada.**

O Firestore cobra por documento lido e por documento escrito — não por "operação lógica". Isso significa que a forma como o código está estruturado importa tanto quanto a lógica de negócio em si. Um sistema pode estar funcionalmente correto e, mesmo assim, consumir 10x–50x mais cota do que precisaria, só por causa de padrões de código triviais de corrigir.

---

## 2. Escritas (writes)

### 2.1 Nunca regravar uma coleção inteira para persistir 1 mudança

**Padrão problemático:**
```javascript
// Usuário edita 1 campo de 1 item da lista
function salvarLista() {
  lista.forEach(item => {
    fbDb.collection('itens').doc(item.id).set(item); // grava TODOS, mesmo os que não mudaram
  });
}
```

**Padrão correto — gravação item a item com fila de pendências:**
```javascript
var _pendentes = {};
var _timer = null;

function salvarItem(item) {
  _pendentes[item.id] = item;
  clearTimeout(_timer);
  _timer = setTimeout(flush, 300); // debounce curto, só para agrupar cliques rápidos
}

function flush() {
  var pend = _pendentes;
  _pendentes = {};
  for (var id in pend) {
    fbDb.collection('itens').doc(id).set(pend[id], { merge: true });
  }
}
```

Efeito: 1 edição de campo → no máximo 1 gravação, independente do tamanho da coleção.

### 2.2 Para documentos com múltiplos campos, prefira update de campo único a regravação do documento

Se apenas um campo do documento mudou, use `.update({ campo: valor })` em vez de `.set(documentoInteiro, { merge: true })` sempre que possível — evita reenviar payload desnecessário e reduz o risco de sobrescrever campos concorrentes.

```javascript
function atualizarCampo(id, campo, valor) {
  fbDb.collection('itens').doc(id).update({
    [campo]: valor,
    alteradoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

**Armadilha comum:** ter o caminho de campo único implementado para a maioria dos campos de um formulário, mas deixar 2–3 campos (geralmente os que dependem de lógica adicional, como campos condicionais) caindo só na regravação completa "de segurança". Isso faz o sistema manter **dois caminhos de escrita ao mesmo tempo** — um eficiente e um redundante — sem que ninguém perceba, porque funcionalmente tudo continua funcionando. **Audite todo handler de campo do formulário individualmente**, não só o botão "Salvar".

### 2.3 Nunca grave em `beforeunload` sem verificar o que mudou

É comum (e correto, como rede de segurança) ter uma rotina que roda ao fechar a aba/navegar para fora, para não perder edições que ainda não foram sincronizadas pelo debounce normal. O erro é fazer essa rotina reescrever **tudo o que está em memória**, em vez de reenviar só os itens genuinamente pendentes.

**Padrão problemático:**
```javascript
window.addEventListener('beforeunload', () => {
  todosOsItensEmMemoria.forEach(item => fbDb.collection('itens').doc(item.id).set(item));
});
```

**Padrão correto — reaproveitar a mesma fila de pendências do item 2.1:**
```javascript
window.addEventListener('beforeunload', () => {
  clearTimeout(_timer);
  flush(); // só o que está genuinamente pendente, não tudo em memória
});
```

Cada troca de aba, F5 ou fechamento de navegador que dispara uma regravação completa é, na prática, um multiplicador de custo independente do volume real de edições do usuário.

### 2.4 Debounce existe para agrupar cliques rápidos, não para "salvar depois"

Um debounce de 300–500ms é aceitável para agrupar múltiplas teclas digitadas em sequência. Não é uma desculpa para regravar mais dados do que o necessário quando o timer disparar — o debounce deve disparar a gravação do **item alterado**, não de tudo.

### 2.5 Cuidado com "self-read": toda escrita ecoa para os listeners abertos

Se a página tem um `onSnapshot` escutando uma coleção, toda escrita nessa coleção — inclusive a que a própria sessão acabou de fazer — dispara uma nova entrega do listener, contada como leitura. Isso significa que **reduzir escritas redundantes reduz automaticamente leituras redundantes**, sem precisar de nenhuma mudança separada nos listeners. É o efeito colateral mais comum de ignorar os itens acima.

### 2.6 Duplicidade / concorrência: checagem e escrita precisam ser atômicas

**Padrão problemático (race condition clássica, TOCTOU):**
```javascript
async function criarSeNaoExiste(id, dados) {
  var snap = await fbDb.collection('itens').doc(id).get(); // 1. lê
  if (snap.exists) return false;
  await fbDb.collection('itens').doc(id).set(dados);        // 2. grava
  // entre 1 e 2, outra sessão pode ter passado pela mesma checagem
}
```

**Padrão correto — `runTransaction`:**
```javascript
async function criarSeNaoExiste(id, dados) {
  var ref = fbDb.collection('itens').doc(id);
  return fbDb.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      if (snap.exists) throw new Error('duplicado');
      tx.set(ref, dados);
    });
  });
}
```
Use transação sempre que "verificar se existe" e "criar" forem passos separados e o resultado depender de não haver concorrência — contadores sequenciais, verificação de duplicidade, criação condicional.

---

## 3. Leituras (reads)

### 3.1 Nunca combine `.get()` (leitura única) com `onSnapshot` (listener) para a mesma finalidade

**Padrão problemático — lê a coleção duas vezes ao carregar a página:**
```javascript
async function carregar() {
  var dados = await fbDb.collection('itens').get(); // 1ª leitura completa
  preencherEstado(dados);
  fbDb.collection('itens').onSnapshot(snap => {      // 2ª leitura completa (entrega inicial do listener)
    atualizarEstado(snap);
  });
}
```

O `onSnapshot`, na primeira vez que é anexado, **já entrega o estado atual completo** — não é só um listener de mudanças futuras. Fazer um `.get()` antes dele é ler a mesma coleção duas vezes, todo carregamento de página.

**Padrão correto — só o listener, tratando a primeira entrega como o carregamento inicial:**
```javascript
function carregar() {
  fbDb.collection('itens').onSnapshot(snap => {
    atualizarEstado(snap); // primeira chamada = carregamento inicial; chamadas seguintes = deltas
  });
}
```

Esse é provavelmente o padrão de desperdício mais comum e mais fácil de introduzir sem perceber, porque cada chamada isolada (`.get()`, `onSnapshot`) parece razoável — o problema só aparece quando as duas coexistem para o mesmo dado.

### 3.2 Depois que um listener está aberto, ele só entrega o delta — não reléia tudo

Isso já é o comportamento nativo do Firestore e não exige nenhum código adicional: uma vez que `onSnapshot` está ativo, uma edição em 1 documento entrega só aquele documento pelo listener, não a coleção inteira de novo. **Não confunda isso com "o carregamento inicial é grátis"** — a primeira entrega do listener sempre custa 1 leitura por documento existente na query. O que se ganha ao consolidar os padrões acima é eliminar leituras **duplicadas** do carregamento inicial, não eliminar o carregamento inicial em si.

### 3.3 Sempre escope queries pelos filtros que a tela realmente usa

Se a tela mostra só os dados do usuário/filial/período atual, a query deve ter esses filtros — nunca traga a coleção inteira para filtrar no cliente.

```javascript
// Errado: lê tudo e filtra em JS
var todos = await fbDb.collection('pedidos').get();
var doAno = todos.docs.filter(d => d.data().ano === anoAtual);

// Certo: filtra na query
var doAno = await fbDb.collection('pedidos')
  .where('ano', '==', anoAtual)
  .where('ativo', '==', true)
  .get();
```

Múltiplos filtros de **igualdade** (`==`) em campos diferentes são resolvidos pelos índices automáticos de campo único do Firestore (zigzag merge join) — não exigem índice composto. Índice composto só é obrigatório quando há **desigualdade** (`<`, `>`, `!=`, `array-contains`) combinada com outro filtro, ou `orderBy` em campo diferente do filtro de desigualdade.

### 3.4 Cuidado com queries "administrativas" sem escopo (backup, exportação, relatórios)

É comum que o fluxo principal do app tenha bons filtros, mas rotinas auxiliares — exportar backup, gerar relatório, tela de administração — leiam a coleção inteira, sem filtro de período/organização. Isso não dói no início (pouco volume acumulado), mas cresce indefinidamente com o tempo de uso do sistema, e cada execução dessas rotinas fica proporcionalmente mais cara a cada ano. Trate como um item de sustentabilidade a resolver antes que o volume fique grande, não depois.

```javascript
// Sem filtro de tempo — cresce para sempre
var tudo = await fbDb.collection('pedidos').where('ativo', '==', true).get();

// Com janela de tempo configurável
var anos = [anoAtual, anoAtual - 1]; // configurável, não hardcoded para sempre
```

### 3.5 Não use nenhum listener/query cujo resultado nunca é consultado

Cada `onSnapshot` aberto é uma fonte permanente de leituras futuras enquanto a página estiver aberta. Antes de abrir um listener, confirme que a tela realmente precisa de dados em tempo real daquela coleção — dados que só são lidos uma vez (ex.: uma config estática) podem usar `.get()` puro, sem listener.

### 3.6 Trade-off: granularidade da query vs. custo de navegação

Reduzir o escopo de uma query (ex.: filtrar por mês em vez de trazer o ano inteiro) reduz a leitura inicial, mas se a interface permite trocar esse filtro livremente (trocar de mês, trocar de página), cada troca pode virar uma nova leitura ao servidor, em vez de reaproveitar dados já carregados em memória.

**Não existe resposta universal aqui** — depende do padrão de uso real:
- Se o usuário raramente troca o filtro numa mesma sessão → vale a pena restringir a query.
- Se o usuário troca o filtro constantemente (ex.: navegando entre vários meses/páginas no mesmo dia) → pode ser mais barato carregar um período maior de uma vez e filtrar em memória no cliente.

Avalie com base em métricas de uso reais antes de aplicar essa otimização — ela pode piorar o cenário que você está tentando melhorar.

### 3.7 Rotinas de "limpeza" ou "migração" devem rodar uma vez, não a cada carregamento

Se o código tem uma rotina que varre dados para limpar registros legados, migrar formato antigo, ou corrigir inconsistências, ela deve ser controlada por uma flag persistida (localStorage, um documento de controle, uma versão de schema) — nunca deve rodar incondicionalmente toda vez que a página carrega. Rotinas de migração que rodam sempre são uma fonte silenciosa de leituras (e às vezes escritas) duplicadas, porque parecem inofensivas isoladamente mas se acumulam a cada visita.

```javascript
async function migrarSeNecessario() {
  if (localStorage.getItem('migracao_v2_feita') === 'true') return;
  await limparDadosLegados();
  localStorage.setItem('migracao_v2_feita', 'true');
}
```

---

## 4. Checklist rápida para revisão de código

Ao revisar (ou escrever) qualquer código que grava ou lê do Firestore, pergunte:

- [ ] **Escrita:** esta gravação envia só o que mudou, ou reenvia dados que já estavam salvos?
- [ ] **Escrita:** existe algum handler de campo (num formulário, numa tabela editável) que ainda depende só da "regravação geral", enquanto os outros campos já têm caminho individual?
- [ ] **Escrita:** a rotina de salvar-antes-de-sair (`beforeunload` ou equivalente) reenvia só o pendente, ou tudo em memória?
- [ ] **Escrita:** criação de registro com verificação de duplicidade usa transação, ou é check-then-write vulnerável a corrida?
- [ ] **Leitura:** existe algum `.get()` seguido de `onSnapshot` para a mesma coleção/dado?
- [ ] **Leitura:** a query tem os filtros que a tela realmente precisa, ou traz mais do que o necessário para filtrar no cliente depois?
- [ ] **Leitura:** rotinas administrativas (backup, relatório, export) têm escopo de tempo/organização, ou leem a coleção inteira sempre?
- [ ] **Leitura:** existe alguma rotina de migração/limpeza que roda a cada carregamento em vez de rodar uma vez só?
- [ ] **Geral:** dado o padrão de uso real (não o hipotético), o trade-off entre "query mais restrita" e "mais leituras por troca de filtro" foi considerado?

---

## 5. Como isso se traduz em custo — resumo mental

| Padrão | Custo por edição de 1 campo | Custo por carregamento de página |
|---|---|---|
| Regravação completa da coleção | N gravações (N = tamanho da coleção) | — |
| Item individual + fila de pendências | 1 gravação | — |
| `.get()` + `onSnapshot` para a mesma coleção | — | 2× leituras completas |
| Só `onSnapshot` | — | 1× leitura completa |
| Query sem filtro de escopo | — | cresce com o tempo de uso do sistema, sem limite |
| Query com filtro de escopo adequado | — | proporcional ao que a tela realmente mostra |

O objetivo de qualquer revisão de custo em Firestore é sempre o mesmo: **cada operação lógica do usuário (1 edição, 1 carregamento de tela) deve custar 1 operação de banco — não N, não 2×.**
