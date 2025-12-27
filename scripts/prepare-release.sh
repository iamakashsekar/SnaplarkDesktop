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
if curl -f -s -o "${OUTPUT_DIR}/RELEASES.json" "${RELEASE_JSON_URL}"; then
    echo "✅ Successfully downloaded existing RELEASES.json"
    echo "📄 Existing releases:"
    cat "${OUTPUT_DIR}/RELEASES.json" | python3 -m json.tool 2>/dev/null || cat "${OUTPUT_DIR}/RELEASES.json"
else
    echo "⚠️  No existing RELEASES.json found (this is fine for first release)"
    # Create an empty placeholder that Electron Forge will populate
    echo '{"currentRelease":"","releases":[]}' > "${OUTPUT_DIR}/RELEASES.json"
fi

echo ""
echo "✅ Release preparation complete!"
echo "📝 You can now run: npm run publish"

