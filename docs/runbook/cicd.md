# CI/CD Runbook

## Scope
- 対象: `core`（`packages/core/cm6-*`）、`vscode`（`apps/vscode-extension`）、`mac`（`apps/mac`）
- 目的: 配布チャネルごとに release line を分離し、手動リリースの誤操作を減らす

## Release Lines
- `core`:
  - 配布先: npm (`@yuya296/cm6-*`)
  - workflow: `.github/workflows/core-release.yml`
  - tag: `core-vX.Y.Z`
- `vscode`:
  - 配布先: VS Code Marketplace (`markbloom`)
  - workflow: `.github/workflows/vscode-release.yml`
  - tag: `vscode-vX.Y.Z`
- `mac`:
  - 実装: `apps/mac`（Tauri 2）
  - 配布先: ローカルビルド（`.app`, Apple Silicon）
  - workflow: なし（v1は手動配布のみ）
  - tag: なし（将来追加）

## CI (自動)
- Trigger: `pull_request`, `push` (main)
- workflow: `.github/workflows/ci.yml`
- Node 実行バージョン: `22` と `24` の matrix
- 実行内容（最小）
  - `pnpm install --frozen-lockfile`
  - `node scripts/check-compatibility.mjs`
  - `node scripts/check-widget-measure-contract.mjs`
  - `pnpm -r lint`
  - `pnpm -r typecheck`
  - `pnpm -r build`
  - `pnpm -r --if-present test`

## Webview Pages (自動公開)
- 対象: `apps/webview-demo`
- workflow: `.github/workflows/webview-pages.yml`
- Node 実行バージョン: `24`
- Trigger:
  - `push` (`main`) -> 最新断面を更新
  - `pull_request` (`opened`, `synchronize`, `reopened`) -> PR断面を更新
  - `pull_request` (`closed`) -> PR断面を削除
- URL 規約:
  - main: `https://yuya296.github.io/MarkBloom/`
  - PR: `https://yuya296.github.io/MarkBloom/pr-<PR番号>/`
- PRコメント運用:
  - botコメントを 1 件だけ保持し、最新 preview URL に更新する（marker: `<!-- webview-preview -->`）
- セキュリティ方針:
  - fork PR (`head.repo.full_name != repository`) は preview/cleanup をスキップする
- cleanup 方針:
  - PR close 時に `gh-pages` から `pr-<PR番号>/` を削除する
- 注意:
  - Pages は公開 URL のため、デモには機密情報を含めない

## CD (手動)
- Trigger: 各 workflow の `workflow_dispatch`
- 共通入力:
  - `dry_run` (boolean): 配布を dry-run にする
  - `version` (string, optional): 期待バージョンの一致チェック（各 workflow の定義に従う）
  - `create_release` (boolean): GitHub Release を作成する

### Core release
- workflow: `.github/workflows/core-release.yml`
- Node 実行バージョン: `24`
- 追加入力:
  - `bump` (choice): 次バージョンの上げ方（`patch` / `minor` / `major`）
- 実行内容:
  - 本番時に `NPM_TOKEN` の `npm whoami` を検証（`yuya296` 以外なら fail）
  - 現在の lockstep version 検証（必要なら `version` 入力と一致確認）
  - `node scripts/check-compatibility.mjs`（bump 前の core version で検証）
  - `bump` 入力に従って `packages/core/cm6-*` の `package.json` version を一括更新
  - tag重複チェック（publish前）
  - npm での未公開チェック（dry-run / 本番の両方で実施）
  - `pnpm -r --filter "@yuya296/cm6-*" build`
  - dry-run: `pnpm -r --filter "@yuya296/cm6-*" publish --dry-run` 実行後に version 更新を復元
  - 本番: version 更新を commit/push 後に `pnpm -r --filter "@yuya296/cm6-*" publish`
  - tag作成 (`core-vX.Y.Z`, X.Y.Z は bump 後バージョン)
  - GitHub Release 作成（`release_notes/core.md` ベース）

### VS Code release
- workflow: `.github/workflows/vscode-release.yml`
- Node 実行バージョン: `24`
- 実行内容:
  - extension version 検証
  - `node scripts/check-compatibility.mjs`
  - `pnpm -C apps/vscode-extension build`
  - `pnpm -C apps/vscode-extension package|publish`
  - tag作成 (`vscode-vX.Y.Z`)
  - GitHub Release 作成（`release_notes/vscode.md` ベース）

### mac app build (ローカル)
- 入口:
  - `pnpm -C apps/mac build`
  - `pnpm -C apps/mac tauri:build`
- 出力:
  - `apps/mac/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app`
- 注意:
  - v1では署名 / Notarization / Auto Update は実施しない（将来対応）。

## Node 実行ポリシー
- 開発の最小要件は `Node 22+`
- 開発時の推奨バージョンは `.nvmrc` の `24`（`nvm use` を前提）
- CI は互換性確認のため `22` / `24` 両方で実行する
- 公開系 workflow（release / pages / audit）は `24` 固定で実行する

## Notes
- main への push では publish しない
- 互換性契約は `releases/compatibility-matrix.json` を正本とする
- release 証跡は GitHub Releases を正本とする
- `apps/mac` はローカル配布 line のため、現時点では GitHub Release 証跡を持たない

## Links
- `docs/runbook/development-ops.md`
- `docs/runbook/devsecops.md`
