# MarkBloom

English | [日本語](./README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MarkBloom is a VS Code extension for **reviewing and editing Markdown** in a way that is friendly for humans, while keeping **Markdown as the single source of truth**.

## Purpose

- Make Markdown documents easier to **read, review, and iterate** on
- Reduce friction when editing “structure-heavy” Markdown (especially tables)
- Keep changes **diff-friendly** and compatible with normal Git workflows

## Philosophy

- **Human is primary**: AI can draft, but people should be able to review and correct quickly
- **Markdown is truth**: no separate data model that diverges from the `.md` file
- **Edit without fear**: improve readability and editability without breaking the source

## Non-goals

- Replacing Markdown with a proprietary document format
- Building a full Notion-like workspace or database

## Repository layout

- `apps/webview-demo`: integration demo app for CM6 + MarkBloom extensions
- `apps/vscode-extension`: VS Code extension app (`markbloom`)
- `apps/mac`: Tauri 2 based mac native app (`MarkBloom`)
- `packages/core/cm6-*`: core CM6 libraries published to npm
- `docs/`: architecture, runbook, ADR, and feature specs

## Live demo

- Latest snapshot (`main`): https://yuya296.github.io/MarkBloom/
- Pages content is publicly accessible. Do not include sensitive or private data in demo content.

## Development requirements

- Node.js `22+` (recommended: `24.x` via `.nvmrc`)
- pnpm `10.27.0` (managed via Corepack)

If Node is below the minimum version, `pnpm -C apps/webview-demo dev` fails early with a clear version error.

## Dependency model

- App layer (`apps/*`) depends on core layer (`@yuya296/cm6-*`).
- `apps/vscode-extension` and `apps/webview-demo` both use:
  - `@yuya296/cm6-live-preview`
  - `@yuya296/cm6-diff-gutter`
  - `@yuya296/cm6-markdown-smart-bol`
- `@yuya296/cm6-live-preview` composes:
  - `@yuya296/cm6-live-preview-core`
  - `@yuya296/cm6-markdown-semantics`
  - `@yuya296/cm6-typography-theme`
  - `@yuya296/cm6-live-preview-mermaid`
  - `@yuya296/cm6-table`
- `table` / `mermaid` are enabled via `livePreviewPreset` options in app wiring.

For diagrams and release topology, see `docs/architecture/overview.md`.

---
Docs live in `docs/`.
