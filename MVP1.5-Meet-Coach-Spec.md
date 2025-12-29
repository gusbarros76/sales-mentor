##data/hora atual##
2025-12-28 16:18:00 (America/Sao_Paulo)

# MVP 1.5 — Meet Coach (Transcrição + Insights em tempo real)
Projeto: Extensão Chrome (Google Meet) + Backend Insights (VPS) + ASR (AssemblyAI) + LLM (OpenAI)

## 0) Contexto e premissas
- Objetivo do MVP 1.5: demonstrar em reunião real (1–2h) que:
  - a transcrição do cliente e do vendedor aparece em quase tempo real
  - o sistema gera insights acionáveis ao vendedor durante a call
  - ao final, gera relatório completo e armazenado por **Empresa** e **Agente**
- ASR: AssemblyAI (streaming via WebSocket) direto da extensão (sem passar áudio pelo backend).
- LLM: OpenAI (somente para gerar “cards” de coaching e relatórios; gatilhos são regidos por regras).
- Hospedagem: VPS com domínio + SSL (ex.: insights.gustavobarrosmessora.com.br).

---

## 1) Personas e escopo multi-tenant (obrigatório)
### 1.1 Entidades
- **Empresa (Tenant)**: Empresa A, Empresa B, etc.
- **Agente (User/Agent)**: João Silva, Maria Aparecida, etc.
- **Reunião (Call Session)**: 1 sessão por call.
- **Segmentos (Segments)**: pedaços de transcrição com timestamps e origem.
- **Insights (Live Coaching Events)**: cards gerados durante a call.
- **Relatório (Post-call Report)**: sumário final + itens extraídos.

### 1.2 Papéis (RBAC) — já pensando em fase 2/3
- **OWNER** (dono/gerente): vê tudo da empresa (todos agentes e calls).
- **MANAGER** (opcional): vê equipe (subset).
- **AGENT**: vê apenas suas calls e seus relatórios.

---

## 2) Escopo funcional — MVP 1.5 (o que entra)

### 2.1 Extensão Chrome (Google Meet)
**Captação dual-channel**
- Canal MIC (vendedor): `getUserMedia({ audio: true })`
- Canal TAB (cliente): `chrome.tabCapture` na aba do Meet

**Streaming ASR (AssemblyAI)**
- Abrir 2 WebSockets para AssemblyAI:
  - `mic_stream`
  - `tab_stream`
- Enviar áudio em chunks (PCM/16k/mono conforme pipeline definido).
- Receber transcrição incremental (partial) + final, com timestamps.

**Overlay UI no Meet**
- Sidebar/painel flutuante:
  - Transcrição ao vivo:
    - Cliente (TAB) em destaque
    - Vendedor (MIC) em segundo plano
  - Cards de insights (ao vivo) com histórico curto
  - Health status:
    - MIC: ok/erro
    - TAB: ok/erro
    - ASR: ok/erro
    - Insights backend: ok/erro
    - Latência aproximada

**Identificação Cliente vs Vendedor**
- MIC => VENDEDOR
- TAB => CLIENTE
- Supressão de eco/duplicata (mínima viável):
  - se texto do TAB for altamente similar a um texto recente do MIC (janela de 3–8s), marcar como duplicata e não tratar como fala do cliente

### 2.2 Backend (VPS) — “Insights Realtime API”
Responsabilidades:
- Receber “falas do cliente” (texto + timestamps + session_id).
- Rodar **motor de regras** (gatilhos) para decidir quando chamar LLM.
- Chamar OpenAI apenas para:
  - gerar 1 card de coaching (curto e acionável)
  - consolidar relatório final
- Persistir sessões/segmentos/insights/relatórios (Postgres).
- Entregar insights ao overlay via WebSocket (ou SSE).

### 2.3 Relatório pós-call
Ao encerrar sessão:
- Consolidar transcrição completa (cliente + vendedor).
- Gerar relatório final:
  - Resumo executivo
  - Necessidades/dor
  - Objeções
  - Sinais de compra
  - Próximos passos (com donos e datas sugeridas)
  - “Checklist do vendedor nas próximas 24h”
- Salvar por Empresa e Agente.

---

## 3) Fora do escopo (MVP 1.5)
- Zoom desktop app (somente Zoom web no futuro).
- Diarização avançada multi-speaker além de MIC/TAB.
- CRM integrações completas (somente hooks para n8n).
- Publicação Chrome Web Store (piloto via “unpacked”/distribuição privada).

