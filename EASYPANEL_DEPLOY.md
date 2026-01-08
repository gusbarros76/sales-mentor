# 🚀 Deploy Sales Mentor no EasyPanel (Contabo VPS)

## Cenário
- ✅ VPS Contabo com EasyPanel instalado
- ✅ PostgreSQL já rodando no EasyPanel
- 🎯 Objetivo: Deploy do backend Node.js

---

## Passo 1: Preparar Database no PostgreSQL

### 1.1 Acessar PostgreSQL no EasyPanel

1. No EasyPanel, vá até o service **PostgreSQL**
2. Clique em **"Console"** ou **"Terminal"**
3. Execute:

```sql
-- Conectar ao PostgreSQL
\c postgres

-- Criar database
CREATE DATABASE salesmentor;

-- Criar usuário (se não existir)
CREATE USER salesmentor WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';

-- Dar permissões
GRANT ALL PRIVILEGES ON DATABASE salesmentor TO salesmentor;

-- Verificar
\l
\q
```

### 1.2 Anotar Credenciais

Você precisará:
- **Host**: Nome do service PostgreSQL no EasyPanel (ex: `postgres`, `postgres-1`, etc.)
- **Port**: `5432` (padrão)
- **User**: `salesmentor`
- **Password**: A senha que você criou
- **Database**: `salesmentor`

**DATABASE_URL** completa:
```
postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor
```

💡 **Dica**: Se os services estão na mesma network do EasyPanel, use o nome do service como host (ex: `postgres`).

---

## Passo 2: Criar Aplicação Node.js no EasyPanel

### 2.1 Opção A: Deploy via GitHub (Recomendado)

1. **No EasyPanel**, clique em **"+ Create"** → **"App"**
2. Escolha **"GitHub"**
3. Selecione o repositório: `sales-mentor`
4. Configure:
   - **Name**: `salesmentor-backend`
   - **Type**: `App`
   - **Source**: GitHub
   - **Branch**: `main`

### 2.2 Opção B: Deploy via Dockerfile

1. **No EasyPanel**, clique em **"+ Create"** → **"App"**
2. Escolha **"Docker"**
3. Configure:
   - **Name**: `salesmentor-backend`
   - **Type**: `App`
   - **Source**: Dockerfile
   - **Repository**: (seu repositório Git)
   - **Dockerfile Path**: `apps/realtime-api/Dockerfile`
   - **Build Context**: `apps/realtime-api`

### 2.3 Configuração de Build

Se o EasyPanel pedir configurações adicionais:

**Build Settings:**
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `node dist/index.js`
- **Port**: `8080`

**Environment Variables** (ver próximo passo)

---

## Passo 3: Configurar Variáveis de Ambiente

No EasyPanel, vá em **Environment** do app `salesmentor-backend` e adicione:

```bash
# Database (conecta ao PostgreSQL do EasyPanel)
DATABASE_URL=postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor

# OpenAI (obrigatório)
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXX

# JWT Secret (gere um novo)
INSIGHTS_JWT_SECRET=COLE_AQUI_O_SECRET_GERADO

# Node Environment
NODE_ENV=production
PORT=8080
```

### 3.1 Gerar JWT Secret Forte

No seu terminal local:
```bash
openssl rand -base64 32
```

Copie o resultado e cole em `INSIGHTS_JWT_SECRET`.

---

## Passo 4: Deploy da Aplicação

1. No EasyPanel, clique em **"Deploy"**
2. Aguarde o build (2-5 minutos na primeira vez)
3. Acompanhe os **Logs** em tempo real

**O que acontece:**
- EasyPanel clona o repositório
- Executa `Dockerfile` (instala pnpm, build TypeScript)
- Inicia o servidor Node.js na porta 8080

### 4.1 Verificar Status

Quando deploy estiver completo:

```bash
# No terminal local, teste o health check
curl https://SEU_DOMINIO/health

# Ou se ainda não tiver domínio:
curl http://IP_DA_VPS:8080/health
```

**Resposta esperada:**
```json
{"status":"ok","timestamp":"2026-01-07T..."}
```

---

## Passo 5: Rodar Migrations do Banco de Dados

⚠️ **IMPORTANTE**: Migrations devem rodar ANTES de usar a aplicação.

### Opção A: Via Terminal do EasyPanel

1. No EasyPanel, vá no app `salesmentor-backend`
2. Clique em **"Console"** ou **"Terminal"**
3. Execute:

```bash
# Navegar para o diretório
cd /app

# Instalar node-pg-migrate (se necessário)
npm install -g node-pg-migrate

# Definir DATABASE_URL
export DATABASE_URL="postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor"

# Rodar migrations
node-pg-migrate up -m ../../db/migrations
```

### Opção B: Via SSH na VPS

