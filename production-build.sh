#!/bin/bash

# Production Build Script
# Excludes development directory from production deployments

set -e

echo "🚀 Starting production build preparation..."

# Check if development directory exists
if [ ! -d "development" ]; then
    echo "✅ Development directory not found - proceeding with production build"
else
    echo "📁 Development directory found - ensuring it's excluded from build"
fi

# Set production environment
export NODE_ENV=production
export DEVELOPMENT_MODE=false

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf build/

# Install all dependencies for build process
echo "📦 Installing dependencies for build..."
npm ci

# Build the application
echo "🔨 Building application..."
npm run build

# Verify development directory is not in build output
if [ -d "dist/development" ] || [ -d "build/development" ]; then
    echo "❌ ERROR: Development directory found in build output!"
    echo "This should not happen. Removing development files from build..."
    rm -rf dist/development/
    rm -rf build/development/
fi

# Create production deployment package (excluding development)
echo "📦 Creating production deployment package..."
mkdir -p production-deployment
rsync -av --progress \
    --exclude='development/' \
    --exclude='node_modules/' \
    --exclude='.git/' \
    --exclude='*.log' \
    --exclude='*.tmp' \
    --exclude='*.temp' \
    --exclude='.env*' \
    --exclude='*.development.*' \
    --exclude='*.dev.*' \
    ./ production-deployment/

# Install production dependencies in deployment package
cd production-deployment
npm ci --production --silent

cd ..

echo "✅ Production build complete!"
echo "📁 Production package available at: ./production-deployment/"
echo "🚫 Development files excluded from production build"

# Verify exclusion
echo ""
echo "🔍 Production build verification:"
echo "   Total size: $(du -sh production-deployment/ | cut -f1)"
echo "   Development directory excluded: $([ ! -d "production-deployment/development" ] && echo "✅ Yes" || echo "❌ No")"
echo "   Node modules excluded: $([ ! -d "production-deployment/node_modules" ] && echo "✅ Yes" || echo "❌ No")"
echo ""