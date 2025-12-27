#!/bin/bash

echo "🧹 Clearing Snaplark caches..."
echo ""

# Close the app if it's running
echo "1. Killing Snaplark process..."
killall Snaplark 2>/dev/null || echo "   App not running"

# Clear application caches
echo "2. Clearing application caches..."
rm -rf ~/Library/Caches/com.snaplark.snaplark*
echo "   ✅ Cleared ~/Library/Caches/com.snaplark.snaplark*"

# Clear application support
echo "3. Clearing application support data..."
rm -rf ~/Library/Application\ Support/Snaplark
echo "   ✅ Cleared ~/Library/Application Support/Snaplark"

# Clear preferences (optional - might reset user settings)
echo "4. Clearing preferences..."
rm -f ~/Library/Preferences/com.snaplark.snaplark.plist
echo "   ✅ Cleared ~/Library/Preferences/com.snaplark.snaplark.plist"

echo ""
echo "✅ All caches cleared!"
echo ""
echo "Now run your app from terminal:"
echo "  /Applications/Snaplark.app/Contents/MacOS/Snaplark"
echo ""
echo "Watch for the [Auto-Updater] logs to see if it detects version"