```bash
# Conectar via SSH
ssh root@SEU_IP_CONTABO

# Listar containers
docker ps | grep salesmentor

# Entrar no container
docker exec -it <CONTAINER_ID> sh

# Rodar migrations
export DATABASE_URL="postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor"
cd /app
npx node-pg-migrate up -m ../../db/migrations
```

### Opção C: Script Automatizado

Crie localmente `run-migrations.sh`:

```bash
#!/bin/bash
# Script para rodar migrations via SSH

VPS_IP="SEU_IP_AQUI"
CONTAINER_NAME="salesmentor-backend"  # Verifique nome exato no EasyPanel
DATABASE_URL="postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor"

ssh root@$VPS_IP << EOF
docker exec -i $CONTAINER_NAME sh -c "
export DATABASE_URL='$DATABASE_URL'
cd /app
npx node-pg-migrate up -m ../../db/migrations
"
EOF

echo "✅ Migrations completed!"
```

Execute:
```bash
chmod +x run-migrations.sh
./run-migrations.sh
```

### 5.1 Verificar Migrations

```bash
# Conectar ao PostgreSQL
docker exec -it <POSTGRES_CONTAINER> psql -U salesmentor -d salesmentor

# Listar tabelas
\dt

# Deve mostrar:
# - companies
# - users
# - agents
# - calls
# - segments
# - insights
# - reports
# - pgmigrations

\q
```

---

## Passo 6: Seed de Dados (Opcional)

Criar empresa e agente demo para testes:

```bash
# No container do backend
docker exec -it salesmentor-backend sh

export DATABASE_URL="postgres://salesmentor:SUA_SENHA@postgres:5432/salesmentor"
cd /app
node scripts/seed.js
```

**Anote os IDs retornados:**
```
✅ Company created: company_123456
✅ Agent created: agent_789012
```

---

## Passo 7: Configurar Domínio e SSL

### 7.1 No EasyPanel

