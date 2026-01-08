# 🚀 Sales Mentor - Guia de Deploy em Produção

## Visão Geral

Este guia explica como fazer deploy do **backend** no servidor e preparar a **extensão Chrome** para distribuição ao cliente.

## Arquitetura

```
[Cliente Browser] → [Extensão Chrome] → [Backend (VPS)] → [PostgreSQL]
                                          ↓
                                      [OpenAI API]
```

---

## PARTE 1: Deploy do Backend no Servidor

### 1.1. Pré-requisitos no Servidor

- Ubuntu 20.04+ ou CentOS 7+
- Docker e Docker Compose instalados
- Portas abertas: 80, 443, 8080, 5432
- Certificado SSL (opcional mas recomendado)

### 1.2. Instalar Docker (se não tiver)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 1.3. Clonar Repositório no Servidor

```bash
cd /opt
git clone <URL_DO_SEU_REPO> sales-mentor
cd sales-mentor
```

### 1.4. Configurar Variáveis de Ambiente

```bash
# Copiar exemplo
cp .env.production.example .env.production

# Editar com suas credenciais
nano .env.production
```

**Configurações obrigatórias:**

```bash
# Database
DATABASE_URL=postgres://salesmentor:SUA_SENHA_FORTE@localhost:5432/salesmentor

# OpenAI
OPENAI_API_KEY=sk-proj-SUA_API_KEY_AQUI

# JWT Secret (GERE UM NOVO!)
INSIGHTS_JWT_SECRET=$(openssl rand -hex 32)

# Environment
NODE_ENV=production
PORT=8080
```

### 1.5. Gerar JWT Secret Forte

```bash
# Gere um secret aleatório
openssl rand -hex 32

# Copie o resultado e adicione em .env.production
```

### 1.6. Executar Deploy

```bash
cd infra
./deploy.sh
```

O script irá:
1. ✅ Verificar configuração
2. ✅ Construir imagens Docker
3. ✅ Iniciar PostgreSQL
4. ✅ Iniciar Backend
5. ✅ Executar health check

### 1.7. Executar Migrations do Banco

```bash
# Na raiz do projeto
docker-compose -f infra/docker-compose.prod.yml exec backend sh

# Dentro do container
cd /app
node dist/scripts/migrate.js  # Se tiver migration script
# OU manualmente via psql
```

**Migrations manuais (se necessário):**

```bash
# Conectar ao PostgreSQL
docker-compose -f infra/docker-compose.prod.yml exec postgres psql -U salesmentor -d salesmentor

# Executar SQL das migrations em db/migrations/
```

### 1.8. Verificar Status

```bash
# Ver logs em tempo real
docker-compose -f infra/docker-compose.prod.yml logs -f

# Status dos containers
docker-compose -f infra/docker-compose.prod.yml ps

# Testar health check
curl http://localhost:8080/health
```

### 1.9. Obter IP do Servidor

```bash
# IP público
curl ifconfig.me

# Exemplo: 203.0.113.45
```

**Anote este IP!** Você precisará dele para configurar a extensão.

---

## PARTE 2: Configurar HTTPS (Recomendado)

### Opção A: Usando Certbot (Let's Encrypt)

```bash
# Instalar certbot
sudo apt install certbot

# Obter certificado (substitua SEU_DOMINIO)
sudo certbot certonly --standalone -d api.salesmentor.com

# Certificados estarão em:
# /etc/letsencrypt/live/api.salesmentor.com/fullchain.pem
# /etc/letsencrypt/live/api.salesmentor.com/privkey.pem
```

### Opção B: Usar Caddy (mais simples)

```yaml
# Criar Caddyfile
api.salesmentor.com {
    reverse_proxy localhost:8080
}
```

```bash
caddy run
```

### Atualizar Nginx para HTTPS

Se usar o nginx.conf fornecido, descomente a seção HTTPS e ajuste:

```nginx
server {
    listen 443 ssl http2;
    server_name api.salesmentor.com;

    ssl_certificate /etc/letsencrypt/live/api.salesmentor.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.salesmentor.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        # ... resto da config
    }
}
```

---

## PARTE 3: Preparar Extensão para o Cliente

### 3.1. Decidir URL do Backend

**Opção 1: IP Público** (mais simples, sem HTTPS)
```
http://203.0.113.45:8080
```

**Opção 2: Domínio com HTTPS** (recomendado)
```
https://api.salesmentor.com
```

### 3.2. Build da Extensão

```bash
# No seu computador local (não no servidor)
cd apps/extension

# Build com URL do backend
./build-for-client.sh http://203.0.113.45:8080
# OU
./build-for-client.sh https://api.salesmentor.com
```

**Output:**
```
✅ Build completo!

📁 Arquivos gerados:
   - Pasta: ../../../sales-mentor-extension-20250102_181500
   - ZIP:   ../../../sales-mentor-extension-20250102_181500.zip
```

### 3.3. Testar Localmente Antes de Enviar

