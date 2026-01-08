#!/bin/bash
#===============================================
# Sales Mentor - Production Deployment Script
#===============================================
# This script deploys the backend to production server
#
# Usage:
#   ./deploy.sh
#
# Prerequisites:
#   - Docker and Docker Compose installed on server
#   - .env.production file configured
#   - PostgreSQL credentials set
#===============================================

set -e

echo "🚀 Sales Mentor - Production Deployment"
echo "========================================"
echo ""

# Check if .env.production exists
if [ ! -f "../.env.production" ]; then
  echo "❌ Erro: .env.production não encontrado!"
  echo ""
  echo "Crie o arquivo .env.production baseado em .env.production.example"
  echo "cp ../.env.production.example ../.env.production"
  echo ""
  exit 1
fi

# Load environment variables
export $(cat ../.env.production | grep -v '^#' | xargs)

echo "📋 Verificando configuração..."
echo "   - NODE_ENV: $NODE_ENV"
echo "   - PORT: $PORT"
echo "   - Database configured: $([ -n "$DATABASE_URL" ] && echo 'Yes' || echo 'No')"
echo "   - OpenAI API Key: $([ -n "$OPENAI_API_KEY" ] && echo 'Yes' || echo 'No')"
echo "   - JWT Secret: $([ -n "$INSIGHTS_JWT_SECRET" ] && echo 'Yes' || echo 'No')"
echo ""

# Confirm deployment
read -p "🤔 Continuar com o deploy? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Deploy cancelado."
  exit 1
fi

echo ""
echo "🛑 Parando containers antigos (se existirem)..."
docker-compose -f docker-compose.prod.yml down || true

echo ""
echo "🏗️  Buildando imagens Docker..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo ""
echo "🚀 Iniciando serviços..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ Aguardando backend iniciar..."
sleep 10

echo ""
echo "🔍 Verificando status dos containers..."
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🏥 Testando health check..."
curl -f http://localhost:8080/health || {
  echo ""
  echo "❌ Backend não está respondendo!"
  echo ""
  echo "Logs do backend:"
  docker-compose -f docker-compose.prod.yml logs backend --tail=50
  exit 1
}

echo ""
echo "✅ Deploy concluído com sucesso!"
echo ""
echo "📊 Comandos úteis:"
echo "   - Ver logs:      docker-compose -f infra/docker-compose.prod.yml logs -f"
echo "   - Parar:         docker-compose -f infra/docker-compose.prod.yml down"
echo "   - Reiniciar:     docker-compose -f infra/docker-compose.prod.yml restart"
echo "   - Status:        docker-compose -f infra/docker-compose.prod.yml ps"
echo ""
echo "🔗 URLs:"
echo "   - Backend API:   http://localhost:8080"
echo "   - Health Check:  http://localhost:8080/health"
echo "   - WebSocket:     ws://localhost:8080/v1/ws"
echo ""
echo "📝 Próximos passos:"
echo "   1. Configure HTTPS com Nginx/Caddy (se aplicável)"
echo "   2. Execute migrations: docker-compose -f infra/docker-compose.prod.yml exec backend node dist/db/migrate.js"
echo "   3. Teste com extensão Chrome"
echo ""
