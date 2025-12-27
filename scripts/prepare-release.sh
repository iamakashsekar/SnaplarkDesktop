#!/bin/bash

# This script downloads the existing RELEASES.json from S3 before publishing
# This ensures that when starting fresh on a new machine, we maintain the update history

set -e

echo "🚀 Preparing release artifacts..."

# Configuration
# Note: Currently only handles darwin/arm64. Extend this if you publish for other platforms.
PLATFORM="darwin"
ARCH="arm64"
BASE_URL="https://usc1.contabostorage.com/72e7132000f0495a956688c26ebee898:main-storage/releases"
RELEASE_JSON_URL="${BASE_URL}/${PLATFORM}/${ARCH}/RELEASES.json"
OUTPUT_DIR="out/make/zip/${PLATFORM}/${ARCH}"

echo "📦 Platform: ${PLATFORM}"
echo "💻 Architecture: ${ARCH}"
echo "🌐 Release JSON URL: ${RELEASE_JSON_URL}"

# Create output directory if it doesn't exist
mkdir -p "${OUTPUT_DIR}"

# Download existing RELEASES.json from S3 (if it exists)
echo ""
echo "⬇️  Attempting to download existing RELEASES.json..."

# Add cache-busting timestamp to URL to bypass CDN/browser caching
TIMESTAMP=$(date +%s)
CACHE_BUSTED_URL="${RELEASE_JSON_URL}?t=${TIMESTAMP}"

echo "🔗 Fetching: ${CACHE_BUSTED_URL}"

# Download with verbose error handling
HTTP_CODE=$(curl -s -w "%{http_code}" \
    -H "Cache-Control: no-cache, no-store, must-revalidate" \
    -H "Pragma: no-cache" \
    -H "Expires: 0" \
    -o "${OUTPUT_DIR}/RELEASES.json" \
    "${CACHE_BUSTED_URL}")

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ Successfully downloaded existing RELEASES.json (HTTP $HTTP_CODE)"
    echo "📄 Current version on server:"
    cat "${OUTPUT_DIR}/RELEASES.json" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"  Latest: {data.get('currentRelease', 'unknown')}\"); print(f\"  Total releases: {len(data.get('releases', []))}\")" 2>/dev/null || cat "${OUTPUT_DIR}/RELEASES.json"
elif [ "$HTTP_CODE" -eq 404 ]; then
    echo "⚠️  No existing RELEASES.json found on server (HTTP 404)"
    echo "   This is normal for the first release"
    # Create an empty placeholder that Electron Forge will populate
    echo '{"currentRelease":"","releases":[]}' > "${OUTPUT_DIR}/RELEASES.json"
else
    echo "⚠️  Failed to download RELEASES.json (HTTP $HTTP_CODE)"
    echo "   Creating empty placeholder - you may want to manually download from S3 dashboard"
    # Create an empty placeholder that Electron Forge will populate
    echo '{"currentRelease":"","releases":[]}' > "${OUTPUT_DIR}/RELEASES.json"
fi

echo ""
echo "✅ Release preparation complete!"
echo "📝 You can now run: npm run publish"