1. No Chrome, vá para `chrome://extensions/`
2. Ative "Modo do desenvolvedor"
3. Clique "Carregar sem compactação"
4. Selecione a pasta `sales-mentor-extension-XXXXXX`
5. Entre no Google Meet e teste

**Se funcionar**, pode enviar para o cliente!

### 3.4. Enviar para o Cliente

**Envie:**
1. ✅ `sales-mentor-extension-XXXXXX.zip`
2. ✅ `INSTALL_INSTRUCTIONS.md`

**NÃO envie:**
- ❌ Código-fonte
- ❌ Credenciais (.env)
- ❌ Scripts de deploy

---

## PARTE 4: Troubleshooting

### Backend não inicia

```bash
# Ver logs detalhados
docker-compose -f infra/docker-compose.prod.yml logs backend

# Erros comuns:
# - DATABASE_URL incorreta
# - OPENAI_API_KEY inválida
# - Porta 8080 já em uso
```

### Extensão não conecta

1. **Verificar URL**: O BACKEND_URL está correto?
2. **Testar diretamente**:
   ```bash
   curl http://SEU_SERVIDOR:8080/health
   ```
3. **CORS**: Verifique logs do backend para erros de CORS

### WebSocket não conecta

1. **Firewall**: Porta 8080 precisa estar aberta
   ```bash
   sudo ufw allow 8080
   ```

2. **Nginx**: Se usar proxy reverso, verifique config de WebSocket:
   ```nginx
   location /v1/ws {
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

### Insights não aparecem

1. **Backend está rodando?**
   ```bash
   curl http://SEU_SERVIDOR:8080/health
   ```

2. **OpenAI API Key válida?**
   ```bash
   docker-compose -f infra/docker-compose.prod.yml logs backend | grep -i openai
   ```

3. **Cliente falando frases corretas?**
   - Ver lista de frases de teste em `INSTALL_INSTRUCTIONS.md`

---

## PARTE 5: Manutenção

### Ver Logs

```bash
# Tempo real (Ctrl+C para sair)
docker-compose -f infra/docker-compose.prod.yml logs -f

# Últimas 100 linhas
docker-compose -f infra/docker-compose.prod.yml logs --tail=100

# Apenas backend
docker-compose -f infra/docker-compose.prod.yml logs backend -f
```

### Reiniciar Serviços

```bash
# Reiniciar tudo
docker-compose -f infra/docker-compose.prod.yml restart

# Reiniciar apenas backend
docker-compose -f infra/docker-compose.prod.yml restart backend
```

### Atualizar Código

```bash
cd /opt/sales-mentor
git pull origin main
cd infra
./deploy.sh
```

### Backup do Banco

```bash
# Fazer backup
docker-compose -f infra/docker-compose.prod.yml exec postgres pg_dump -U salesmentor salesmentor > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker-compose -f infra/docker-compose.prod.yml exec -T postgres psql -U salesmentor salesmentor < backup_20250102.sql
```

---

## PARTE 6: Checklist Final

### Servidor

- [ ] Docker e Docker Compose instalados
- [ ] Repositório clonado
- [ ] `.env.production` configurado
- [ ] JWT Secret gerado (forte!)
- [ ] Deploy executado com sucesso
- [ ] Health check OK (`curl http://localhost:8080/health`)
- [ ] Migrations executadas
- [ ] Firewall configurado (portas 80, 443, 8080)
- [ ] HTTPS configurado (opcional mas recomendado)

### Extensão

- [ ] Build realizado com URL correta
- [ ] Testado localmente
- [ ] ZIP gerado
- [ ] `INSTALL_INSTRUCTIONS.md` incluído
- [ ] Enviado para cliente

### Testes

- [ ] Backend responde no IP público
- [ ] WebSocket conecta
- [ ] Extensão carrega no Chrome
- [ ] Transcrição aparece
- [ ] Insights são gerados
- [ ] Todas as categorias funcionam (PRICE, BUYING_SIGNAL, etc.)

---

## PARTE 7: URLs de Referência

### Produção

- **Backend API**: `http://SEU_IP:8080` ou `https://api.salesmentor.com`
- **Health Check**: `/health`
- **WebSocket**: `/v1/ws`
- **Criar Call**: `POST /v1/calls`
- **Parar Call**: `POST /v1/calls/:id/stop`
- **Relatório**: `GET /v1/calls/:id/report`

### Desenvolvimento Local

- **Backend**: `http://localhost:8080`
- **PostgreSQL**: `localhost:5433` (dev) / `localhost:5432` (prod)
- **Adminer**: `http://localhost:8081` (apenas dev)

---

## Suporte

Se encontrar problemas:

1. Verifique logs: `docker-compose logs -f`
2. Teste health check: `curl http://SEU_IP:8080/health`
3. Verifique firewall: `sudo ufw status`
4. Teste conexão direta: `telnet SEU_IP 8080`

**Documentação adicional:**
- `CLAUDE.md` - Arquitetura do projeto
- `INSTALL_INSTRUCTIONS.md` - Guia do cliente
- `.env.production.example` - Variáveis de ambiente

---

**Bom deploy! 🚀**
