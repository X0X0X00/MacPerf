# MacPerf — Mac 性能分析 App 设计文档

- **状态：** Draft
- **创建日期：** 2026-04-29
- **平台：** macOS 14 (Sonoma) 及以上
- **语言/框架：** Swift 5.9+, SwiftUI, SwiftData, Swift Charts

---

## 1. 概览 (Overview)

### 1.1 目标
构建一个原生 macOS 应用，自动监视 iStatistica Pro 导出 CSV 的固定文件夹，把每份 CSV 解析入库，并提供：
- 单条记录的多维度可视化（CPU / Memory / GPU / 温度 + 风扇）
- 自动检测的"性能事件"（持续高 CPU、过热区间、风扇满速等）
- 多条记录之间的叠加图与指标对比表

### 1.2 用户场景
1. 用户在 iStatistica Pro 设置中将"自动导出 CSV"指向某个文件夹
2. iStatistica Pro 在该文件夹生成 CSV
3. MacPerf 监视该文件夹，发现新 CSV 后**自动**解析入库并显示在记录库
4. 用户单击一条记录查看详情；多选 2–6 条做对比

### 1.3 明确不做 (Out of Scope / YAGNI)
- 不自己实时采集系统数据（不与 iStatistica 竞争，仅消费其导出文件）
- 不做用户标签/备注（按时间排序即可）
- 不支持 iCloud 同步、iOS 端、PDF 导出
- 不提供用户自定义阈值（先用合理默认值）
- 不做实时通知（除"已导入新记录"角落 toast 外不打扰用户）

---

## 2. 数据模型

### 2.1 SwiftData 表

#### `Session`（一条 CSV 记录的元数据 + 摘要）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `UUID` | 主键 |
| `sourceFilename` | `String` | 原始文件名 |
| `sourceFileHash` | `String` (SHA-256) | 内容哈希，去重用 |
| `importedAt` | `Date` | 导入时刻 |
| `startTime` | `Date` | CSV 第一行时间 |
| `endTime` | `Date` | CSV 最后一行时间 |
| `durationSeconds` | `Int` | 派生：endTime − startTime |
| `sampleCount` | `Int` | 行数 |
| `summary` | `SessionSummary` | 嵌入对象（见 2.2） |
| `samples` | `[Sample]` | 一对多关系 |

#### `Sample`（每行原始采样点）
| 字段 | 类型 | CSV 来源列 |
|---|---|---|
| `timestamp` | `Date` | `Time` |
| `cpuUtil` | `Double` (0–100) | `CPU Utilization` (剥离 %) |
| `memPressure` | `Double` (0–100) | `Memory Pressure` (剥离 %) |
| `memWired` | `Int64` (bytes) | `Memory Wired` |
| `memUsed` | `Int64` (bytes) | `Memory Used` |
| `memCached` | `Int64` (bytes) | `Memory Cached` |
| `memFree` | `Int64` (bytes) | `Memory Free` |
| `gpuUtil` | `Double` (0–100) | `GPU Utilization` |
| `gpuMemUsed` | `Int64` (bytes) | `GPU Memory Used` |
| `maxTemp` | `Int` (°C) | `Max Temperature` |
| `maxCpuTemp` | `Int` (°C) | `Max CPU Temperature` |
| `maxGpuTemp` | `Int` (°C) | `Max GPU Temperature` |
| `maxFanSpeed` | `Int` (RPM) | `Max Fan Speed` |
| `session` | `Session` | 反向关系 |

### 2.2 嵌入类型

#### `SessionSummary`（预计算的摘要指标，跟 Session 一起持久化）
对每个数值字段（cpuUtil、memPressure、gpuUtil、maxTemp、maxCpuTemp、maxGpuTemp、maxFanSpeed）记录：`avg`、`max`、`p95`、`min`。

派生指标：
- `secondsAboveCPU80`
- `secondsAboveGPU80`
- `secondsAboveMemPressure80`
- `secondsAboveTemp90`

事件列表：`events: [InsightEvent]`

#### `InsightEvent`
| 字段 | 类型 | 说明 |
|---|---|---|
| `kind` | enum: `highCPU` / `highGPU` / `highTemp` / `highMemPressure` / `fanPeak` | 事件类型 |
| `startTime` | `Date` | 区间起点（fanPeak 即峰值时刻） |
| `endTime` | `Date` | 区间终点（fanPeak 同 startTime） |
| `peakValue` | `Double` | 区间内峰值（CPU% / 温度 / RPM 等，单位由 kind 决定） |