1. Vá em **Domains** do app `salesmentor-backend`
2. Clique em **"Add Domain"**
3. Digite: `api.salesmentor.com` (ou seu domínio)
4. Ative **SSL/TLS** (Let's Encrypt automático)

### 7.2 Configurar DNS

No seu provedor de DNS (Cloudflare, GoDaddy, etc.):

```
Tipo    Nome                Valor
A       api.salesmentor     IP_DA_VPS_CONTABO
```

Aguarde propagação DNS (5-30 minutos).

### 7.3 Testar HTTPS

```bash
curl https://api.salesmentor.com/health
```

---

## Passo 8: Testar WebSocket

### 8.1 Instalar wscat (local)

```bash
npm install -g wscat
```

### 8.2 Testar Conexão

```bash
# Conectar ao WebSocket
wscat -c "wss://api.salesmentor.com/v1/ws?call_id=test-123&token=test"

# Deve conectar e aguardar mensagens
> Connected (press CTRL+C to quit)
```

Se conectar = ✅ funcionando!

---

## Passo 9: Atualizar Extensão Chrome

### 9.1 Criar arquivo de configuração

Crie `apps/extension/src/config.ts`:

```typescript
// Configuração de ambiente
export const config = {
  // URL do backend (sem trailing slash)
  apiUrl: import.meta.env.VITE_API_URL || 'https://api.salesmentor.com',

  // WebSocket URL
  wsUrl: import.meta.env.VITE_WS_URL || 'wss://api.salesmentor.com',

  // Ambiente
  isDev: import.meta.env.DEV,
};
```

### 9.2 Criar .env.production

Crie `apps/extension/.env.production`:

```bash
VITE_API_URL=https://api.salesmentor.com
VITE_WS_URL=wss://api.salesmentor.com
```

### 9.3 Atualizar content-script.ts

Em `apps/extension/src/content/content-script.ts`, importe e use o config:

```typescript
import { config } from '../config';

// ...

function connectWebSocket(callId: string) {
  const wsUrl = `${config.wsUrl}/v1/ws?call_id=${callId}&token=placeholder`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ WebSocket connected:', wsUrl);
  };

  // ... resto do código
}
```

### 9.4 Build para Produção

```bash
cd apps/extension
pnpm build --mode production

# Ou se tiver script:
./build-for-client.sh https://api.salesmentor.com
```

---

## Passo 10: Monitoramento e Logs

### 10.1 Ver Logs no EasyPanel

1. No app `salesmentor-backend`, clique em **"Logs"**
2. Logs em tempo real aparecem aqui
3. Filtre por:
   - `ERROR` - erros
   - `WebSocket` - conexões WS
   - `insight` - insights gerados

### 10.2 Verificar Métricas

Em **Metrics**:
- **CPU**: Deve ficar < 10% em idle
- **RAM**: ~100-200MB em idle
- **Network**: Picos durante calls

### 10.3 Health Checks

EasyPanel já configura health check automaticamente usando:
- Endpoint: `/health`
- Interval: 30s
- Timeout: 3s

Se o app parar de responder, EasyPanel reinicia automaticamente.

---

## Troubleshooting

### ❌ Backend não inicia

**Erro**: `Cannot connect to database`

**Solução**:
1. Verificar `DATABASE_URL` está correta
2. Verificar PostgreSQL está rodando: `docker ps | grep postgres`
3. Testar conexão manual:
```bash
docker exec -it salesmentor-backend sh
apk add postgresql-client
psql "$DATABASE_URL"
```

### ❌ WebSocket não conecta

**Erro**: Extensão mostra "Reconnecting..." infinitamente

**Solução**:
1. Verificar CORS no backend (deve aceitar `chrome-extension://`)
2. Verificar porta 8080 está exposta no EasyPanel
3. Testar com wscat:
```bash
wscat -c "wss://api.salesmentor.com/v1/ws?call_id=test&token=test"
```
4. Ver logs do backend durante tentativa de conexão

### ❌ Migrations falham

**Erro**: `relation "companies" does not exist`

**Solução**:
1. Verificar migrations foram executadas:
```bash
docker exec -it <postgres> psql -U salesmentor -d salesmentor -c "\dt"
```
2. Se não houver tabelas, rodar migrations novamente (ver Passo 5)
3. Se necessário, dropar e recriar database:
```sql
DROP DATABASE salesmentor;
CREATE DATABASE salesmentor;
GRANT ALL PRIVILEGES ON DATABASE salesmentor TO salesmentor;
```

### ❌ OpenAI rate limit

**Erro**: `429 Too Many Requests` nos logs

**Solução**:
1. Verificar `OPENAI_API_KEY` está correta
2. Verificar saldo na conta OpenAI: https://platform.openai.com/usage
3. Ajustar cooldown (editar backend se necessário)

### ❌ Build falha

**Erro**: `pnpm: not found`

**Solução**:
1. Verificar Dockerfile instala pnpm corretamente
2. No EasyPanel, forçar uso do Dockerfile:
   - Build Method: `Dockerfile`
   - Dockerfile Path: `apps/realtime-api/Dockerfile`
   - Build Context: `apps/realtime-api`

---

## Checklist Final

### ✅ Backend
- [ ] App criado no EasyPanel
- [ ] Variáveis de ambiente configuradas
- [ ] Build completado com sucesso
- [ ] Health check retorna `{"status":"ok"}`
- [ ] Logs não mostram erros

### ✅ Database
- [ ] PostgreSQL rodando
- [ ] Database `salesmentor` criada
- [ ] Migrations executadas
- [ ] Tabelas criadas (companies, agents, calls, etc.)

### ✅ Networking
- [ ] Domínio configurado (opcional)
- [ ] SSL/TLS ativo (Let's Encrypt)
- [ ] WebSocket conecta com wscat
- [ ] Health check acessível externamente

### ✅ Extensão
- [ ] config.ts criado
- [ ] .env.production configurado
- [ ] Build realizado
- [ ] Testado localmente
- [ ] Conecta ao backend em produção

---

## Comandos Úteis

```bash
# Ver logs em tempo real
docker logs -f <CONTAINER_ID>

# Reiniciar app
docker restart <CONTAINER_ID>

# Acessar console do container
docker exec -it <CONTAINER_ID> sh

# Verificar variáveis de ambiente
docker exec -it <CONTAINER_ID> env | grep DATABASE

# Testar health check
curl https://api.salesmentor.com/health

# Testar WebSocket
wscat -c "wss://api.salesmentor.com/v1/ws?call_id=test&token=test"

# Backup PostgreSQL
docker exec -it <POSTGRES_CONTAINER> pg_dump -U salesmentor salesmentor > backup.sql

# Restaurar backup
docker exec -i <POSTGRES_CONTAINER> psql -U salesmentor salesmentor < backup.sql
```

---

## Arquivos de Referência

- **Dockerfile**: `apps/realtime-api/Dockerfile`
- **Docker Compose**: `infra/docker-compose.prod.yml` (referência, não usado no EasyPanel)
- **Migrations**: `db/migrations/`
- **Backend Source**: `apps/realtime-api/src/`
- **Extension**: `apps/extension/`

---

## Próximos Passos

1. ✅ Backend rodando no EasyPanel
2. ✅ PostgreSQL configurado
3. ✅ Migrations executadas
4. ✅ SSL/TLS ativo
5. ⬜ Monitoramento com logs
6. ⬜ Backup automático do PostgreSQL
7. ⬜ CI/CD com GitHub Actions (opcional)

---

**Última atualização**: 07/01/2026

**Dúvidas?** Verifique logs no EasyPanel primeiro, depois consulte este guia.
