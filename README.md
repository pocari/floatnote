# FloatNote

macOS 用の常駐フローティングメモ。常に最前面（または最奥）に置けるプレーンテキストのメモ帳。Tauri v2 製。

## 機能

- **ウィンドウ位置を3段階で切替**：常に最前面 / 通常 / 常に最奥
  - ノート右上の「↕」ボタン、メニューバーアイコンの右クリックメニュー、設定画面のいずれからでも変更可
- **グローバルホットキー**：押すとノートを最前面に戻して表示・フォーカス
  - 初期状態は未設定。設定画面の「キーを設定」で実際にキーを押して登録する（⌘ / ⌃ / ⌥ のいずれか必須）
- **プレーンテキスト編集**：自動整形なし。Tab で2スペース挿入、Shift+Tab で戻す
- **自動保存**：入力停止後 0.5 秒でファイルに保存。ウィンドウが非アクティブになったときも保存
- **常駐**：ウィンドウを閉じても終了しない。メニューバーアイコン左クリック、Dock アイコン、ホットキーのいずれでも復帰（最奥にしていても最前面に戻る）
- **ログイン時に自動起動**：設定画面のチェックボックスで切替（ビルドした .app でのみ有効）
- **ウィンドウのサイズ・位置を記憶**

## 保存先

`~/Library/Application Support/com.pocari.floatnote/`

| ファイル | 内容 |
|---|---|
| `note.md` | メモ本文 |
| `settings.json` | ホットキー、ウィンドウ位置モード |
| `.window-state.json` | ウィンドウのサイズ・位置 |

## インストール

`npm run dist` で作った `FloatNote_<version>_<arch>.dmg` を開き、`FloatNote.app` を Applications へ。
署名は ad hoc のため、初回起動時に Gatekeeper に止められたら右クリック →「開く」、またはシステム設定 → プライバシーとセキュリティ →「このまま開く」。

## 開発

必要なもの：Node.js、Rust（cargo）、Xcode Command Line Tools。

```sh
npm install
npm run tauri dev      # ホットリロード付きで起動
```

## ビルド

```sh
npm run dist           # release ビルド → src-tauri/target/release/bundle/{macos,dmg}/
```

Tauri 標準の dmg 生成は Finder の AppleScript 操作を要するため、`make-dmg.sh` で `hdiutil` を使って作っている。

## 構成

```
index.html / src/main.ts / src/styles.css        ノートウィンドウ（textarea・位置切替メニュー）
settings.html / src/settings.ts / src/settings.css 設定ウィンドウ（ホットキー登録・位置・自動起動）
src-tauri/src/lib.rs                              ウィンドウ制御、ホットキー、トレイ、保存、設定ウィンドウ生成
src-tauri/tauri.conf.json                         ウィンドウ初期設定、バンドル設定
src-tauri/capabilities/default.json               フロントに許可する API
src-tauri/icons/                                  アプリアイコン（app-icon.png から `tauri icon` で生成）、tray*.png はメニューバー用
make-dmg.sh                                       .app ビルド + .dmg 作成
```

## ライセンス

MIT
