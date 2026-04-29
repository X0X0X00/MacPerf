# Installing MacPerf

## macOS (Apple Silicon)

1. Download `MacPerf_0.1.0_aarch64.dmg` from the [Releases](https://github.com/X0X0X00/MacPerf/releases) page (or grab the same file checked into the repo root).
2. Open the DMG → drag **MacPerf** into Applications.
3. **First launch (important):** macOS will block the app because it isn't code-signed.
   Right-click `MacPerf.app` in Applications → **Open** → confirm in the dialog.
   After this once, you can launch normally.

If you see "app is damaged and can't be opened":

```sh
xattr -dr com.apple.quarantine /Applications/MacPerf.app
```

## macOS (Intel)

Not yet shipped. v0.2 will produce a universal binary.

## Windows / Linux

Not currently supported. MacPerf depends on iStatistica Pro, which is macOS-only,
so cross-platform builds are unlikely to land.

## Why no code-signing?

Code-signing certificates cost real money ($99/yr for Apple Developer ID) and
MacPerf is a free, open-source side project. The right-click → Open workaround
above is one-time per install.

## Build from source

MacPerf never makes a network request — all parsing, storage, and analysis is
local. To verify the binary against the source:

```sh
git clone git@github.com:X0X0X00/MacPerf.git
cd MacPerf
npm install
npm run tauri build
```

Output goes to `src-tauri/target/release/bundle/dmg/MacPerf_<version>_aarch64.dmg`.

Requirements: Rust stable, Node 20+, and Xcode Command Line Tools (`xcode-select --install`).

## Configuring the watched folder

On first launch the app prompts you to pick the folder iStatistica Pro exports
its CSV files to. The path is persisted to
`~/Library/Application Support/com.zzh.macperf/config.json` and the watcher
auto-imports any new CSV that lands there afterwards.

To reset: open Settings (⌘,) → click **重置** under "监视文件夹".
