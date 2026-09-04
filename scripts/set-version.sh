#!/bin/sh
# バージョンを package.json / tauri.conf.json / Cargo.toml に揃えて書き込む。
# 使い方: scripts/set-version.sh 0.1.0
set -e
cd "$(dirname "$0")/.."
V="$1"
case "$V" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "usage: $0 X.Y.Z" >&2; exit 1 ;;
esac
pnpm pkg set version="$V" >/dev/null
node -e '
  const fs=require("fs"); const p="src-tauri/tauri.conf.json";
  const j=JSON.parse(fs.readFileSync(p,"utf8")); j.version=process.argv[1];
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
' "$V"
# [package] 直下の最初の version 行だけを置き換える（macOS の sed は 0,/re/ 非対応なので awk）
awk -v v="$V" 'BEGIN{done=0} !done && /^version = "/ {sub(/"[^"]*"/, "\"" v "\""); done=1} {print}' src-tauri/Cargo.toml > src-tauri/Cargo.toml.tmp && mv src-tauri/Cargo.toml.tmp src-tauri/Cargo.toml
# ロックファイルも追従させる
pnpm install --lockfile-only --ignore-scripts >/dev/null 2>&1
(cd src-tauri && cargo update -p floatnote --offline >/dev/null 2>&1 || cargo metadata --format-version 1 >/dev/null 2>&1)
echo "version -> $V"
grep -H '"version"' package.json src-tauri/tauri.conf.json | head -2
grep -H '^version' src-tauri/Cargo.toml
