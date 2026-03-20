## Context
`apps/mac` は Open/Save ボタン中心の操作で、macOS ネイティブアプリとして期待されるメニューショートカット（Cmd+O/S/N/F/./Z/Shift+Z）が不足していた。  
今回、ファイル操作・検索/置換・設定・Undo/Redo を統一的に呼び出す入力導線を決める必要がある。

## Options considered
- WebView の keydown のみで実装する - 実装は軽いが、macOS メニューバー統合ができずネイティブ体験が弱い。
- Tauri Rust 側でメニュー/イベント配線を実装する - ネイティブ性は高いが、Rust とフロントの往復配線が増え変更コストが高い。
- Tauri JS Menu API でアプリメニューを構築し、フロントのコマンド関数へ直接配線する - ネイティブメニューを維持しつつ、既存フロント実装へ最小変更で統合できる。

## Decision
Tauri の JS Menu API（`@tauri-apps/api/menu`）を一次入口として採用し、各メニューアクションを `apps/mac/src/app.ts` のコマンド関数へ直接ルーティングする。  
あわせて、ブラウザ dev 検証用に `!isTauri()` 時のみ最小の Cmd キーフォールバックを有効化する。

## Consequences
macOS でメニューバーから主要操作を統一実行でき、ショートカット要件を満たせる。  
一方で、入力導線の主軸が `app.ts` のコマンドルーターに集約されるため、今後のショートカット追加も同レイヤーでの管理が前提になる。  
また、Open/New は dirty state 確認を経由する設計に固定される。

## References
- `apps/mac/src/app.ts`
- `apps/mac/src/createEditor.ts`
- `apps/mac/index.html`
- `apps/mac/src/style.scss`
- `apps/mac/README.md`