### 2.3 降采样策略
- 单 session ≤ 5000 点：原样画
- 单 session > 5000 点 或 多 session 叠加 总点数 > 5000：按等长时间桶聚合（取 avg），目标点数 ≤ 5000
- 桶宽度 = `durationSeconds / 5000` 向上取整到秒

---

## 3. 应用架构

### 3.1 主窗口结构
`NavigationSplitView`：
- **Sidebar (Library)**：列出所有 Session 的 `Table`
- **Detail**：根据 sidebar 选中条目数切换：
  - 0 条 → 提示
  - 1 条 → `SessionDetailView`
  - 2–6 条 → `CompareView`
  - >6 条 → 提示"对比最多 6 条"

### 3.2 视图清单

| 视图 | 触发 | 内容 |
|---|---|---|
| **LibraryView** | 默认（侧栏） | `Table` 列：开始时间、时长、峰值 CPU%、峰值温度、最高风扇 RPM、采样数。可多选、按列排序、右键菜单"删除记录" |
| **SessionDetailView** | 选中 1 条 | 4 个 chart 面板（CPU / Memory / GPU / Thermal）+ 右侧 InsightsPanel |
| **CompareView** | 选中 2–6 条 | Tab 1: 叠加图；Tab 2: 指标对比表 |
| **EmptyStateView** | 文件夹未配置 / 无 CSV | 引导用户去设置选文件夹 |
| **SettingsScene** | macOS 标准 `Settings` | General Tab：导出文件夹路径设置；About Tab：版本信息 |
| **ImportToast** | 扫到新 CSV 时 | 角落 HUD，"已导入 1 个新记录"，3 秒淡出 |

### 3.3 服务层

| 服务 | 职责 |
|---|---|
| `FolderWatcher` | 包装 FSEvents API，监听文件夹变更 |
| `CSVImporter` | UTF-16 解码 → 校验表头 → 流式解析 → 算 hash → 写 SwiftData |
| `InsightEngine` | 计算 SessionSummary（avg/p95/peak、过阈值时长、事件区间） |
| `AppModel` (`@Observable`) | 管理 selectedSessions、importStatus、folderPath，作为 SwiftUI 环境对象 |

### 3.4 启动 / 运行流程
1. App 启动 → 注入 `ModelContainer` + `AppModel`
2. 从 `UserDefaults` 读 `folderPath`（首次为 nil → EmptyStateView）
3. 启动 `FolderWatcher` 监视该路径
4. 启动时全量扫一遍补漏（之前 app 没运行时落盘的文件）
5. 新文件落盘 → FSEvents 触发 → `CSVImporter` 异步解析 → `InsightEngine` 跑摘要 → 写库 → SwiftData `@Query` 自动驱动 LibraryView 刷新 → 角落 toast

---

## 4. 可视化设计

### 4.1 SessionDetailView — 4 个图表面板
所有面板共享 x 轴（绝对时间），支持同步缩放/平移（Swift Charts `chartXSelection`+`chartXScale`），鼠标悬停在所有面板同时显示十字游标。

| 面板 | 主图（左 Y） | 副图（右 Y） | 字段映射 |
|---|---|---|---|
| **① CPU** | 利用率折线（0–100%） | 温度折线（°C） | 主：`cpuUtil`；副：`maxCpuTemp` |
| **② Memory** | Wired/Used/Cached/Free 堆叠面积（GB） | Pressure 折线（0–100%） | 主：`memWired/memUsed/memCached/memFree`；副：`memPressure` |
| **③ GPU** | 利用率折线 + 显存折线（双左 Y：% / GB） | 温度折线（°C） | 主：`gpuUtil`、`gpuMemUsed`；副：`maxGpuTemp` |
| **④ Thermal & Fan** | 最高温折线（°C） | 风扇转速折线（RPM） | 主：`maxTemp`；副：`maxFanSpeed` |

每张图右上角小标注：当前选中区间的 `avg / peak`。

