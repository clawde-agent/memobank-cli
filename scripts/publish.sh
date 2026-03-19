#!/bin/bash
# npm publish script for memobank-cli

set -e

echo "📦 Publishing memobank-cli to npm..."
echo ""

# Navigate to CLI directory
cd "$(dirname "$0")"

# Run final build
echo "🔨 Building..."
npm run build

# Run tests
echo "🧪 Testing..."
npm test

# Check package contents
echo "📋 Package contents:"
npm pack --dry-run

echo ""
echo "🚀 Publishing to npm..."
echo ""
echo "⚠️  You will be prompted for npm 2FA code"
echo ""

# Publish
npm publish --access public

echo ""
echo "✅ Published successfully!"
echo ""
echo "📦 View on npm: https://www.npmjs.com/package/memobank-cli"
