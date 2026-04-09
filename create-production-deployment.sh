#!/bin/bash

# Production Deployment Package Creator
# Creates a clean deployment package excluding development files

set -e

echo "🚀 Creating production deployment package..."

# Set production environment
export NODE_ENV=production
export DEVELOPMENT_MODE=false

# Create deployment directory
DEPLOY_DIR="production-deployment"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

echo "📦 Copying production files..."

# Copy essential files and directories for production
echo "📁 Copying core application files..."

# Copy main directories
cp -r client/ "$DEPLOY_DIR/" 2>/dev/null || true
cp -r server/ "$DEPLOY_DIR/" 2>/dev/null || true
cp -r shared/ "$DEPLOY_DIR/" 2>/dev/null || true
cp -r config/ "$DEPLOY_DIR/" 2>/dev/null || true
cp -r migrations/ "$DEPLOY_DIR/" 2>/dev/null || true
cp -r attached_assets/ "$DEPLOY_DIR/" 2>/dev/null || true

# Copy configuration files
cp package.json "$DEPLOY_DIR/" 2>/dev/null || true
cp package-lock.json "$DEPLOY_DIR/" 2>/dev/null || true
cp tsconfig.json "$DEPLOY_DIR/" 2>/dev/null || true
cp vite.config.ts "$DEPLOY_DIR/" 2>/dev/null || true
cp tailwind.config.ts "$DEPLOY_DIR/" 2>/dev/null || true
cp postcss.config.js "$DEPLOY_DIR/" 2>/dev/null || true
cp drizzle.config.ts "$DEPLOY_DIR/" 2>/dev/null || true
cp components.json "$DEPLOY_DIR/" 2>/dev/null || true
cp sonar-project.properties "$DEPLOY_DIR/" 2>/dev/null || true

echo "🚫 Excluding development directory and files..."
# Explicitly ensure development directory is not copied
rm -rf "$DEPLOY_DIR/development" 2>/dev/null || true

# Copy specific production files if they exist
if [ -f "dist/index.js" ]; then
    echo "📁 Copying build artifacts..."
    cp -r dist/ "$DEPLOY_DIR/"
fi

# Create production environment file
echo "📝 Creating production environment configuration..."
cat > "$DEPLOY_DIR/.env.production" << 'EOL'
NODE_ENV=production
DEVELOPMENT_MODE=false
DEBUG_MODE=false
VERBOSE_LOGGING=false
DEVELOPMENT_TOOLS_ENABLED=false
EOL

# Create production start script
echo "📝 Creating production start script..."
cat > "$DEPLOY_DIR/start-production.sh" << 'EOL'
#!/bin/bash

# Production startup script
export NODE_ENV=production
export DEVELOPMENT_MODE=false

echo "🚀 Starting application in production mode..."

# Check if development directory exists and warn
if [ -d "development" ]; then
    echo "⚠️  WARNING: Development directory found in production deployment!"
    echo "   This should not be present in production."
fi

# Start the application
npm run start
EOL

chmod +x "$DEPLOY_DIR/start-production.sh"

# Install production dependencies
echo "📦 Installing production dependencies in deployment package..."
cd "$DEPLOY_DIR"
npm ci --production --silent
cd ..

# Calculate sizes
ORIGINAL_SIZE=$(du -sh . | cut -f1)
DEPLOYMENT_SIZE=$(du -sh "$DEPLOY_DIR" | cut -f1)

echo ""
echo "✅ Production deployment package created successfully!"
echo ""
echo "📊 Deployment Summary:"
echo "   Original codebase size: $ORIGINAL_SIZE"
echo "   Production package size: $DEPLOYMENT_SIZE"
echo "   Package location: ./$DEPLOY_DIR/"
echo ""
echo "🔍 Verification:"
echo "   Development directory excluded: $([ ! -d "$DEPLOY_DIR/development" ] && echo "✅ Yes" || echo "❌ No")"
echo "   Production dependencies installed: $([ -d "$DEPLOY_DIR/node_modules" ] && echo "✅ Yes" || echo "❌ No")"
echo "   Production config created: $([ -f "$DEPLOY_DIR/.env.production" ] && echo "✅ Yes" || echo "❌ No")"
echo ""
echo "🚀 To deploy:"
echo "   1. Copy ./$DEPLOY_DIR/ to your production server"
echo "   2. Run: ./start-production.sh"
echo "   3. Or run: npm run start"
echo ""