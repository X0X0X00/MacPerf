<div align="center">
  <img src="assets/icon-1024.png" alt="MacPerf" width="120" height="120"/>

  <h1>MacPerf</h1>

  <p><strong>Make sense of your iStatistica Pro CSVs.</strong></p>
  <p>Watch a folder, auto-import every CSV, visualize 4 metric panels, surface anomalies, compare sessions side-by-side — <em>100% local, zero network calls.</em></p>

  <p>
    <a href="https://github.com/X0X0X00/MacPerf/stargazers"><img src="https://img.shields.io/github/stars/X0X0X00/MacPerf?style=flat-square&logo=github&color=f59e0b&labelColor=0b1220" alt="Stars"/></a>
    <a href="https://github.com/X0X0X00/MacPerf/releases"><img src="https://img.shields.io/github/v/tag/X0X0X00/MacPerf?sort=semver&style=flat-square&label=release&color=10b981&labelColor=0b1220" alt="Release"/></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/X0X0X00/MacPerf?style=flat-square&color=06b6d4&labelColor=0b1220" alt="License"/></a>
    <a href="https://github.com/X0X0X00/MacPerf/commits/main"><img src="https://img.shields.io/github/commit-activity/m/X0X0X00/MacPerf?style=flat-square&color=8b5cf6&label=commits&labelColor=0b1220" alt="Commits"/></a>
    <a href="https://tauri.app"><img src="https://img.shields.io/badge/built_with-Tauri_2-24c8db?style=flat-square&logo=tauri&logoColor=white&labelColor=0b1220" alt="Built with Tauri"/></a>
  </p>

  <p>
    English · <a href="README_zh-CN.md">简体中文</a>
  </p>
</div>

---

## Why

iStatistica Pro logs your Mac's CPU, GPU, memory, temperature and fan speed into CSV. The CSV is fine — until you want to actually look at it. Several megabytes of UTF-16 with a per-line BOM is not a thing humans read.

MacPerf turns that pile of CSVs into something you can use, and answers what you actually want to know: *when did this Mac throttle? Was it hotter rendering yesterday's video than today's? How long does it actually spend pinned at 100% CPU?*

## Features

- **🪂 Auto-watch** — Point it at a folder. Anything iStatistica Pro writes there is parsed and imported automatically (FSEvents via `notify-debouncer-mini`). New session, new toast, no clicks.
- **📊 4 chart panels** — CPU, Memory, GPU, Thermal & Fan. Synced hover cursor across all four (`syncId`), brush zoom on the CPU panel.
- **🔍 Auto insights** — Sustained high CPU/GPU/memory pressure runs, overheating intervals, fan peak. Click an event in the side panel and the matching panel scrolls into view with the time range highlighted.
- **🎯 Configurable thresholds** — Don't like 80% / 60s? Set 70% / 30s and click "reanalyze all" — every historical session gets re-evaluated.
- **🆚 Cross-session compare** — Pick 2–6 sessions. Get an overlay chart aligned by elapsed time and a metrics table with a B−A delta column (when exactly two are picked).
- **🏷 Auto pattern tags** — Each session gets tagged automatically: *heavy CPU*, *heavy GPU*, *overheating*, *stable*, *idle*. One glance at the library list and you know what each session was.
- **📈 Global overview** — All-time peak temp / CPU / fan with a one-click jump to the session, plus hour-of-day and weekday histograms across your whole archive.
- **⚡ Sparkline previews** — Every row in the library has a tiny CPU + temperature curve.
- **🔒 Privacy** — Zero network requests. Everything is on your machine.

## Quick start

### Install (macOS, Apple Silicon)