### 4.2 InsightsPanel（详情视图右侧）
按时间排序展示 `Session.summary.events`：
```
🔥 CPU 持续过高
   21:34:12 → 21:46:08 (11min 56s)  peak 98%

🌡 温度过高
   21:35:40 → 21:38:22 (2min 42s)  peak 96°C

💨 风扇满速
   21:37:01  peak 6867 RPM
```
点击某事件 → 4 个图表面板同步缩放/滚动到该时间段，并用浅黄背景高亮区间。

### 4.3 CompareView

#### Tab 1 "叠加图"
跟 SessionDetailView 同样 4 个面板，但每个面板里 N 条 session 叠加（同一指标，不同颜色）。X 轴改成"自起点经过时长"（HH:MM:SS），不同绝对时间的 session 也能对齐起点比较。颜色用 Apple 默认 categorical 调色板。

#### Tab 2 "指标对比表"
| Session | 时长 | avg CPU | peak CPU | 高 CPU 时长 | avg Temp | peak Temp | 过热时长 | peak Fan |
|---|---|---|---|---|---|---|---|---|

每列可排序，差值最大的列加粗显示。

### 4.4 自动洞察阈值（`InsightEngine` 默认规则）

| 检测项 | 触发条件 | 最短持续 | 合并间隙 |
|---|---|---|---|
| `highCPU` | cpuUtil > 80 | 60s | < 15s 合并 |
| `highGPU` | gpuUtil > 80 | 60s | < 15s 合并 |
| `highMemPressure` | memPressure > 80 | 60s | < 15s 合并 |
| `highTemp` | maxTemp > 90 | 30s | < 10s 合并 |
| `fanPeak` | 整段 maxFanSpeed 的极大值 | — | 单点事件 |

事件检测算法：单遍扫描 samples，维护当前 run 的 (start, end, peak)；不满足条件超过"合并间隙"则收尾，长度 ≥ "最短持续" 才输出事件。

---

## 5. 实现细节

### 5.1 CSV 解析管道（`CSVImporter`）

1. 读文件前 4 字节探测 BOM：
   - `FF FE` → UTF-16 LE（iStatistica Pro 默认）
   - `FE FF` → UTF-16 BE
   - `EF BB BF` → UTF-8 BOM
   - 否则 → 尝试 UTF-8
2. 解码为 `String`，按行切分
3. 第一行校验为预期 13 列表头，不匹配抛 `CSVImportError.invalidHeader`
4. 流式解析剩余行（不一次加载全部）：
   - `%` 字段 → 剥 `%` → `Double`
   - `Time` 字段 → 用 `DateFormatter` 自定义 format `"yyyy-MM-dd HH:mm:ss Z"`、locale `en_US_POSIX`、timeZone `UTC`（iStatistica Pro 输出形如 `2024-03-20 20:16:12 +0000`，与 ISO8601 略有差别）
   - 字节字段 → `Int64`
   - 温度/风扇 → `Int`
5. 边读边算 SHA-256（CryptoKit）
6. 哈希在库 → skip
7. 否则：每 500 行批量 insert Sample
8. `InsightEngine` 跑摘要 → 写回 `Session.summary`

### 5.2 文件夹监视

- 使用 `FSEventStreamCreate`（CoreServices），事件流 latency = 1.0s，flag 包含 `kFSEventStreamCreateFlagFileEvents`
- 仅响应 `.csv` 后缀
- 文件刚出现时可能仍在写入 → 等 `mtime` 稳定 ≥ 2 秒后再开始解析（防读半文件）
- 启动时调用 `FileManager.default.contentsOfDirectory(at:)` 全量扫一遍补漏
- 文件夹访问通过 **Security-Scoped Bookmark** 持久化（沙盒兼容）

### 5.3 错误处理

| 场景 | 行为 |
|---|---|
| 文件夹未配置 | EmptyStateView 提示去设置 |
| 文件夹路径失效（被删/没权限） | 顶部黄条 banner，带"重新选择文件夹"按钮 |
| 单个 CSV 解析失败 | LibraryView 该条目灰色 + ⚠️ 图标，悬停显示原因；其他文件继续 |
| 表头不匹配 | 失败原因 = "CSV 列与 iStatistica Pro 格式不一致" |
| 库损坏 | 启动时 SwiftData 抛错 → 弹窗"数据库已损坏，是否重置？"（重置只清缓存，原 CSV 还在） |

