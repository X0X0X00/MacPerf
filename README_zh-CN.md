<div align="center">
  <img src="assets/icon-1024.png" alt="MacPerf" width="120" height="120"/>

  <h1>MacPerf</h1>

  <p><strong>让 iStatistica Pro 的 CSV 真正能看。</strong></p>
  <p>监视一个文件夹 → 自动入库 → 时间序列可视化 + 阈值事件检测 + 跨记录对比 — <em>100% 本地，零网络请求。</em></p>

  <p>
    <a href="https://github.com/X0X0X00/MacPerf/stargazers"><img src="https://img.shields.io/github/stars/X0X0X00/MacPerf?style=flat-square&logo=github&color=f59e0b&labelColor=0b1220" alt="Stars"/></a>
    <a href="https://github.com/X0X0X00/MacPerf/releases"><img src="https://img.shields.io/github/v/tag/X0X0X00/MacPerf?sort=semver&style=flat-square&label=release&color=10b981&labelColor=0b1220" alt="Release"/></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/X0X0X00/MacPerf?style=flat-square&color=06b6d4&labelColor=0b1220" alt="License"/></a>
    <a href="https://github.com/X0X0X00/MacPerf/commits/main"><img src="https://img.shields.io/github/commit-activity/m/X0X0X00/MacPerf?style=flat-square&color=8b5cf6&label=commits&labelColor=0b1220" alt="Commits"/></a>
    <a href="https://tauri.app"><img src="https://img.shields.io/badge/built_with-Tauri_2-24c8db?style=flat-square&logo=tauri&logoColor=white&labelColor=0b1220" alt="Built with Tauri"/></a>
  </p>

  <p>
    <a href="README.md">English</a> · 简体中文
  </p>
</div>

---

## 为什么做这个

iStatistica Pro 能把系统状态导出成 CSV，但拿到一份几兆 UTF-16 表格（而且每行都带 BOM）你也读不出什么东西来。

MacPerf 把这堆 CSV 变成你真正会看的东西 —— 顺带回答你心里真正在想的问题：*这台 Mac 啥时候过热的？哪段时间 CPU 一直跑满？昨天 vs 今天哪个更费电？*

## 功能

- **🪂 自动监视** — 设置一个文件夹，iStatistica Pro 一导出新 CSV 就自动入库（FSEvents + `notify` crate）。新 session、toast 提示、零点击。
- **📊 4 个图表面板** — CPU / 内存 / GPU / 温度&风扇。跨面板同步 hover 游标，CPU 面板支持 brush 缩放。
- **🔍 自动洞察** — 持续高 CPU/GPU/内存压力、过热区间、风扇峰值。点击侧边栏事件 → 对应面板自动滚动定位 + 时间区间高亮。
- **🎯 阈值可调** — 80%/60s 太严？改 70%/30s + 一键"重新分析所有历史记录"，全部 session 实时重新评估。
- **🆚 跨记录对比** — 多选 2–6 条 session。叠加图按经过时间对齐，指标对比表带 B−A 差值列（仅当选 2 条时）。
- **🏷 自动标签** — 每条 session 自动打标签：*重 CPU*、*重 GPU*、*过热*、*稳定*、*空闲*。Library 列表扫一眼就知道每条记录是什么类型。
- **📈 全局摘要** — 历史峰值温度/CPU/风扇（点一下跳到对应记录），全档案的小时分布 + 星期分布直方图。
- **⚡ 迷你 sparkline** — Library 每行右边一条 CPU + 温度微缩曲线。
- **🔒 隐私优先** — 零网络请求，所有数据都在本机。

## 快速开始

### 安装（macOS, Apple Silicon）

