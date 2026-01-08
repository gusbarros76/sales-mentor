#!/bin/bash
# Script para testar o Docker localmente antes de fazer deploy

set -e  # Para no primeiro erro

echo "🔧 Building Docker image..."
docker build -f Dockerfile.easypanel -t salesmentor-test:local .

echo ""
echo "✅ Build succeeded!"
echo ""
echo "🧪 Testing if app starts without errors..."
echo ""

# Roda o container em background
CONTAINER_ID=$(docker run -d \
  -e DATABASE_URL="postgres://test:test@localhost:5432/test" \
  -e OPENAI_API_KEY="sk-test-fake-key" \
  -e INSIGHTS_JWT_SECRET="test-secret-123" \
  -e NODE_ENV="production" \
  -e PORT="8080" \
  salesmentor-test:local)

echo "Container started: $CONTAINER_ID"
echo "Waiting 8 seconds for app to start..."
sleep 8

# Pega os logs
LOGS=$(docker logs $CONTAINER_ID 2>&1)
echo "$LOGS"

# Verifica se o container ainda está rodando
if docker ps -q --filter "id=$CONTAINER_ID" | grep -q .; then
  echo ""
  echo "✅ App started successfully!"
  docker stop $CONTAINER_ID > /dev/null
else
  echo ""
  echo "❌ App crashed during startup!"
  docker rm $CONTAINER_ID > /dev/null 2>&1
  echo ""
  echo "Fix the errors above before deploying!"
  exit 1
fi

docker rm $CONTAINER_ID > /dev/null

echo ""
echo "📦 Image is ready for deployment!"
echo "   Tag: salesmentor-test:local"
echo ""
echo "🚀 Next steps:"
echo "   1. Push to GitHub: git push origin main"
echo "   2. Redeploy on EasyPanel"
exit 0