### 5.4 默认导出路径
首次启动时默认指向 iStatistica Pro 的常见导出位置（首选 `~/Documents/iStatistica/`，若不存在则等用户在 Settings 里指定）。**实现期需根据 iStatistica Pro 实际默认行为再核实** — 若它没固定默认路径，则首次启动直接进 EmptyStateView 引导用户选择。

### 5.5 技术栈

| 组件 | 选型 | 理由 |
|---|---|---|
| UI | SwiftUI | 原生，跟 SwiftData 集成最佳 |
| 数据 | SwiftData | macOS 14+ 原生 ORM，`@Query` 自动驱动 UI |
| 图表 | Swift Charts | 原生，macOS 13+，性能足够 |
| 文件监视 | FSEvents (CoreServices) | 系统级，省电 |
| 哈希 | CryptoKit `SHA256` | 内置 |
| 并发 | Swift Concurrency (`async`/`await`、`Task`) | 现代写法 |
| 第三方依赖 | **零** | 全部 Apple 原生框架 |

### 5.6 项目布局

```
MacPerf.xcodeproj  (或 Package.swift)
MacPerf/
├── App/
│   └── MacPerfApp.swift           # @main, 注入 AppModel + ModelContainer
├── Models/
│   ├── Session.swift              # SwiftData @Model
│   ├── Sample.swift
│   ├── SessionSummary.swift
│   └── InsightEvent.swift
├── Services/
│   ├── FolderWatcher.swift
│   ├── CSVImporter.swift
│   └── InsightEngine.swift
├── Features/
│   ├── Library/LibraryView.swift
│   ├── SessionDetail/
│   │   ├── SessionDetailView.swift
│   │   ├── CPUPanel.swift
│   │   ├── MemoryPanel.swift
│   │   ├── GPUPanel.swift
│   │   ├── ThermalPanel.swift
│   │   └── InsightsPanel.swift
│   ├── Compare/
│   │   ├── CompareView.swift
│   │   ├── OverlayChartsTab.swift
│   │   └── MetricsTableTab.swift
│   └── Settings/SettingsScene.swift
├── Shared/
│   ├── AppModel.swift             # @Observable
│   ├── Formatters.swift           # 字节→GB、温度、duration
│   └── ChartTheme.swift
└── Tests/
    ├── CSVImporterTests.swift     # fixture: mac status/iStatistica Pro - 2024-03-20 ....csv
    └── InsightEngineTests.swift
```

---

## 6. 测试策略

| 模块 | 测试方式 |
|---|---|
| `CSVImporter` | 单元测试：用 `mac status/iStatistica Pro - 2024-03-20 20:16:10 +0000.csv` 作 fixture，断言行数 = 8316，第一行/末行字段正确解析 |
| `InsightEngine` | 单元测试：构造合成 Sample 流，断言事件区间起止与 peak 值正确 |
| `FolderWatcher` | 集成测试：在临时目录新增/修改 .csv 文件，断言回调触发 |
| 视图层 | 手测；主要靠 SwiftUI Preview |

---

## 7. 里程碑（高层，细节在实现 plan 里展开）

- **M1 数据底座**：模型 + CSVImporter + 导入现有 fixture 的 happy-path 测试通过
- **M2 浏览**：LibraryView + SessionDetailView 4 个图表面板可看
- **M3 洞察**：InsightEngine + InsightsPanel + 事件 → 图表跳转
- **M4 对比**：CompareView Tab 1 + Tab 2
- **M5 监视**：FolderWatcher + Settings 文件夹选择 + 自动入库 + Toast
- **M6 抛光**：错误状态、EmptyStateView、键盘快捷键、菜单栏

---

## 8. 开放问题（实现期需要确认）

1. iStatistica Pro 是否有固定默认导出路径？若有则 5.4 写死；若无则首次启动直接进 EmptyStateView。
2. SwiftData 在数百万行 Sample 表下的查询性能 — 若发现明显瓶颈，考虑给 `Sample.timestamp` 建索引或迁移到原生 SQLite (GRDB)。
3. 沙盒（App Sandbox）开启时的文件夹访问 — 用 Security-Scoped Bookmark；若不开沙盒则简化（暂定开沙盒，App Store 兼容）。