1. 从 [Releases](https://github.com/X0X0X00/MacPerf/releases) 下载最新的 `MacPerf_*_aarch64.dmg`（仓库根目录也有同款文件可直接用）。
2. 打开 DMG → 把 **MacPerf** 拖到 Applications。
3. **首次启动**：app 没签名，右键 `MacPerf.app` → **打开** → 系统弹窗确认。

详见 [docs/install.md](docs/install.md)（包含 "app is damaged" 处理）。

### 配置

1. iStatistica Pro 里：Preferences → Logger → 设置 CSV 导出文件夹（比如 `~/Documents/iStatistica/`）
2. 打开 MacPerf → ⚙️ 设置 → 选同一个文件夹
3. 完事。已有 CSV 立即扫描入库，新 CSV 落盘后自动检测。

## 键盘快捷键

| 快捷键 | 操作 |
|---|---|
| ⌘, | 打开/关闭设置 |
| ⌘F | 聚焦搜索框 |
| ⌘K | 折叠/展开顶部摘要栏 |
| ⌘+点击 | 多选记录（选 2 条进对比模式） |
| 右键单击 | 删除该条记录 |

## 隐私

MacPerf **不发任何网络请求**。

- CSV 解析全在本地完成。
- 数据存在系统 app-data 目录下的 SQLite 文件里 (`~/Library/Application Support/com.zzh.macperf/macperf.sqlite`)。
- 没有遥测、没有埋点、没有自动更新检查。
- 开源 —— 自己看代码或从源码 build 验证。

## 开发

需要 Node 20+、Rust stable、macOS 上还需要 Xcode CLT。

```sh
git clone git@github.com:X0X0X00/MacPerf.git
cd MacPerf
npm install
npm run tauri dev      # 开发模式（热重载）
npm run tauri build    # 打 release（macOS 上是 .dmg）
```

### 项目结构

```
MacPerf/
├── src/                       # React 前端
│   ├── App.tsx                # 主布局 + 顶栏 + 摘要 + 快捷键
│   ├── views/
│   │   ├── Library.tsx        # 记录列表（搜索/排序/sparkline/标签）
│   │   ├── SessionDetail.tsx  # 单条详情（4 chart + insights）
│   │   ├── Compare.tsx        # 多条对比（叠加图 + diff 表）
│   │   └── Settings.tsx       # 文件夹 + 阈值 sliders
│   ├── components/
│   │   ├── Charts.tsx         # 4 个 Recharts 面板（synced + brush + reference areas）
│   │   ├── InsightsPanel.tsx  # 事件列表（点击→图表跳转高亮）
│   │   ├── OverviewBar.tsx    # 全局历史峰值 + 时段分布
│   │   └── Sparkline.tsx      # 列表里的微缩 SVG 折线
│   └── lib/                   # api / types / format / downsample
├── src-tauri/src/             # Rust 后端
│   ├── parser.rs              # CSV 解析（UTF-16 BOM + 每行 BOM）
│   ├── insight.rs             # 阈值驱动的统计 + 事件检测 + 标签推导
│   ├── importer.rs            # parse → hash → insight → DB
│   ├── watcher.rs             # 文件夹监视（notify-debouncer-mini）
│   ├── db.rs                  # SQLite schema + 查询
│   ├── commands.rs            # Tauri @command
│   └── config.rs              # JSON 持久化的设置 + 阈值
└── docs/                      # 安装文档 + 设计文档 + 实现计划
```

### 架构

Rust 后端把 iStatistica Pro CSV 解析成 `(Sample, SessionSummary)`，存到 SQLite，通过 Tauri command 暴露（`list_sessions`、`get_samples`、`get_session_sparkline`、`get_overview`、`set_thresholds` 等）。React 前端用 `invoke()` 调用、Recharts 渲染。文件夹监视跑在 Rust 单独线程里，通过 event 通知前端。

## 检测阈值（默认值，全部可在设置里改）

| 事件 | 触发条件 | 最短持续 | 合并间隙 |
|---|---|---|---|
| 高 CPU | `cpu_util > 80%` | 60s | 15s |
| 高 GPU | `gpu_util > 80%` | 60s | 15s |
| 内存压力 | `mem_pressure > 80%` | 60s | 15s |
| 过热 | `max_temp > 90°C` | 30s | 10s |
| 风扇峰值 | 整段最高 fan RPM | — | 单点 |

## 为什么不用 SwiftUI

最初设计稿是 SwiftUI + SwiftData + Swift Charts。但坎不是语言层面 —— SwiftUI 项目的 App Sandbox + Copy Bundle Resources 这些只能在 Xcode GUI 里点。Tauri 整套工具链全 CLI 可控（`npm create` / `cargo build` / `npm run tauri build`），图表生态（Recharts）也比 Swift Charts 现成得多，最终 `.app` 体验差别基本可以忽略。

## License

MIT

## 致谢

基于 [Tauri 2](https://tauri.app)、[React](https://react.dev)、[Recharts](https://recharts.org)、[rusqlite](https://github.com/rusqlite/rusqlite)、[notify](https://github.com/notify-rs/notify)、[encoding_rs](https://github.com/hsivonen/encoding_rs) 构建。

数据源依赖 [iStatistica Pro](https://www.imagetasks.com/system-monitor-mac/index.aspx)。如果这工具帮到你，请去给原作者打 5 星。
