---
name: app-release
description: FloatNote のリリース作業。バージョン確認・更新、タグ、.dmg ビルド、GitHub Release 作成をまとめて行う。ユーザーが /app-release と打ったときに使う。
---

# /app-release — FloatNote をリリースする

以下を順番に行う。途中で止まる判断ポイントは「バージョン確認」だけ。他は確認なしで進める。

## 1. 前提チェック

```sh
git status --short          # 未コミットがあれば先にコミットするか聞く
git fetch -q && git status -sb | head -1   # origin/main と一致しているか
gh auth status
```

未コミットの変更があるならリリースに含めるべきか確認する。

## 2. 現在のバージョンと差分を把握

```sh
node -p "require('./package.json').version"
git tag --sort=-v:refname | head -1                         # 直近タグ（無ければ初回）
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD
```

## 3. バージョン確認（ここだけユーザーに聞く）

差分の内容から semver で候補を出し、AskUserQuestion で確認する。
- 修正・微調整のみ → patch
- 機能追加 → minor
- 破壊的変更・保存形式変更 → major
0.x のうちは minor を patch 相当、機能追加を minor として扱ってよい。
現在のバージョンと候補を必ず明示する（例: 「0.0.1 → 0.1.0 でいい？」）。

## 4. バージョン反映とコミット・タグ

```sh
scripts/set-version.sh X.Y.Z      # package.json / tauri.conf.json / Cargo.toml / lock を更新
git add -A
git commit -m "vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

## 5. ビルド

```sh
pnpm dist
```

生成物: `src-tauri/target/release/bundle/dmg/FloatNote_X.Y.Z_<arch>.dmg`
ビルドが失敗したらリリースを作らず、原因を報告して止まる。

## 6. リリースノートを書く

手順2の git log を元に、ユーザー向けの日本語で箴条書きにする。コミットメッセージの丸写しではなく「何ができるようになったか / 何が直ったか」で書く。内部的な変更（CI、リファクタ、ドキュメント）は「その他」にまとめるか省く。

末尾に必ずインストール注記を付ける:

```
### インストール
.dmg を開いて FloatNote.app を Applications へ。署名は ad hoc のため、初回起動時に Gatekeeper に止められたら右クリック →「開く」、またはシステム設定 → プライバシーとセキュリティ →「このまま開く」。
```

## 7. GitHub Release 作成

```sh
gh release create vX.Y.Z \
  src-tauri/target/release/bundle/dmg/FloatNote_X.Y.Z_*.dmg \
  --title "vX.Y.Z" \
  --notes-file <リリースノートを書いたファイル>
```

リリースノートはスクラッチパッドにファイルとして書いてから渡す（シェルのエスケープ事故を避ける）。

## 8. 報告

リリース URL、バージョン、添付した dmg のファイル名を伝える。
