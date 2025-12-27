#!/bin/bash

# This script ensures we maintain release history when publishing from a fresh clone
# It downloads the existing RELEASES.json before running the publish command

set -e

echo "🎯 Starting publish with history preservation..."
echo ""

# Step 1: Prepare release artifacts (download existing RELEASES.json)
bash scripts/prepare-release.sh

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Step 2: Run the normal Electron Forge publish command
echo "📤 Publishing to S3..."
electron-forge publish

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "✅ Publish complete!"
echo "🔄 Auto-update should now work seamlessly for all users"