1. Download `MacPerf_<version>_aarch64.dmg` from [Releases](https://github.com/X0X0X00/MacPerf/releases) (or use the copy in this repo's root).
2. Open the DMG → drag **MacPerf** into Applications.
3. **First launch**: the app is unsigned. Right-click `MacPerf.app` → **Open** → confirm in the dialog.

See [docs/install.md](docs/install.md) for "app is damaged" workarounds.

### Configure

1. In iStatistica Pro: Preferences → Logger → set CSV export to a folder (e.g. `~/Documents/iStatistica/`).
2. Open MacPerf → ⚙️ Settings → pick the same folder.
3. That's it. Existing CSVs get scanned immediately, new ones get auto-imported as iStatistica writes them.

## Keyboard shortcuts

| Key | Action |
|---|---|
| ⌘, | Open / close Settings |
| ⌘F | Focus search box |
| ⌘K | Toggle the top overview bar |
| ⌘ + click | Multi-select (pick 2 to enter compare mode) |
| Right-click row | Delete that session |

## Privacy

MacPerf makes **zero network requests**. Period.

- CSV parsing is local.
- All data lives in `~/Library/Application Support/com.zzh.macperf/macperf.sqlite`.
- No telemetry, no analytics, no auto-update phone-home.
- Open source — audit the code or build from source to verify.

## Develop

Requires Node 20+, Rust stable, and Xcode CLT on macOS.

```sh
git clone git@github.com:X0X0X00/MacPerf.git
cd MacPerf
npm install
npm run tauri dev      # dev with hot reload
npm run tauri build    # release bundle → src-tauri/target/release/bundle/dmg/
```

### Project layout

```
MacPerf/
├── src/                       # React frontend
│   ├── App.tsx                # Top bar + overview + sidebar layout, shortcuts
│   ├── views/
│   │   ├── Library.tsx        # session list (search/sort/sparkline/tags)
│   │   ├── SessionDetail.tsx  # 4 chart panels + insights side panel
│   │   ├── Compare.tsx        # overlay charts + diff table
│   │   └── Settings.tsx       # folder picker + threshold sliders
│   ├── components/
│   │   ├── Charts.tsx         # 4 Recharts panels (synced hover, brush, ReferenceArea)
│   │   ├── InsightsPanel.tsx  # event list (click → scroll + highlight)
│   │   ├── OverviewBar.tsx    # all-time peaks + hour/weekday histograms
│   │   └── Sparkline.tsx      # tiny SVG cpu+temp curve per library row
│   └── lib/                   # typed Tauri commands, formatters, downsampling
├── src-tauri/src/             # Rust backend
│   ├── parser.rs              # UTF-16 + per-line BOM CSV decoder
│   ├── insight.rs             # threshold-driven stats + event runs + tags
│   ├── importer.rs            # parse → SHA-256 dedupe → insight → DB
│   ├── watcher.rs             # FSEvents wrapper (notify-debouncer-mini)
│   ├── db.rs                  # SQLite schema + queries
│   ├── commands.rs            # Tauri command surface
│   └── config.rs              # JSON-persisted settings + thresholds
└── docs/                      # install guide + design + plan
```

### Architecture

Rust backend parses iStatistica Pro CSVs into `(Sample, SessionSummary)`, persists to SQLite, exposes Tauri commands (`list_sessions`, `get_samples`, `get_session_sparkline`, `get_overview`, `set_thresholds`, …). React frontend reads via `invoke()`, renders with Recharts. The folder watcher runs in a Rust thread and emits events the frontend listens for.

## Detection thresholds (defaults — all configurable in Settings)

| Event | Trigger | Min duration | Merge gap |
|---|---|---|---|
| High CPU | `cpu_util > 80%` | 60s | 15s |
| High GPU | `gpu_util > 80%` | 60s | 15s |
| Memory pressure | `mem_pressure > 80%` | 60s | 15s |
| Overheating | `max_temp > 90°C` | 30s | 10s |
| Fan peak | global maximum fan RPM | — | single point |

## Why Tauri, not SwiftUI

The original spec was SwiftUI + SwiftData + Swift Charts. The deal-breaker turned out not to be the language: SwiftUI projects with App Sandbox + bundle resources require a working Xcode GUI for setup. Tauri's whole toolchain is CLI-driven (`npm create`, `cargo build`, `npm run tauri build`), the chart ecosystem (Recharts) is far more mature than Swift Charts, and the resulting `.app` is virtually indistinguishable from a SwiftUI build.

## License

MIT.

## Acknowledgements

Built on [Tauri 2](https://tauri.app), [React](https://react.dev), [Recharts](https://recharts.org), [rusqlite](https://github.com/rusqlite/rusqlite), [notify](https://github.com/notify-rs/notify), [encoding_rs](https://github.com/hsivonen/encoding_rs).

Data source dependency: [iStatistica Pro](https://www.imagetasks.com/system-monitor-mac/index.aspx). If this tool saves you time, go give the original author a 5-star.
