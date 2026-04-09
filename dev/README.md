# Development Directory

This directory contains development-only files, test data, and documentation that should not be included in production deployments.

## Directory Structure

```
dev/
├── docs/          # Development documentation
│   ├── SERVICE_TEST_REPORT.md
│   ├── REFACTORING_SUMMARY.md
│   └── DEVELOPMENT_STANDARDS.md
├── tests/         # Test suites and test files
├── temp/          # Temporary test data and scripts
└── scripts/       # Development and maintenance scripts
```

## Access Control

This directory is:
- ✅ Accessible in development environment (NODE_ENV=development)
- ❌ Excluded from production builds
- ❌ Not deployed to production servers

## Environment Detection

The system automatically detects the environment through:
```javascript
const isDevelopment = process.env.NODE_ENV === 'development';
```

## Important Notes

1. **Never import dev/ files in production code**
2. **Test data should only be used in development**
3. **Development documentation is for internal reference only**
4. **Scripts in this directory may modify the database - use with caution**