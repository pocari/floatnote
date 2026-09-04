#!/bin/sh
# Build the release .app and wrap it in a .dmg (Tauri's own dmg step needs Finder scripting, so do it with hdiutil).
set -e
cd "$(dirname "$0")"
npm run tauri build
B=src-tauri/target/release/bundle
V=$(node -p "require('./package.json').version")
rm -rf "$B/dmg" && mkdir -p "$B/dmg/stage"
cp -R "$B/macos/FloatNote.app" "$B/dmg/stage/"
ln -s /Applications "$B/dmg/stage/Applications"
hdiutil create -volname FloatNote -srcfolder "$B/dmg/stage" -ov -format UDZO "$B/dmg/FloatNote_${V}_$(uname -m).dmg"
rm -rf "$B/dmg/stage"
echo "created: $B/dmg/FloatNote_${V}_$(uname -m).dmg"
