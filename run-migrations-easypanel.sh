#!/bin/bash
# Script para rodar migrations no EasyPanel via SSH

set -e

VPS_IP="194.163.171.248"
CONTAINER_NAME="salesmentor-backend"

echo "🔧 Rodando migrations no EasyPanel..."
echo ""
echo "⚠️  ANTES DE RODAR:"
echo "   1. Certifique-se que tem acesso SSH ao servidor: $VPS_IP"
echo "   2. As variáveis de ambiente (incluindo DATABASE_URL) já estão configuradas no EasyPanel"
echo ""
read -p "Pressione ENTER para continuar ou Ctrl+C para cancelar..."

echo ""
echo "📡 Conectando ao servidor via SSH..."
echo ""

ssh root@$VPS_IP << 'ENDSSH'
# Encontrar o ID do container do salesmentor-backend
CONTAINER_ID=$(docker ps --filter "name=salesmentor-backend" --format "{{.ID}}" | head -1)

if [ -z "$CONTAINER_ID" ]; then
  echo "❌ Container salesmentor-backend não encontrado!"
  echo ""
  echo "Containers rodando:"
  docker ps --format "table {{.Names}}\t{{.Status}}"
  exit 1
fi

echo "✅ Container encontrado: $CONTAINER_ID"
echo ""
echo "🗄️  Rodando migrations..."
echo ""

# Rodar migrations dentro do container (DATABASE_URL já está nas env vars)
docker exec -i $CONTAINER_ID sh -c '
cd /app
npx node-pg-migrate up -m db/migrations
'

MIGRATION_EXIT=$?

if [ $MIGRATION_EXIT -eq 0 ]; then
  echo ""
  echo "✅ Migrations completadas com sucesso!"
  echo ""
  echo "📋 Verificando tabelas criadas..."
  echo "(Para verificar, conecte ao PostgreSQL manualmente)"
else
  echo ""
  echo "❌ Erro ao rodar migrations (exit code: $MIGRATION_EXIT)"
  exit 1
fi
ENDSSH

echo ""
echo "🎉 Script finalizado!"
