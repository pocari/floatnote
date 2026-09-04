# FloatNote

macOS 常駐のフローティングメモ（Tauri v2 + Vite + TypeScript、UI フレームワークなし）。機能一覧・保存先・ファイル構成は README.md を参照。

## コマンド

```sh
pnpm install              # 初回（pnpm。npm は使わない）
pnpm tauri dev            # 開発起動。フロントは HMR、Rust は変更で自動再ビルド・再起動
pnpm exec tsc --noEmit    # フロントの型チェック
(cd src-tauri && cargo check)   # Rust の型チェック
pnpm dist                 # release .app + .dmg（make-dmg.sh）
```

`pnpm tauri build` 単体は .app までしか作らない（dmg は make-dmg.sh の hdiutil で作る。Tauri の dmg スクリプトは Finder 操作が必要でサンドボックス内で失敗するため）。

## リリース

- `/app-release` スキル（`.claude/skills/app-release/SKILL.md`）でバージョン確認 → タグ → `pnpm dist` → GitHub Release 作成まで行う
- バージョンは `scripts/set-version.sh X.Y.Z` で package.json / tauri.conf.json / Cargo.toml / 各 lock に一括反映する。手で個別に書き換えない

## 設計上の約束

- **ウィンドウ位置は Rust 側が唯一の管理者**。`apply_level()` が NSWindow レベル変更・store への保存・トレイのチェック更新・`level-changed` イベント発火をまとめて行う。フロントは `set_level` を invoke し、`level-changed` を listen して表示を更新するだけ
- **ホットキーは初期状態で未設定**。デフォルト値を入れない（ユーザーの明示要件）。登録は設定画面でキーを実際に押して行い、`set_hotkey` は失敗時に前のホットキーへロールバックする
- **最奥（bottom）からの復帰経路は必ず最前面に戻す**。トレイ左クリック・「ノートを表示」・Dock クリック（`RunEvent::Reopen`）・ホットキーはすべて `bring_to_front()` を通す。表示だけして位置を変えない経路を作らないこと
- **メインウィンドウは閉じても hide するだけ**（`CloseRequested` で `prevent_close`）。終了はトレイの「終了」か Cmd+Q
- **エディタはプレーンな textarea**。以前 Milkdown（GFM WYSIWYG）を使っていたが自動整形が邪魔で撤去した。リッチエディタを再導入しない
  - URL の見た目だけは textarea の背後に重ねた `#highlight` レイヤーで描いている（textarea は文字色透明、caret だけ表示）。両者の CSS（フォント・余白・`scrollbar-gutter`）は必ず同じに保つこと。ズレると下線位置が狂う
  - 優先タスク（`- !! タスク`）の抽出・色付けも同じレイヤーとフロント側の正規表現（`TASK_RE` / `HEAD_RE`）だけで行う。テキストは書き換えない。色以外の装飾（太字・サイズ）は textarea とずれるので禁止
  - リンクは ⌘+クリックで `@tauri-apps/plugin-opener` の `openUrl`。capabilities で http/https のみ許可
- 設定は tauri-plugin-store（`settings.json`）、ウィンドウ位置・サイズは tauri-plugin-window-state（SIZE | POSITION のみ、settings ウィンドウは denylist）
- Dock に表示する（ActivationPolicy は Regular）。以前 Accessory にしていたが復帰手段が分かりづらく Regular に変更
- フロントの `hidden` 属性で切り替える要素に `display` を CSS で当てる場合は `[hidden]` の上書きを必ず書く（メニューが常時表示になった前例あり）

## フロントの新しい Tauri API を使うとき

- コマンド追加：`lib.rs` に `#[tauri::command]` を書き、`generate_handler!` に追加
- プラグイン追加：`cargo add tauri-plugin-xxx` + `pnpm add @tauri-apps/plugin-xxx` + `lib.rs` で `.plugin(...)` + `src-tauri/capabilities/default.json` の permissions に `xxx:default`
- 新しいウィンドウを作る場合は capabilities の `windows` にラベルを追加し、`vite.config.ts` の `rollupOptions.input` に HTML を追加

## アイコン

- `app-icon.png`（1024px）が元。`pnpm exec tauri icon app-icon.png` で `src-tauri/icons/` を再生成。生成される `android/` `ios/` は不要なので削除
- `src-tauri/icons/tray.png` / `tray@2x.png` はメニューバー用のモノクロテンプレートアイコンで、`tauri icon` では生成されない。上書きしないこと

## dev 中の落とし穴

- `pnpm tauri dev` を動かしたまま `pnpm add` で依存を追加すると、Vite の依存キャッシュが古いまま残って新モジュールが 504 になり、`main.ts` 全体が読み込めず本文が空に見える（データ自体は無事）。依存を追加・削除したら dev を止めて `rm -rf node_modules/.vite` してから再起動する
- dev の自動再起動はプロセスを kill するため `RunEvent::Exit` を通らない。終了時にしか保存しない処理は dev では動かないと考えること（ウィンドウ状態は移動・リサイズ時にも保存するようにした）

## 環境メモ

- この環境ではスクリーンショット取得に画面収録権限が無く、Claude から UI の見た目を確認できない。見た目の変更はユーザーにスクリーンショットで確認してもらう
- 応答は日本語、端的に
