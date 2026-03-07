# Architecture Overview

## Package map

| package | 役割 |
| --- | --- |
| `webview-demo` | CodeMirror6 のデモ（EditorState/EditorView/共通設定） |
| `vscode-extension` | VS Code 拡張。Webview で CM6 + MarkBloom 拡張を組み合わせる |
| `mac` | Tauri 2 ベースの mac ネイティブアプリ（Editor MVP） |
| `cm6-live-preview-core` | Markdown記号の表示状態を動的に切り替える（syntax hide / secondary / raw） |
| `cm6-live-preview-mermaid` | Live Preview pluginとして mermaid fenced code を図widget表示する |
| `cm6-markdown-semantics` | Markdown要素を検出して範囲に semantic class を付与する |
| `cm6-typography-theme` | semantic class に対する見た目（CSSテーマ）を提供する |
| `cm6-live-preview` | core/semantics/theme を束ね、`mermaid` / `table` を preset option で合成する入口 |
| `cm6-table` | table editor UI（2モード編集 + 行列ハンドル） |
| `cm6-diff-gutter` | baseline との差分を行頭ガターで可視化する |
| `cm6-markdown-smart-bol` | Markdown行の`Ctrl+A`をSmart BOL（見出し考慮の行頭移動）に拡張する |

## Repository Layout

```mermaid
graph TD
  apps["apps/"] --> webviewDemo["webview-demo"]
  apps --> vscodeExtension["vscode-extension"]
  apps --> macApp["mac (tauri)"]

  core["packages/core/"] --> livePreview["cm6-live-preview"]
  core --> livePreviewCore["cm6-live-preview-core"]
  core --> livePreviewMermaid["cm6-live-preview-mermaid"]
  core --> markdownSemantics["cm6-markdown-semantics"]
  core --> typographyTheme["cm6-typography-theme"]
  core --> cm6Table["cm6-table"]
  core --> cm6DiffGutter["cm6-diff-gutter"]
  core --> cm6MarkdownSmartBol["cm6-markdown-smart-bol"]
```

## Dependency DAG

```mermaid
graph TD
  webview-demo --> cm6-live-preview
  webview-demo --> cm6-diff-gutter
  webview-demo --> cm6-markdown-smart-bol

  vscode-extension --> cm6-live-preview
  vscode-extension --> cm6-diff-gutter
  vscode-extension --> cm6-markdown-smart-bol

  mac --> cm6-live-preview
  mac --> cm6-diff-gutter
  mac --> cm6-markdown-smart-bol

  cm6-live-preview --> cm6-live-preview-core
  cm6-live-preview --> cm6-markdown-semantics
  cm6-live-preview --> cm6-typography-theme
  cm6-live-preview --> cm6-live-preview-mermaid
  cm6-live-preview --> cm6-table
  cm6-live-preview-mermaid --> cm6-live-preview-core
```

## Release Topology

```mermaid
graph TD
  corePackages["packages/core/cm6-*"] --> coreWorkflow["core-release.yml"]
  coreWorkflow --> npm["npm registry"]
  coreWorkflow --> coreTag["core-vX.Y.Z tag"]
  coreWorkflow --> coreRelease["GitHub Release (core)"]

  vscodeExtension["apps/vscode-extension"] --> vscodeWorkflow["vscode-release.yml"]
  vscodeWorkflow --> marketplace["VS Code Marketplace"]
  vscodeWorkflow --> vscodeTag["vscode-vX.Y.Z tag"]
  vscodeWorkflow --> vscodeRelease["GitHub Release (vscode)"]

  macApp["apps/mac"] --> macBuild["local tauri build"]
  macBuild --> macBundle[".app (aarch64-apple-darwin)"]

  compatibility["releases/compatibility-matrix.json"] --> coreWorkflow
  compatibility --> vscodeWorkflow
  compatibility --> macBuild
```

## Naming contract

- semantic class prefix は `mb-` に統一する
- `cm6-markdown-semantics` が class を付与し、`cm6-typography-theme` が見た目を定義する
- release tag は配布チャネルごとに分離する（`core-v*`, `vscode-v*`）
