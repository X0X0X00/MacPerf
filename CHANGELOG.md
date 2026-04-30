# Changelog

All notable changes will land here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-04-30

First public release.

### Added
- Folder watcher (FSEvents) with auto-import on new CSV.
- UTF-16 LE/BE + UTF-8 BOM decoding, plus per-line BOM stripping (iStatistica Pro writes a BOM at the start of every row).
- SHA-256 content-hash dedupe.
- SQLite storage of `Session` (metadata + summary) and `Sample` (per-row).
- 4 chart panels: CPU, Memory, GPU, Thermal & Fan — synced hover cursor across all four (`syncId`), Brush zoom on the CPU panel.
- Auto insight detection: high CPU/GPU/memory pressure runs, overheating intervals, fan peak. Configurable thresholds + minimum durations.
- Click-to-focus: clicking an event in the InsightsPanel scrolls the matching chart into view and highlights the time range with a vivid `ReferenceArea`.
- Cross-session compare: 2–6 sessions overlayed by elapsed time + metrics table with B−A delta column when exactly two are selected.
- Auto pattern tags per session: 重 CPU / 重 GPU / 过热 / 稳定 / 空闲.
- OverviewBar across the top: total session count, total analyzed time, all-time peak temp / CPU / fan (clickable to jump), hour-of-day + weekday histograms.
- Library: searchable, sortable, sparkline preview per row.
- Threshold sliders in Settings + one-click "reanalyze all".
- Keyboard shortcuts: ⌘, settings · ⌘F search · ⌘K toggle overview · esc.
- Bilingual README (EN + 简体中文) with shields.io badges.
- MIT license, install guide (`docs/install.md`).
- GitHub Actions: `ci.yml` (cargo test + tsc on PR/push), `release.yml` (auto-build dmg on tag push via tauri-action).

### Tests
9 Rust unit tests cover: BOM decoding, real CSV fixture parse, timestamp parsing with timezone, stats computation, threshold-driven event detection.

[Unreleased]: https://github.com/X0X0X00/MacPerf/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/X0X0X00/MacPerf/releases/tag/v0.1.0
