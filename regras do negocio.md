# Regras de Negócio — Controle de Retirada de Paletes

---

## 1. Agendamentos

### 1.1 Slots de horário
- Slots fixos: 09:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00
- Sem agendamento durante intervalo de almoço (12:00)
- Máximo de **1000 paletes** por slot

### 1.2 Conflito de horário
- Não pode existir dois agendamentos **ativos** (não Cancelado) no mesmo **data + horário**
- Agendamentos Cancelados não entram na verificação de conflito

### 1.3 Status do agendamento
| Status | Significado |
|---|---|
| **Agendado** | Aguardando retirada — estoque ainda NÃO foi baixado |
| **Confirmado** | Retirada realizada — estoque foi baixado automaticamente |
| **Cancelado** | Retirada cancelada — sem efeito no estoque |

### 1.4 Fluxo de status
```
Agendado ──→ Confirmado (estoque baixado)
Agendado ──→ Cancelado (sem efeito)
Confirmado ──→ Agendado (estoque devolvido automaticamente)
Confirmado ──→ Cancelado (estoque devolvido automaticamente)
Cancelado ──→ Agendado (pode reagendar)
```

### 1.5 Campos bloqueados após confirmação
Quando o agendamento está **Confirmado**, os seguintes campos ficam **bloqueados** (não editáveis):
- Quantidade de paletes
- Centro de Distribuição (CD)
- Tipo de Palete

O campo **Status** continua editável — ao voltar para Agendado/Cancelado, o estoque é devolvido.

### 1.6 Exclusão de agendamento
- Agendamento **Confirmado** que é excluído → estoque é devolvido automaticamente antes da exclusão
- Agendamento **Agendado** ou **Cancelado** que é excluído → sem efeito no estoque

### 1.7 Fornecedor automático
- Se o fornecedor informado no agendamento não existe no cadastro, ele é criado automaticamente com categoria "Truck"

---

## 2. Estoque

### 2.1 Estrutura
- **2 CDs:** CD1 e CD2
- **2 tipos de palete:** CHEP e PBR
- Cada CD mantém estoque separado por tipo

### 2.2 Chave de armazenamento
- Estoque é compartilhado entre `index.html` (app.js) e `gerenciamento.html`
- Chave localStorage: `nagumo_paletes_v1`
- **NUNCA renomear** sem sincronizar ambas as páginas

### 2.3 Baixa automática (Saída)
- Ocorre ao **confirmar** um agendamento (status → Confirmado)
- Se estoque insuficiente: baixa o que tem disponível e exibe aviso
- Se estoque zerado: impede a confirmação e exibe erro

### 2.4 Devolução automática (Entrada)
- Ocorre ao **voltar** status de Confirmado para Agendado/Cancelado
- Ocorre ao **excluir** agendamento que estava Confirmado
- Devolve exatamente a quantidade original de paletes do agendamento

### 2.5 Histórico de movimentações
Cada movimentação (Saída/Entrada) é registrada no histórico do CD com:
- ID único
- Data/hora (ISO)
- Tipo de palete
- Tipo de movimento (Saída/Entrada)
- Quantidade
- Observação (descrição do agendamento)

---

## 3. Usuários

### 3.1 Papéis
| Papel | Permissões |
|---|---|
| **admin** | Acesso total — incluindo Configurações |
| **usuario** | Acesso limitado — Configurações oculta |

### 3.2 Sessão
- Controle via `paletes.session` no localStorage
- Sessão é **excluída** dos backups por segurança

---

## 4. Backup

### 4.1 Exportação
- Coleta todas as chaves `paletes.*` e `nagumo_*` do localStorage
- Exclui `paletes.session`
- Adiciona `_meta` com timestamp e versão

### 4.2 Importação
- Valida formato (requer `_meta.timestamp`)
- Exibe resumo comparando registros atuais vs backup
- Avisa se backup é mais antigo que os dados atuais
- **Cria backup de segurança automático** antes de sobrescrever

### 4.3 Logout com backup
- Ao clicar "Sair", modal oferece 3 opções:
  - Sim, fazer backup e sair
  - Sair sem backup
  - Cancelar

---

## 5. Histórico / Auditoria

### 5.1 O que é registrado
| Tipo | Ações |
|---|---|
| **Agendamento** | Criação, edição, exclusão |
| **Fornecedor** | Criação, edição, exclusão |
| **Usuário** | Criação, edição, exclusão |
| **Estoque** | Movimentações (Saída/Entrada) |

### 5.2 Sincronização de estoque
- O histórico de estoque do `gerenciamento.html` é sincronizado via `syncStockHistory()`
- Deduplicação por `[ID:]` nas descrições

---

## 6. Formatos

### 6.1 Data e hora
| Contexto | Formato | Exemplo |
|---|---|---|
| Lista/Calendário | DD/MM/YYYY | 25/07/2026 |
| Backup | DD/MM/YYYY HH:MM | 25/07/2026 14:30 |
| Interno (ISO) | YYYY-MM-DDTHH:MM:SS.sssZ | 2026-07-25T14:30:00.000Z |

### 6.2 Placa de veículo
- Formato aceito: `ABC-1234` ou `ABC1234`
- Conversão automática para maiúsculas

### 6.3 Paletes
- Máximo: 1000 por agendamento
- Tipos válidos: CHEP, PBR

---

## 7. Integridade de dados

### 7.1 Regra de ouro
> **Nunca alterar estoque manualmente sem entender o impacto nos agendamentos confirmados.**

### 7.2 Proteções
- Agendamentos Confirmado com campos de estoque bloqueados
- Devolução automática ao voltar status ou excluir confirmado
- Backup de segurança antes de qualquer importação
- Validação de conflito de horário

---

*Documento de regras de negócio — Controle de Retirada de Paletes*
