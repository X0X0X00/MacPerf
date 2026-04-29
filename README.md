# MacPerf

iStatistica Pro CSV 性能分析器 —— 监视一个文件夹，自动导入 iStatistica Pro 导出的 CSV，按时间序列可视化 + 自动检测异常事件 + 多记录对比。

## 快速开始

```sh
cd "mac status/macperf"
npm install                # 装前端依赖（首次约 30s）
npm run tauri dev          # 起开发模式（首次 Rust 编译约 1-2 min）
```

第一次启动时会让你选 iStatistica Pro 的 CSV 导出文件夹（设置里也能改）。
路径会持久化保存到 macOS 的 app data 目录。

打包发布版：

```sh
npm run tauri build        # 产出 .dmg / .app 在 src-tauri/target/release/bundle/
```

## 功能

- **自动监视** — `notify` crate 监视配置的文件夹，新 CSV 落盘即自动入库
- **去重** — 按 SHA-256 内容哈希，重复文件不会重复导入
- **4 个图表面板** — CPU、内存、GPU、温度 & 风扇
- **自动洞察** — 检测持续高 CPU/GPU/内存压力（>80%, 60s）、过热（>90°C, 30s）、风扇峰值
- **跨记录对比** — 多选 2–6 条记录，叠加图按经过时间对齐 + 指标对比表

## 数据流

```
CSV 文件 → notify 监视 → CSVImporter (UTF-16 解码 + 13 列校验)
                            ↓
                       SHA-256 去重
                            ↓
                  InsightEngine (统计 + 事件检测)
                            ↓
                   SQLite (sessions + samples)
                            ↓
                      Tauri command
                            ↓
                  React + Recharts 渲染
```

## 项目结构

```
macperf/
├── src/                       # React 前端
│   ├── App.tsx                # 主布局（top bar + sidebar + content）
│   ├── views/
│   │   ├── Library.tsx        # 记录列表（多选）
│   │   ├── SessionDetail.tsx  # 单条记录详情（4 chart + insights）
│   │   ├── Compare.tsx        # 多条对比（叠加图 + 表格）
│   │   └── Settings.tsx       # 设置模态框
│   ├── components/
│   │   ├── Charts.tsx         # 4 个 Recharts 面板
│   │   └── InsightsPanel.tsx
│   └── lib/                   # api / types / format / downsample
├── src-tauri/src/             # Rust 后端
│   ├── lib.rs                 # 入口 + 命令注册
│   ├── commands.rs            # Tauri @command
│   ├── parser.rs              # CSV 解析（UTF-16 BOM）
│   ├── insight.rs             # stats + event detection
│   ├── importer.rs            # parse → hash → insight → DB
│   ├── watcher.rs             # FSEvents 包装（notify-debouncer-mini）
│   ├── db.rs                  # SQLite schema + 查询
│   ├── model.rs               # 数据类型
│   └── config.rs              # JSON 持久化的设置
└── docs/superpowers/          # 设计文档 + 实现计划（在仓库根的 mac status/）
```

## 测试

```sh
cd src-tauri && cargo test --lib    # 6 个 Rust 单元测试
```

覆盖：
- UTF-16 LE BOM 解码
- 真实 CSV 行解析
- 时间戳解析（带时区）
- 统计计算
- 高 CPU 事件检测（含最短持续时长筛选）

## 阈值

| 事件 | 触发 | 最短持续 | 合并间隙 |
|---|---|---|---|
| 高 CPU | cpu_util > 80% | 60s | 15s |
| 高 GPU | gpu_util > 80% | 60s | 15s |
| 内存压力 | mem_pressure > 80% | 60s | 15s |
| 过热 | max_temp > 90°C | 30s | 10s |
| 风扇峰值 | 整段最高 fan RPM | — | 单点 |

阈值目前是硬编码（`src-tauri/src/insight.rs::THRESHOLDS`），可以改后重新编译。
