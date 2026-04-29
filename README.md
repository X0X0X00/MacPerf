<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="MacPerf" width="120" height="120"/>

# MacPerf

**让 iStatistica Pro 的 CSV 真正能看。**

监视一个文件夹 → 自动入库 → 时间序列可视化 + 阈值事件检测 + 跨记录对比。

100% 本地，零网络请求。

</div>

---

## 它是干什么的

iStatistica Pro 能把系统状态导出成 CSV，但拿到一份几兆的 UTF-16 表格你也读不出什么东西来。

MacPerf 把这堆 CSV 变成你真正会看的东西 —— 顺带回答你心里真正在想的问题：*这台 Mac 啥时候过热的？哪段时间 CPU 一直跑满？昨天 vs 今天哪个更费电？*

## 功能

- **🪂 自动监视** — 设置一个文件夹，iStatistica Pro 一导出新 CSV 就自动入库（FSEvents + `notify` crate）
- **📊 4 个图表面板** — CPU / 内存 / GPU / 温度&风扇，时间轴同步、hover 游标联动
- **🔍 自动洞察** — 持续高 CPU/GPU/内存压力、过热区间、风扇峰值，全部自动检测
- **🎯 配置阈值** — 80% 太宽？改成 70% 持续 30 秒，一键重新分析所有历史记录
- **🆚 跨记录对比** — 多选 2–6 条，叠加图按经过时间对齐 + 指标差值表（A vs B）
- **🏷 自动标签** — "重 CPU"、"过热"、"空闲"，扫一眼记录列表就知道每条记录大概是什么
- **📈 全局摘要** — 历史峰值温度/CPU/风扇（点一下跳到对应记录）+ 时段分布直方图
- **⚡ 迷你 sparkline** — Library 列表里每条记录右边一条微缩 CPU+温度曲线
- **🔒 隐私优先** — 所有处理都在本地，不发任何网络请求

## 快速开始

### 安装

从 [Releases](https://github.com/X0X0X00/MacPerf/releases) 下载最新的 `MacPerf_*.dmg`，把 MacPerf 拖到 Applications。

**首次启动**：app 没签名，右键 `MacPerf.app` → **打开** → 在系统弹窗里再确认一次。之后正常双击即可。

### 配置

1. 在 iStatistica Pro 的 Preferences → Logger 里把 CSV export 指向某个文件夹（比如 `~/Documents/iStatistica/`）
2. 打开 MacPerf，点右上角 ⚙️ → 选同一个文件夹
3. 完事，已有 CSV 会立即扫描入库，新 CSV 落盘后会自动检测

## 键盘快捷键

| 快捷键 | 操作 |
|---|---|
| ⌘, | 打开/关闭设置 |
| ⌘F | 聚焦搜索框 |
| ⌘K | 折叠/展开顶部摘要栏 |
| ⌘+点击 | 多选记录（选 2 条进对比模式） |
| 右键单击 | 删除该条记录 |

## 开发

需要 Rust stable + Node 20+ + Xcode CLT（macOS）。

```sh
git clone git@github.com:X0X0X00/MacPerf.git
cd MacPerf
npm install
npm run tauri dev      # 开发模式（热重载）
npm run tauri build    # 打 release，产物在 src-tauri/target/release/bundle/
```

### 项目结构

```
macperf/
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
│   ├── lib.rs                 # 入口 + 命令注册
│   ├── commands.rs            # Tauri @command（list/get/sparkline/overview/thresholds）
│   ├── parser.rs              # CSV 解析（UTF-16 BOM + 每行 BOM）
│   ├── insight.rs             # 阈值驱动的统计 + 事件检测 + 标签推导
│   ├── importer.rs            # parse → hash → insight → DB
│   ├── watcher.rs             # 文件夹监视（notify-debouncer-mini）
│   ├── db.rs                  # SQLite schema + 查询
│   ├── model.rs               # 数据类型
│   └── config.rs              # JSON 持久化的设置 + 阈值
└── docs/
    ├── design.md              # 原始设计文档
    └── plan.md                # 实现计划
```

### 技术栈

- **Tauri 2** — Rust 后端 + WebView 前端，零依赖原生 macOS 应用
- **React 19 + Vite + TypeScript** — UI
- **Recharts** — 时间序列图表
- **SQLite** (`rusqlite` bundled) — 本地存储
- **notify-debouncer-mini** — FSEvents 包装
- **encoding_rs** — UTF-16 BOM 解码
- **CryptoKit / sha2** — 内容哈希去重

零第三方服务依赖。

## 阈值默认值（可改）

| 事件 | 触发 | 最短持续 | 合并间隙 |
|---|---|---|---|
| 高 CPU | cpu_util > 80% | 60s | 15s |
| 高 GPU | gpu_util > 80% | 60s | 15s |
| 内存压力 | mem_pressure > 80% | 60s | 15s |
| 过热 | max_temp > 90°C | 30s | 10s |
| 风扇峰值 | 整段最高 fan RPM | — | 单点 |

在 Settings → 洞察阈值里调整 + "保存并重新分析" 即可。

## 为什么用 Tauri 不用 SwiftUI

最初设计稿是 SwiftUI + SwiftData + Swift Charts。但 SwiftUI 项目的 App Sandbox 配置 / Copy Bundle Resources 这些只能在 Xcode GUI 里点，整个开发链卡在 IDE 上。Tauri 这套全 CLI 可控（`npm create` / `cargo build`），跨平台，图表生态（Recharts）也比 Swift Charts 现成得多。

## License

MIT

## 致谢

数据源依赖 [iStatistica Pro](https://www.imagetasks.com/system-monitor-mac/index.aspx)。如果觉得这个工具有用，请去给原作者打 5 星。
