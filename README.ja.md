# MarkBloom

[English](./README.md) | 日本語

MarkBloom は、**Markdown を “真実のソース” のまま**、人間が **読みやすく・直しやすく** するための VS Code 拡張です。

## 目的

- Markdown ドキュメントの **レビュー体験** を改善する
- とくに表など、構造がある Markdown の **編集コスト** を下げる
- Git の差分が追いやすい、**diff-friendly** な更新を維持する

## 思想

- **人間が主役**：AI が下書きしても、最終的に人が素早く判断・修正できること
- **Markdown is truth**：別フォーマットに変換して管理しない（`.md` が常に正）
- **壊さずに編集**：見た目の読みやすさと、元テキストの扱いやすさを両立する

## 非ゴール

- Markdown を置き換える独自ドキュメント形式の提供
- Notion のようなワークスペース／DB型プロダクトの実装

## リポジトリ構成

- `apps/webview-demo`: CM6 + MarkBloom 拡張の統合デモアプリ
- `apps/vscode-extension`: VS Code 拡張アプリ（`markbloom`）
- `apps/mac`: Tauri 2 ベースの mac ネイティブアプリ（`MarkBloom`）
- `packages/core/cm6-*`: npm 公開する core CM6 ライブラリ群
- `docs/`: アーキテクチャ、runbook、ADR、機能仕様

## Live demo

- 最新断面（`main`）: https://yuya296.github.io/MarkBloom/
- Pages 上の内容は公開されます。デモには機密情報・私有データを含めないでください。

## 開発要件

- Node.js `22+`（推奨: `.nvmrc` の `24.x`）
- pnpm `10.27.0`（Corepack 管理）

最小 Node バージョン未満では、`pnpm -C apps/webview-demo dev` 実行時にバージョン不足エラーで即時停止します。

## PM2とworktree並行開発

- `pm2 start ecosystem.config.cjs --update-env` で起動します。
- プロセス名は `webview-demo-<branch-slug>-<branch-hash6>` です。
- dev port は branch名から自動決定されます。
- 競合時のみ `MB_PORT=<port> pm2 start ecosystem.config.cjs --update-env` で手動上書きできます。
- 同一branchを複数worktreeで同時起動する運用は非対応です。

## 依存関係モデル

- app 層（`apps/*`）は core 層（`@yuya296/cm6-*`）に依存します。
- `apps/vscode-extension` と `apps/webview-demo` は共通で次を利用します:
  - `@yuya296/cm6-live-preview`
  - `@yuya296/cm6-diff-gutter`
  - `@yuya296/cm6-markdown-smart-bol`
- `@yuya296/cm6-live-preview` は次を束ねます:
  - `@yuya296/cm6-live-preview-core`
  - `@yuya296/cm6-markdown-semantics`
  - `@yuya296/cm6-typography-theme`
  - `@yuya296/cm6-live-preview-mermaid`
  - `@yuya296/cm6-table`
- `table` / `mermaid` は app 側の `livePreviewPreset` オプションで有効化します。

図とリリース経路は `docs/architecture/overview.md` を参照してください。

---

設計・運用ドキュメントは `docs/` に置きます。
