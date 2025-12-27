#!/bin/bash

# This script ensures we maintain release history when publishing from a fresh clone
# It downloads the existing RELEASES.json before running the publish command
#
# Usage:
#   npm run publish                    # Auto-detect platform and arch
#   bash scripts/publish-with-history.sh darwin arm64   # Specific platform
#   bash scripts/publish-with-history.sh win32 x64      # Windows x64

set -e

echo "🎯 Starting publish with history preservation..."
echo ""

# Pass any arguments (platform/arch) to prepare-release script
if [ -n "$1" ] && [ -n "$2" ]; then
    echo "📌 Building for: $1 / $2"
    bash scripts/prepare-release.sh "$1" "$2"
else
    echo "🔍 Auto-detecting platform and architecture..."
    bash scripts/prepare-release.sh
fi

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