---

## 4) Arquitetura técnica (detalhada)

### 4.1 Componentes (Extensão)
- `service_worker` (MV3)
  - inicia sessão
  - abre offscreen document
  - gerencia conexões/mensagens
- `offscreen.html` + `offscreen.ts`
  - captura MIC e TAB
  - pipeline de áudio (resample/encode)
  - conecta WS AssemblyAI (2 streams)
  - emite eventos de transcrição
- `content_script` (Meet)
  - injeta overlay UI
  - recebe transcrição + insights
  - renderiza feed e cards
- `popup`
  - selecionar Empresa/Agente (ou auto via login)
  - Start/Stop
  - status

### 4.2 Componentes (Backend)
- `realtime-api` (Node.js + TypeScript)
  - HTTP:
    - criar sessão
    - encerrar sessão
    - baixar relatório
  - WS:
    - canal de insights (server push)
  - engine:
    - regras + cooldown + debounce
    - chamadas OpenAI (cards e relatório)
  - storage:
    - Postgres (multi-tenant)

### 4.3 Infra (VPS)
- Reverse proxy: Nginx ou Caddy
  - WS upgrade
  - timeouts ajustados para conexões longas
- Process manager: Docker compose (preferencial)
  - restart policy
  - logs
- Observabilidade mínima:
  - request logs
  - session logs
  - erros ASR/LLM
  - contadores de latência

---

## 5) Modelo de dados (Postgres) — multi-tenant desde o começo

### 5.1 Tabelas principais
**companies**
- id (uuid)
- name
- created_at

**users**
- id (uuid)
- company_id (uuid)
- name
- email (unique por company)
- role (OWNER | MANAGER | AGENT)
- created_at

**agents** (opcional se quiser separar “user” vs “agente”)
- id (uuid)
- company_id
- user_id
- display_name

**calls**
- id (uuid)
- company_id
- agent_id
- started_at
- ended_at
- title (opcional)
- metadata jsonb (ex.: meet_url, cliente_nome se fornecido)
- status (RUNNING | ENDED | FAILED)

**segments**
- id (uuid)
- call_id
- source (MIC | TAB)
- speaker (VENDEDOR | CLIENTE)
- start_ms
- end_ms
- text
- asr_confidence (nullable)
- is_echo_suspected boolean default false
- created_at

**insights**
- id (uuid)
- call_id
- created_at
- type (BUYING_SIGNAL | PRICE | OBJECTION | NEXT_STEP | RISK | OTHER)
- confidence (0..1)
- quote (text)
- suggestions jsonb (array de strings)
- model jsonb (provider/model/version)
- dedupe_key (para evitar repetição)

**reports**
- id (uuid)
- call_id
- created_at
- report_md (text)
- report_json (jsonb)
- model jsonb

### 5.2 Índices mínimos
- calls(company_id, agent_id, started_at desc)
- segments(call_id, start_ms)
- insights(call_id, created_at desc)

---

## 6) Contratos de API (MVP)

### 6.1 Autenticação
MVP: token por sessão (JWT curto) emitido pelo backend.
Fase 2: login completo + RBAC.

### 6.2 Endpoints HTTP
- `POST /v1/calls`
  - body: { company_id, agent_id, title?, metadata? }
  - returns: { call_id, ws_insights_url, session_token }

- `POST /v1/calls/:call_id/stop`
  - returns: { status: "ENDED" }

- `GET /v1/calls/:call_id/report`
  - returns: { report_md, report_json }

### 6.3 WebSocket (insights)
- `wss://insights.../v1/ws?call_id=...&token=...`

**Mensagens (client -> server)**
- `client_segment`:
  - { call_id, speaker:"CLIENTE", start_ms, end_ms, text, source:"TAB" }

**Mensagens (server -> client)**
- `insight_event`:
  - { call_id, type, confidence, quote, suggestions[], ts_ms }
- `status`:
  - { ok:true, msg?, latency_ms? }

---

## 7) Motor de regras + LLM (design para “parecer produto pago”)

### 7.1 Por que regras primeiro
- Reduz custo.
- Aumenta previsibilidade.
- Evita spam.

