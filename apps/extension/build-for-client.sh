#!/bin/bash
#===============================================
# Build Chrome Extension for Client Testing
#===============================================
# Usage:
#   ./build-for-client.sh [BACKEND_URL]
#
# Examples:
#   ./build-for-client.sh http://192.168.1.100:8080
#   ./build-for-client.sh https://api.salesmentor.com
#===============================================

set -e

BACKEND_URL=${1:-}

if [ -z "$BACKEND_URL" ]; then
  echo "❌ Erro: URL do backend é obrigatória!"
  echo ""
  echo "Uso: ./build-for-client.sh [BACKEND_URL]"
  echo ""
  echo "Exemplos:"
  echo "  ./build-for-client.sh http://192.168.1.100:8080"
  echo "  ./build-for-client.sh https://api.salesmentor.com"
  exit 1
fi

echo "🏗️  Building Sales Mentor Extension..."
echo "🔗 Backend URL: $BACKEND_URL"
echo ""

# Create .env file with backend URL
echo "VITE_BACKEND_URL=$BACKEND_URL" > .env

# Build extension
echo "📦 Running build..."
pnpm build

# Check if build succeeded
if [ ! -d "dist" ]; then
  echo "❌ Build failed! dist/ directory not found."
  exit 1
fi

# Create distribution package
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="../../../sales-mentor-extension-$TIMESTAMP"
OUTPUT_ZIP="$OUTPUT_DIR.zip"

echo ""
echo "📦 Creating distribution package..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Copy dist files
cp -r dist/* "$OUTPUT_DIR/"

# Create zip for easy distribution
cd ../../../
zip -r "sales-mentor-extension-$TIMESTAMP.zip" "sales-mentor-extension-$TIMESTAMP"
cd -

echo ""
echo "✅ Build completo!"
echo ""
echo "📁 Arquivos gerados:"
echo "   - Pasta: $OUTPUT_DIR"
echo "   - ZIP:   $OUTPUT_ZIP"
echo ""
echo "📤 Próximos passos:"
echo "   1. Envie o arquivo ZIP para o cliente"
echo "   2. Cliente deve descompactar e instalar no Chrome"
echo "   3. Ver instruções em: INSTALL_INSTRUCTIONS.md"
echo ""
