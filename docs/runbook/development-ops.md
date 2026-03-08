# 開発運用ルール (Development Ops)

## ブランチ運用
- `main` は保護ブランチとして扱い、直接作業しない
- 作業ブランチを作成して開発する
  - `feature/*`: 機能追加
  - `fix/*`: 機能修正
  - `docs/*`: ドキュメント修正
  - `ci/*`: CI修正
- 普段の push では publish しない

## 初回セットアップ
1) Node を `.nvmrc` に合わせる
   - `nvm use`
2) Corepack / pnpm を有効化する
   - `corepack enable`
   - `corepack prepare pnpm@10.27.0 --activate`
3) 依存をインストールする
   - `pnpm install`
4) 開発サーバを起動する
   - `pnpm -C apps/webview-demo dev`
   - `pnpm -C apps/mac tauri:dev`（mac アプリ）

## バージョン管理 (SemVer)
- release line ごとに独立 SemVer を採用する
  - `core`（`@yuya296/cm6-*`）: lockstep 運用
  - `vscode`（`markbloom`）: 独立運用
  - `mac`（`apps/mac`）: 独立運用（現状は `0.1.x`）
- `core` は release workflow 内で `bump` 入力により `package.json` を更新する
- `vscode` / `mac` は必要時に手動で `package.json` を更新する
- 未デプロイの変更は Git 履歴で管理

## タグ運用
- `core`: `core-vX.Y.Z`
- `vscode`: `vscode-vX.Y.Z`
- tag は publish 後に作成し push

## 共通リリース手順 (手動)
1) 事前確認
   - `pnpm -r lint`
   - `pnpm -r typecheck`
   - `pnpm -r build`
   - `pnpm -r --if-present test`
   - `node scripts/check-compatibility.mjs`
2) version 戦略を決める
   - core: workflow 実行時に `bump`（`patch` / `minor` / `major`）を指定
   - vscode / mac: 対象 release line の `package.json` `version` を更新
3) Actions で対象 workflow を手動実行
   - core: `.github/workflows/core-release.yml`
   - vscode: `.github/workflows/vscode-release.yml`
   - mac: なし（ローカルで `pnpm -C apps/mac tauri:build`）
4) GitHub Releases を確認
   - core: `core-vX.Y.Z`
   - vscode: `vscode-vX.Y.Z`

## Core release 補足
- `@yuya296/cm6-*` は全パッケージ同時リリース
- lockstep が崩れている場合は workflow が停止する
- dry-run / 本番の両方で npm 上の同version重複を検知して停止する
- 本番時は publish 前に version 更新commitを push する
- dry-run 時は一時更新した version を workflow 終了時に復元する

## VS Code release 補足
- `VSCE_PAT` を使って Marketplace へ公開する
- dry-run は `package`（vsix生成）まで実行する

## 互換性契約
- 正本: `releases/compatibility-matrix.json`
- 現在は `vscode -> core` と `mac -> core` の min/max 範囲を CI で検証
- `mac` を reserved に戻す場合は `apps.mac.status = "reserved"` に設定する

## mac app 運用補足
- v1 はローカル配布のみ（署名 / Notarization / Auto Update なし）。
- Apple Silicon をターゲットに `pnpm -C apps/mac tauri:build` を使用する。

## Links
- `docs/runbook/cicd.md`
- `docs/runbook/devsecops.md`
- `docs/runbook/widget-measure-contract.md`