### 7.2 Regras (MVP)
Categorias e triggers (exemplos):
- BUYING_SIGNAL: “tenho interesse”, “quero avançar”, “fechar”, “vamos fazer”
- HOW_IT_WORKS: “como funciona”, “me explica”, “qual o processo”
- PRICE: “quanto custa”, “valor”, “caro”, “orçamento”
- OBJECTION: “preciso pensar”, “sem tempo”, “já uso X”, “não agora”
- NEXT_STEP: “manda proposta”, “faz demo”, “contrato”, “agenda”
- RISK: silêncio longo (se você medir), confusão recorrente, repetição de objeções

### 7.3 Cooldown e dedupe (obrigatório)
- Cooldown por categoria: 60–120s
- Dedupe por janela: se quote similar já gerou card, apenas atualiza o existente.

### 7.4 Prompt do LLM (padrão)
- Entrada: categoria + última fala do cliente + contexto curto (últimos N segmentos do cliente) + “playbook fixo”.
- Saída: card com:
  - título curto
  - 2–3 ações objetivas
  - uma pergunta sugerida

---

## 8) Deploy e operação (VPS)
- `docker-compose.yml` com:
  - realtime-api
  - postgres
  - (opcional) redis
- Reverse proxy:
  - upgrade WS
  - timeouts longos
- Logs:
  - por call_id
  - erros de OpenAI
  - contagem de tokens (por call)
- Backups básicos Postgres (cron)

---

## 9) Backlog de implementação (ordem recomendada)

### Fase 1 — “Transcrição dual-channel visível”
1) Scaffold extensão MV3 + offscreen + overlay
2) Captura MIC OK (sem ASR ainda)
3) Captura TAB OK (sem ASR ainda)
4) Pipeline de áudio e 2 WS AssemblyAI
5) Renderizar transcrição incremental (MIC/TAB) no overlay
6) Stop / cleanup / reconexão básica

**DoD Fase 1**: em call real, texto aparece e não morre em 30+ minutos.

### Fase 2 — “Insights ao vivo (regras + LLM)”
7) Backend realtime-api (VPS) + WS insights
8) Regras + cooldown + dedupe
9) Chamada OpenAI para gerar cards
10) Overlay: cards ao vivo + health indicators

**DoD Fase 2**: frases típicas do cliente geram cards coerentes sem spam.

### Fase 3 — “Persistência + Relatório + multi-tenant”
11) Postgres schema multi-tenant
12) Persistir calls/segments/insights
13) Gerar relatório final (OpenAI) e armazenar
14) Endpoint para baixar relatório

**DoD Fase 3**: após a call, relatório existe e está associado a Empresa/Agente.

---

## 10) Fase 2/3 (produto) — dashboards e gestão (planejado, não bloqueia MVP)

### 10.1 Portal Web (Dashboard)
Requisitos (fase 2/3):
- Login por empresa
- RBAC:
  - OWNER/MANAGER: ver todos agentes, todas calls, métricas agregadas
  - AGENT: ver apenas suas calls
- Tela 1: “Calls”
  - filtros por agente, data, tags, resultado
- Tela 2: “Call details”
  - transcript com busca
  - insights gerados + timeline
  - relatório final
- Tela 3: “Performance”
  - volume de calls por agente
  - taxa de “sinais de compra” vs “objeções”
  - tempo médio de call
  - “próximos passos definidos” (indicador de qualidade)
  - ranking por período

### 10.2 Métricas avançadas (fase 3+)
- Talk ratio (cliente vs vendedor)
- Interrupções
- Tempo até primeiro “next step”
- Categoria dominante de objeção
- Comparativo agente vs média da empresa

### 10.3 Integração n8n (fase 2/3)
- Webhook ao finalizar call:
  - enviar resumo + próximos passos por WhatsApp/email
  - criar tarefa no CRM
  - salvar relatório no Drive/Notion

---

## 11) Checklist de demo (reunião real 1–2h)
Pré-call:
- Selecionar Empresa + Agente
- Testar MIC e TAB
- Status “ASR ok / Insights ok”
Durante:
- Ver feed do cliente em destaque
- Ver cards sem spam
- Se oscilar, reconectar sem perder a sessão
Pós:
- Gerar relatório em 30–90s (depende do tamanho) e abrir link

---

## 12) Riscos e mitigação
- TAB capture falhar: fallback (opcional) para captions scraping como modo degradado
- Echo/duplicata: dedupe simples já reduz 80% do ruído
- Latência ASR: ajustar chunk size e buffering
- Custos OpenAI: chamar somente quando regra disparar; consolidar relatório uma vez no final
