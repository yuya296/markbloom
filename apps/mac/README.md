# mac app (Tauri)

MarkBloom の mac ネイティブアプリ（Tauri 2）です。

## Features

- Markdown のローカルファイルを開く（Open）
- 編集内容をローカルファイルへ保存（Save）
- 新規ファイルを作成（New File）
- 検索/置換パネルを開く（Find / Replace）
- 設定パネルを開く（Settings: Line wrapping）
- Undo / Redo

## Shortcuts (macOS)

- `Cmd+O`: Open file
- `Cmd+S`: Save file
- `Cmd+N`: New file
- `Cmd+F`: Find / Replace
- `Cmd+.`: Settings
- `Cmd+Z`: Undo
- `Cmd+Shift+Z`: Redo

## Development

```sh
pnpm -C apps/mac dev
pnpm -C apps/mac tauri:dev
```

## Build

```sh
pnpm -C apps/mac build
pnpm -C apps/mac tauri:build
```

- v1 はローカル配布のみ（署名・Notarizationなし）
- ターゲットは Apple Silicon（`aarch64-apple-darwin`）
