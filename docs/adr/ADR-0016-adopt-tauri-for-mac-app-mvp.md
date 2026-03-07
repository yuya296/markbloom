## Context
MarkBloom は `core`（`@yuya296/cm6-*`）と `vscode` の release line を運用しているが、mac 向け配布 line は reserved のままだった。  
mac ネイティブアプリを追加するにあたり、既存の TypeScript/CM6 資産を活かしつつ、将来の署名・公証・配布拡張に繋がる土台を先に確立する必要がある。

## Options considered
- Electron を採用する - 実績は豊富だが、ランタイムが大きく v1 の軽量MVPに対して過剰。
- Tauri 2 を採用する - Rust runtime を前提に構成が増える一方、軽量で mac ネイティブ配布へ段階拡張しやすい。
- ネイティブ化を見送り Web 配布のみ継続 - 実装コストは最小だが、mac line の検証・運用を前進できない。

## Decision
`apps/mac` を Tauri 2 + Vite + TypeScript で実装し、v1 は Editor MVP（最小UI）に限定する。  
配布はローカルビルドのみとし、署名 / Notarization / Auto Update は将来の後続段階で追加する。  
`releases/compatibility-matrix.json` では `apps.mac` を active にし、`mac -> core` 互換範囲を CI で検証する。

## Consequences
- `apps/mac` が app line として成立し、`core / vscode / mac` の3ライン構成が実体化する。
- v1 は機能を絞るため、ファイルI/Oや正式配布（署名/公証）は未提供になる。
- 互換性チェックの対象が `vscode` に加えて `mac` に拡張される。
- 将来、配布 workflow・release note・tag 運用を mac line に段階追加できる。

## References
- `apps/mac/package.json`
- `apps/mac/src-tauri/tauri.conf.json`
- `releases/compatibility-matrix.json`
- `scripts/check-compatibility.mjs`
- `docs/architecture/overview.md`
