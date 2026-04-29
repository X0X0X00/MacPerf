# MacPerf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native macOS app that auto-imports iStatistica Pro CSV exports from a watched folder, visualizes per-session metrics across 4 chart panels, runs threshold-based insight detection, and supports cross-session comparison via overlays + a metrics table.

**Architecture:** SwiftUI app with `NavigationSplitView` shell. SwiftData models persist `Session` (metadata + summary) and `Sample` (per-row points). A `CSVImporter` parses UTF-16 CSVs, an `InsightEngine` computes summaries + threshold events, and a `FolderWatcher` (FSEvents) auto-ingests new files. Views: `LibraryView` (Table), `SessionDetailView` (4 chart panels + InsightsPanel), `CompareView` (overlay charts + metrics table).

**Tech Stack:** Swift 5.9+, SwiftUI, SwiftData, Swift Charts, FSEvents (CoreServices), CryptoKit. macOS 14+. Zero third-party dependencies.

**Spec:** `mac status/docs/superpowers/specs/2026-04-29-macperf-design.md`

---

## File Structure

Working directory: `mac status/`. Xcode project goes in this directory.

```
mac status/
├── MacPerf.xcodeproj/                     # created via Xcode UI in Task 0.1
├── MacPerf/
│   ├── App/
│   │   └── MacPerfApp.swift               # @main, ModelContainer + AppModel
│   ├── Models/
│   │   ├── Session.swift                  # @Model
│   │   ├── Sample.swift                   # @Model
│   │   ├── SessionSummary.swift           # Codable struct (stored on Session)
│   │   ├── InsightEvent.swift             # Codable struct
│   │   └── MetricStats.swift              # Codable struct (avg/min/max/p95)
│   ├── Services/
│   │   ├── CSVImporter.swift              # parse + dedupe + insert
│   │   ├── InsightEngine.swift            # summary + event detection
│   │   ├── FolderWatcher.swift            # FSEvents wrapper
│   │   └── BookmarkStore.swift            # security-scoped bookmark persistence
│   ├── Features/
│   │   ├── Library/
│   │   │   └── LibraryView.swift
│   │   ├── SessionDetail/
│   │   │   ├── SessionDetailView.swift
│   │   │   ├── CPUPanel.swift
│   │   │   ├── MemoryPanel.swift
│   │   │   ├── GPUPanel.swift
│   │   │   ├── ThermalPanel.swift
│   │   │   └── InsightsPanel.swift
│   │   ├── Compare/
│   │   │   ├── CompareView.swift
│   │   │   ├── OverlayChartsTab.swift
│   │   │   └── MetricsTableTab.swift
│   │   ├── Settings/
│   │   │   └── SettingsScene.swift
│   │   └── Common/
│   │       ├── EmptyStateView.swift
│   │       └── ImportToast.swift
│   └── Shared/
│       ├── AppModel.swift                 # @Observable
│       ├── Formatters.swift               # bytes→GB, duration, °C
│       ├── ChartTheme.swift               # palette + axis styles
│       └── Downsampler.swift              # bucket-average for chart data
├── MacPerfTests/
│   ├── Fixtures/
│   │   └── istatistica-sample.csv         # copy of the existing CSV
│   ├── CSVImporterTests.swift
│   ├── InsightEngineTests.swift
│   └── DownsamplerTests.swift
└── MacPerf.entitlements                   # App Sandbox + user-selected files RW
```

---

## Phase 0 — Project Setup

### Task 0.1: Create the Xcode project

**Files:**
- Create: `mac status/MacPerf.xcodeproj` (via Xcode UI)
- Create: `mac status/MacPerf/` folder hierarchy

- [ ] **Step 1: Create project in Xcode**

  1. Open Xcode → `File` → `New` → `Project…`
  2. Choose **macOS** tab → **App** → `Next`
  3. Settings:
     - Product Name: `MacPerf`
     - Team: (your developer team or None)
     - Organization Identifier: `com.zzh.macperf`
     - Interface: **SwiftUI**
     - Language: **Swift**
     - Storage: **SwiftData**
     - Include Tests: **checked**
  4. Save into `/Users/zzh/Visual Studio Code/mac status/`
  5. Verify these are created:
     - `MacPerf.xcodeproj`
     - `MacPerf/MacPerfApp.swift`
     - `MacPerf/Item.swift` (delete this file later)
     - `MacPerf/ContentView.swift` (delete this file later)
     - `MacPerfTests/MacPerfTests.swift`

- [ ] **Step 2: Set deployment target**

  In project settings → MacPerf target → General → **Minimum Deployments → macOS 14.0**.

- [ ] **Step 3: Configure App Sandbox entitlements**

  Project → MacPerf target → **Signing & Capabilities** → **+ Capability** → **App Sandbox**.
  In the App Sandbox section, enable:
  - **File Access** → **User Selected File**: **Read/Write**
  - **File Access** → **Bookmarks** application scope: **leave default**

- [ ] **Step 4: Delete starter scaffolding**

  Delete `MacPerf/Item.swift` and `MacPerf/ContentView.swift` (we'll replace them).

- [ ] **Step 5: Create folder groups in Xcode**

  In the project navigator, right-click `MacPerf` group → **New Group** for each: `App`, `Models`, `Services`, `Features`, `Shared`. Inside `Features` create sub-groups: `Library`, `SessionDetail`, `Compare`, `Settings`, `Common`. Move `MacPerfApp.swift` into `App`.

- [ ] **Step 6: Build and run to verify the empty project boots**

  ⌘R. Expected: an empty SwiftUI window appears (we'll fill it in Phase 4).

---

## Phase 1 — Data Models

### Task 1.1: Define `MetricStats` value type

**Files:** Create `MacPerf/Models/MetricStats.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation

struct MetricStats: Codable, Hashable {
    var min: Double
    var max: Double
    var avg: Double
    var p95: Double

    static let zero = MetricStats(min: 0, max: 0, avg: 0, p95: 0)
}
```

- [ ] **Step 2: Build (⌘B). Expected: success.**

### Task 1.2: Define `InsightEvent` value type

**Files:** Create `MacPerf/Models/InsightEvent.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation

enum InsightKind: String, Codable, Hashable, CaseIterable {
    case highCPU
    case highGPU
    case highTemp
    case highMemPressure
    case fanPeak
}

struct InsightEvent: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var kind: InsightKind
    var startTime: Date
    var endTime: Date
    var peakValue: Double  // %, °C, or RPM depending on kind

    var duration: TimeInterval { endTime.timeIntervalSince(startTime) }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 1.3: Define `SessionSummary` value type

**Files:** Create `MacPerf/Models/SessionSummary.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation

struct SessionSummary: Codable, Hashable {
    var cpuUtil: MetricStats = .zero
    var memPressure: MetricStats = .zero
    var gpuUtil: MetricStats = .zero
    var maxTemp: MetricStats = .zero
    var maxCpuTemp: MetricStats = .zero
    var maxGpuTemp: MetricStats = .zero
    var maxFanSpeed: MetricStats = .zero

    var secondsAboveCPU80: Int = 0
    var secondsAboveGPU80: Int = 0
    var secondsAboveMemPressure80: Int = 0
    var secondsAboveTemp90: Int = 0

    var events: [InsightEvent] = []
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 1.4: Define `Sample` SwiftData model

**Files:** Create `MacPerf/Models/Sample.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation
import SwiftData

@Model
final class Sample {
    @Attribute(.indexed) var timestamp: Date
    var cpuUtil: Double          // 0–100
    var memPressure: Double      // 0–100
    var memWired: Int64
    var memUsed: Int64
    var memCached: Int64
    var memFree: Int64
    var gpuUtil: Double          // 0–100
    var gpuMemUsed: Int64
    var maxTemp: Int             // °C
    var maxCpuTemp: Int          // °C
    var maxGpuTemp: Int          // °C
    var maxFanSpeed: Int         // RPM

    var session: Session?

    init(
        timestamp: Date,
        cpuUtil: Double,
        memPressure: Double,
        memWired: Int64,
        memUsed: Int64,
        memCached: Int64,
        memFree: Int64,
        gpuUtil: Double,
        gpuMemUsed: Int64,
        maxTemp: Int,
        maxCpuTemp: Int,
        maxGpuTemp: Int,
        maxFanSpeed: Int,
        session: Session? = nil
    ) {
        self.timestamp = timestamp
        self.cpuUtil = cpuUtil
        self.memPressure = memPressure
        self.memWired = memWired
        self.memUsed = memUsed
        self.memCached = memCached
        self.memFree = memFree
        self.gpuUtil = gpuUtil
        self.gpuMemUsed = gpuMemUsed
        self.maxTemp = maxTemp
        self.maxCpuTemp = maxCpuTemp
        self.maxGpuTemp = maxGpuTemp
        self.maxFanSpeed = maxFanSpeed
        self.session = session
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 1.5: Define `Session` SwiftData model

**Files:** Create `MacPerf/Models/Session.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation
import SwiftData

@Model
final class Session {
    @Attribute(.unique) var id: UUID
    var sourceFilename: String
    @Attribute(.unique) var sourceFileHash: String
    var importedAt: Date
    var startTime: Date
    var endTime: Date
    var durationSeconds: Int
    var sampleCount: Int

    // SessionSummary is Codable; SwiftData persists Codable structs as a single field.
    var summary: SessionSummary

    @Relationship(deleteRule: .cascade, inverse: \Sample.session)
    var samples: [Sample] = []

    init(
        id: UUID = UUID(),
        sourceFilename: String,
        sourceFileHash: String,
        importedAt: Date = .now,
        startTime: Date,
        endTime: Date,
        sampleCount: Int,
        summary: SessionSummary = SessionSummary()
    ) {
        self.id = id
        self.sourceFilename = sourceFilename
        self.sourceFileHash = sourceFileHash
        self.importedAt = importedAt
        self.startTime = startTime
        self.endTime = endTime
        self.durationSeconds = Int(endTime.timeIntervalSince(startTime))
        self.sampleCount = sampleCount
        self.summary = summary
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

---

## Phase 2 — Shared Helpers (Formatters, Downsampler)

### Task 2.1: Write Formatters

**Files:** Create `MacPerf/Shared/Formatters.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation

enum Fmt {
    static func bytesToGB(_ bytes: Int64) -> Double {
        Double(bytes) / 1_073_741_824.0
    }

    static func bytesToMB(_ bytes: Int64) -> Double {
        Double(bytes) / 1_048_576.0
    }

    static func duration(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 { return String(format: "%dh %02dm", h, m) }
        if m > 0 { return String(format: "%dm %02ds", m, s) }
        return "\(s)s"
    }

    static func percent(_ value: Double) -> String {
        String(format: "%.0f%%", value)
    }

    static func temperature(_ value: Int) -> String {
        "\(value)°C"
    }

    static func rpm(_ value: Int) -> String {
        "\(value) RPM"
    }

    static let csvDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss Z"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 2.2: Test Downsampler — equal-bucket averaging

**Files:**
- Create: `MacPerf/Shared/Downsampler.swift`
- Test: `MacPerfTests/DownsamplerTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import MacPerf

final class DownsamplerTests: XCTestCase {

    func test_returnsInputWhenUnderTarget() {
        let now = Date()
        let pts: [(Date, Double)] = (0..<100).map { (now.addingTimeInterval(Double($0)), Double($0)) }
        let out = Downsampler.bucketAverage(points: pts, targetCount: 5000)
        XCTAssertEqual(out.count, 100)
    }

    func test_bucketsByEqualTimeWidth() {
        let base = Date(timeIntervalSince1970: 0)
        // 10 points, each 1 second apart — values 0..9
        let pts: [(Date, Double)] = (0..<10).map { (base.addingTimeInterval(Double($0)), Double($0)) }
        let out = Downsampler.bucketAverage(points: pts, targetCount: 5)
        // 5 buckets of 2 points each → averages: 0.5, 2.5, 4.5, 6.5, 8.5
        XCTAssertEqual(out.count, 5)
        XCTAssertEqual(out[0].1, 0.5, accuracy: 0.001)
        XCTAssertEqual(out[4].1, 8.5, accuracy: 0.001)
    }

    func test_handlesEmptyInput() {
        let out = Downsampler.bucketAverage(points: [(Date, Double)](), targetCount: 100)
        XCTAssertEqual(out.count, 0)
    }
}
```

- [ ] **Step 2: Run test → FAIL (Downsampler does not exist)**

  Run via Xcode: ⌘U on the `DownsamplerTests` target. Expected: compile errors / failures.

- [ ] **Step 3: Implement Downsampler**

```swift
import Foundation

enum Downsampler {
    /// Averages points into ~targetCount equal-width time buckets.
    /// If input <= targetCount, returns input unchanged.
    static func bucketAverage(points: [(Date, Double)], targetCount: Int) -> [(Date, Double)] {
        guard points.count > targetCount, let first = points.first, let last = points.last else {
            return points
        }
        let totalSeconds = last.0.timeIntervalSince(first.0)
        guard totalSeconds > 0 else { return points }

        let bucketSeconds = totalSeconds / Double(targetCount)
        var buckets: [[(Date, Double)]] = Array(repeating: [], count: targetCount)
        for p in points {
            let elapsed = p.0.timeIntervalSince(first.0)
            var idx = Int(elapsed / bucketSeconds)
            if idx >= targetCount { idx = targetCount - 1 }
            buckets[idx].append(p)
        }

        return buckets.enumerated().compactMap { (i, bucket) -> (Date, Double)? in
            guard !bucket.isEmpty else { return nil }
            let midpoint = first.0.addingTimeInterval((Double(i) + 0.5) * bucketSeconds)
            let avg = bucket.reduce(0.0) { $0 + $1.1 } / Double(bucket.count)
            return (midpoint, avg)
        }
    }
}
```

- [ ] **Step 4: Run tests → PASS**

  ⌘U. Expected: all 3 tests pass.

---

## Phase 3 — CSV Importer

### Task 3.1: Copy CSV fixture into test resources

**Files:** Create `MacPerfTests/Fixtures/istatistica-sample.csv`

- [ ] **Step 1: Copy the file**

```bash
cp "/Users/zzh/Visual Studio Code/mac status/iStatistica Pro - 2024-03-20 20:16:10 +0000.csv" \
   "/Users/zzh/Visual Studio Code/mac status/MacPerfTests/Fixtures/istatistica-sample.csv"
```

- [ ] **Step 2: Add to Xcode test target**

  In Xcode: drag `Fixtures/istatistica-sample.csv` into the `MacPerfTests` group. In the dialog, check **MacPerfTests** target only, set **Add to targets** = MacPerfTests, **Copy items if needed** = checked.

- [ ] **Step 3: Verify it appears in MacPerfTests → Build Phases → Copy Bundle Resources**

  Project → MacPerfTests target → Build Phases → expand "Copy Bundle Resources" → confirm `istatistica-sample.csv` is listed.

### Task 3.2: Write CSVImporter error type and stub

**Files:** Create `MacPerf/Services/CSVImporter.swift`

- [ ] **Step 1: Write the stub**

```swift
import Foundation
import SwiftData
import CryptoKit

enum CSVImportError: Error, LocalizedError {
    case unreadable(URL)
    case invalidEncoding(URL)
    case invalidHeader(URL, expected: [String], got: [String])
    case malformedRow(URL, line: Int, reason: String)
    case empty(URL)
    case duplicate(hash: String)

    var errorDescription: String? {
        switch self {
        case .unreadable(let u): return "Could not read \(u.lastPathComponent)"
        case .invalidEncoding(let u): return "Unsupported encoding in \(u.lastPathComponent)"
        case .invalidHeader(let u, let exp, let got):
            return "\(u.lastPathComponent): header mismatch.\nExpected: \(exp.joined(separator: ","))\nGot: \(got.joined(separator: ","))"
        case .malformedRow(let u, let line, let reason):
            return "\(u.lastPathComponent) line \(line): \(reason)"
        case .empty(let u): return "\(u.lastPathComponent) is empty"
        case .duplicate(let h): return "Already imported (hash \(h.prefix(12))…)"
        }
    }
}

struct CSVImporter {
    static let expectedHeader: [String] = [
        "Time",
        "CPU Utilization",
        "Memory Pressure",
        "Memory Wired",
        "Memory Used",
        "Memory Cached",
        "Memory Free",
        "GPU Utilization",
        "GPU Memory Used",
        "Max Temperature",
        "Max CPU Temperature",
        "Max GPU Temperature",
        "Max Fan Speed",
    ]
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 3.3: Test BOM detection + decoding

**Files:**
- Modify: `MacPerf/Services/CSVImporter.swift`
- Test: `MacPerfTests/CSVImporterTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import MacPerf

final class CSVImporterTests: XCTestCase {

    func test_decodesUTF16LE_withBOM() throws {
        let data = Data([0xFF, 0xFE]) + "Hello".data(using: .utf16LittleEndian)!
        let str = try CSVImporter.decode(data: data)
        XCTAssertEqual(str, "Hello")
    }

    func test_decodesUTF16BE_withBOM() throws {
        let data = Data([0xFE, 0xFF]) + "Hello".data(using: .utf16BigEndian)!
        let str = try CSVImporter.decode(data: data)
        XCTAssertEqual(str, "Hello")
    }

    func test_decodesUTF8_withBOM() throws {
        let data = Data([0xEF, 0xBB, 0xBF]) + "Hello".data(using: .utf8)!
        let str = try CSVImporter.decode(data: data)
        XCTAssertEqual(str, "Hello")
    }

    func test_decodesUTF8_noBOM() throws {
        let data = "Hello".data(using: .utf8)!
        let str = try CSVImporter.decode(data: data)
        XCTAssertEqual(str, "Hello")
    }
}
```

- [ ] **Step 2: Run → FAIL (decode method doesn't exist)**

- [ ] **Step 3: Add `decode` to CSVImporter**

  Append to `CSVImporter.swift` (inside the `struct CSVImporter`):

```swift
extension CSVImporter {
    static func decode(data: Data) throws -> String {
        if data.starts(with: [0xFF, 0xFE]) {
            let body = data.dropFirst(2)
            guard let s = String(data: body, encoding: .utf16LittleEndian) else {
                throw CSVImportError.invalidEncoding(URL(fileURLWithPath: "/"))
            }
            return s
        }
        if data.starts(with: [0xFE, 0xFF]) {
            let body = data.dropFirst(2)
            guard let s = String(data: body, encoding: .utf16BigEndian) else {
                throw CSVImportError.invalidEncoding(URL(fileURLWithPath: "/"))
            }
            return s
        }
        if data.starts(with: [0xEF, 0xBB, 0xBF]) {
            let body = data.dropFirst(3)
            guard let s = String(data: body, encoding: .utf8) else {
                throw CSVImportError.invalidEncoding(URL(fileURLWithPath: "/"))
            }
            return s
        }
        if let s = String(data: data, encoding: .utf8) {
            return s
        }
        throw CSVImportError.invalidEncoding(URL(fileURLWithPath: "/"))
    }
}
```

- [ ] **Step 4: Run tests → PASS**

### Task 3.4: Test header validation + row parsing

**Files:**
- Modify: `MacPerf/Services/CSVImporter.swift`
- Modify: `MacPerfTests/CSVImporterTests.swift`

- [ ] **Step 1: Write the failing tests (append to CSVImporterTests)**

```swift
extension CSVImporterTests {
    func test_validHeader_parses() throws {
        let header = CSVImporter.expectedHeader.joined(separator: ",")
        let parsed = try CSVImporter.parseHeader(line: header, source: URL(fileURLWithPath: "/tmp/x"))
        XCTAssertEqual(parsed, CSVImporter.expectedHeader)
    }

    func test_wrongHeader_throws() {
        let header = "Time,CPU Utilization,Wrong"
        XCTAssertThrowsError(try CSVImporter.parseHeader(line: header, source: URL(fileURLWithPath: "/tmp/x")))
    }

    func test_parsesValidRow() throws {
        let row = "2024-03-20 20:16:12 +0000,52%,54%,3847225344,5366611968,4749000704,958398464,5%,139703150,86,86,72,6867"
        let parsed = try CSVImporter.parseRow(line: row, source: URL(fileURLWithPath: "/tmp/x"), lineNo: 2)
        XCTAssertEqual(parsed.cpuUtil, 52.0)
        XCTAssertEqual(parsed.memPressure, 54.0)
        XCTAssertEqual(parsed.memWired, 3_847_225_344)
        XCTAssertEqual(parsed.gpuUtil, 5.0)
        XCTAssertEqual(parsed.maxTemp, 86)
        XCTAssertEqual(parsed.maxFanSpeed, 6867)
    }

    func test_malformedRow_throws() {
        let row = "not-a-date,52%,54%,a,b,c,d,5%,1,2,3,4,5"
        XCTAssertThrowsError(try CSVImporter.parseRow(line: row, source: URL(fileURLWithPath: "/tmp/x"), lineNo: 2))
    }
}
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `parseHeader` and `parseRow`**

  Append to `CSVImporter.swift`:

```swift
struct ParsedRow {
    var timestamp: Date
    var cpuUtil: Double
    var memPressure: Double
    var memWired: Int64
    var memUsed: Int64
    var memCached: Int64
    var memFree: Int64
    var gpuUtil: Double
    var gpuMemUsed: Int64
    var maxTemp: Int
    var maxCpuTemp: Int
    var maxGpuTemp: Int
    var maxFanSpeed: Int
}

extension CSVImporter {
    static func parseHeader(line: String, source: URL) throws -> [String] {
        let cols = line.split(separator: ",", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
        guard cols == expectedHeader else {
            throw CSVImportError.invalidHeader(source, expected: expectedHeader, got: cols)
        }
        return cols
    }

    static func parseRow(line: String, source: URL, lineNo: Int) throws -> ParsedRow {
        let parts = line.split(separator: ",", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count == expectedHeader.count else {
            throw CSVImportError.malformedRow(source, line: lineNo, reason: "expected \(expectedHeader.count) columns, got \(parts.count)")
        }

        guard let date = Fmt.csvDateFormatter.date(from: parts[0]) else {
            throw CSVImportError.malformedRow(source, line: lineNo, reason: "bad timestamp '\(parts[0])'")
        }

        func pct(_ s: String, _ field: String) throws -> Double {
            let stripped = s.hasSuffix("%") ? String(s.dropLast()) : s
            guard let d = Double(stripped) else {
                throw CSVImportError.malformedRow(source, line: lineNo, reason: "bad \(field) '\(s)'")
            }
            return d
        }
        func i64(_ s: String, _ field: String) throws -> Int64 {
            guard let v = Int64(s) else {
                throw CSVImportError.malformedRow(source, line: lineNo, reason: "bad \(field) '\(s)'")
            }
            return v
        }
        func i(_ s: String, _ field: String) throws -> Int {
            guard let v = Int(s) else {
                throw CSVImportError.malformedRow(source, line: lineNo, reason: "bad \(field) '\(s)'")
            }
            return v
        }

        return ParsedRow(
            timestamp: date,
            cpuUtil: try pct(parts[1], "CPU Utilization"),
            memPressure: try pct(parts[2], "Memory Pressure"),
            memWired: try i64(parts[3], "Memory Wired"),
            memUsed: try i64(parts[4], "Memory Used"),
            memCached: try i64(parts[5], "Memory Cached"),
            memFree: try i64(parts[6], "Memory Free"),
            gpuUtil: try pct(parts[7], "GPU Utilization"),
            gpuMemUsed: try i64(parts[8], "GPU Memory Used"),
            maxTemp: try i(parts[9], "Max Temperature"),
            maxCpuTemp: try i(parts[10], "Max CPU Temperature"),
            maxGpuTemp: try i(parts[11], "Max GPU Temperature"),
            maxFanSpeed: try i(parts[12], "Max Fan Speed")
        )
    }
}
```

- [ ] **Step 4: Run tests → PASS**

### Task 3.5: Test importing the full fixture

**Files:**
- Modify: `MacPerf/Services/CSVImporter.swift`
- Modify: `MacPerfTests/CSVImporterTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import SwiftData

extension CSVImporterTests {

    @MainActor
    func test_importsRealFixture_writesSessionAndSamples() async throws {
        let url = Bundle(for: type(of: self)).url(forResource: "istatistica-sample", withExtension: "csv")
        XCTAssertNotNil(url)

        let schema = Schema([Session.self, Sample.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)

        let session = try CSVImporter.importFile(at: url!, into: context)
        try context.save()

        XCTAssertEqual(session.sampleCount, 8316)
        XCTAssertEqual(session.samples.count, 8316)
        XCTAssertEqual(Fmt.csvDateFormatter.string(from: session.startTime), "2024-03-20 20:16:12 +0000")
        XCTAssertEqual(Fmt.csvDateFormatter.string(from: session.endTime), "2024-03-21 05:34:27 +0000")

        // Spot-check first sample
        let sorted = session.samples.sorted { $0.timestamp < $1.timestamp }
        XCTAssertEqual(sorted.first?.cpuUtil, 52.0)
        XCTAssertEqual(sorted.first?.memWired, 3_847_225_344)
    }

    @MainActor
    func test_duplicateImport_throws() async throws {
        let url = Bundle(for: type(of: self)).url(forResource: "istatistica-sample", withExtension: "csv")!
        let schema = Schema([Session.self, Sample.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)

        _ = try CSVImporter.importFile(at: url, into: context)
        try context.save()

        XCTAssertThrowsError(try CSVImporter.importFile(at: url, into: context)) { err in
            guard case CSVImportError.duplicate = err else { return XCTFail("wrong error: \(err)") }
        }
    }
}
```

- [ ] **Step 2: Run → FAIL (importFile doesn't exist)**

- [ ] **Step 3: Implement `importFile`**

  Append to `CSVImporter.swift`:

```swift
extension CSVImporter {

    /// Synchronous import. Returns the inserted Session.
    /// Caller is responsible for calling `context.save()`.
    @discardableResult
    static func importFile(at url: URL, into context: ModelContext) throws -> Session {
        guard let data = try? Data(contentsOf: url) else {
            throw CSVImportError.unreadable(url)
        }
        guard !data.isEmpty else { throw CSVImportError.empty(url) }

        // Hash the raw bytes for dedupe
        let hashHex = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()

        // Dedupe: any existing Session with this hash?
        var fd = FetchDescriptor<Session>(predicate: #Predicate<Session> { $0.sourceFileHash == hashHex })
        fd.fetchLimit = 1
        if let existing = try context.fetch(fd).first {
            _ = existing  // silence warning
            throw CSVImportError.duplicate(hash: hashHex)
        }

        let text = try decode(data: data)
        var lines = text.split(omittingEmptySubsequences: true, whereSeparator: { $0 == "\r\n" || $0 == "\n" || $0 == "\r" }).map(String.init)
        guard !lines.isEmpty else { throw CSVImportError.empty(url) }

        _ = try parseHeader(line: lines.removeFirst(), source: url)

        var rows: [ParsedRow] = []
        rows.reserveCapacity(lines.count)
        for (i, line) in lines.enumerated() {
            let parsed = try parseRow(line: line, source: url, lineNo: i + 2)
            rows.append(parsed)
        }
        guard !rows.isEmpty else { throw CSVImportError.empty(url) }
        rows.sort { $0.timestamp < $1.timestamp }

        let session = Session(
            sourceFilename: url.lastPathComponent,
            sourceFileHash: hashHex,
            startTime: rows.first!.timestamp,
            endTime: rows.last!.timestamp,
            sampleCount: rows.count,
            summary: SessionSummary()
        )
        context.insert(session)

        // Batch-insert samples (SwiftData handles batching internally; we just iterate)
        for r in rows {
            let s = Sample(
                timestamp: r.timestamp,
                cpuUtil: r.cpuUtil,
                memPressure: r.memPressure,
                memWired: r.memWired,
                memUsed: r.memUsed,
                memCached: r.memCached,
                memFree: r.memFree,
                gpuUtil: r.gpuUtil,
                gpuMemUsed: r.gpuMemUsed,
                maxTemp: r.maxTemp,
                maxCpuTemp: r.maxCpuTemp,
                maxGpuTemp: r.maxGpuTemp,
                maxFanSpeed: r.maxFanSpeed,
                session: session
            )
            context.insert(s)
        }

        return session
    }
}
```

- [ ] **Step 4: Run tests → PASS**

  ⌘U. Both new tests should pass. The fixture parse may take a few seconds (8316 rows).

- [ ] **Step 5: Commit point — first time we have working data flow**

  Snapshot a `git init`-style backup is not required, but if you set up git: `git add -A && git commit -m "feat: csv importer with fixture coverage"`.

---

## Phase 4 — Insight Engine

### Task 4.1: Test MetricStats computation

**Files:**
- Create: `MacPerf/Services/InsightEngine.swift`
- Test: `MacPerfTests/InsightEngineTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import MacPerf

final class InsightEngineTests: XCTestCase {

    func test_computesStatsForSimpleSeries() {
        let values: [Double] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        let s = InsightEngine.stats(of: values)
        XCTAssertEqual(s.min, 10)
        XCTAssertEqual(s.max, 100)
        XCTAssertEqual(s.avg, 55, accuracy: 0.001)
        // p95 over 10 sorted values: index = floor(0.95 * 9) = 8 → values[8] = 90
        XCTAssertEqual(s.p95, 90)
    }

    func test_handlesEmptySeries() {
        let s = InsightEngine.stats(of: [])
        XCTAssertEqual(s, .zero)
    }
}
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `stats`**

  Write `MacPerf/Services/InsightEngine.swift`:

```swift
import Foundation

enum InsightEngine {

    static func stats(of values: [Double]) -> MetricStats {
        guard !values.isEmpty else { return .zero }
        let sorted = values.sorted()
        let avg = values.reduce(0, +) / Double(values.count)
        let p95idx = min(Int(Double(sorted.count - 1) * 0.95), sorted.count - 1)
        return MetricStats(min: sorted.first!, max: sorted.last!, avg: avg, p95: sorted[p95idx])
    }
}
```

- [ ] **Step 4: Run tests → PASS**

### Task 4.2: Test threshold-run detection

**Files:**
- Modify: `MacPerf/Services/InsightEngine.swift`
- Modify: `MacPerfTests/InsightEngineTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
extension InsightEngineTests {

    private func sample(_ secondsFromZero: Int, cpu: Double = 0, gpu: Double = 0,
                        memP: Double = 0, maxTemp: Int = 0, fan: Int = 0) -> Sample {
        let base = Date(timeIntervalSince1970: 0)
        return Sample(
            timestamp: base.addingTimeInterval(Double(secondsFromZero)),
            cpuUtil: cpu, memPressure: memP,
            memWired: 0, memUsed: 0, memCached: 0, memFree: 0,
            gpuUtil: gpu, gpuMemUsed: 0,
            maxTemp: maxTemp, maxCpuTemp: 0, maxGpuTemp: 0,
            maxFanSpeed: fan
        )
    }

    func test_detectsHighCPURun_above80pct_meetingMinDuration() {
        // 0..120s at 90% cpu (above 80, lasts 120s ≥ 60s threshold)
        let samples = (0...120).map { sample($0, cpu: 90) }
        let events = InsightEngine.detectEvents(in: samples)
        let cpuEvents = events.filter { $0.kind == .highCPU }
        XCTAssertEqual(cpuEvents.count, 1)
        XCTAssertEqual(cpuEvents.first!.peakValue, 90)
    }

    func test_ignoresHighCPURun_belowMinDuration() {
        // 0..30s at 90% cpu (only 30s, below 60s threshold)
        let samples = (0...30).map { sample($0, cpu: 90) }
        let events = InsightEngine.detectEvents(in: samples)
        XCTAssertTrue(events.filter { $0.kind == .highCPU }.isEmpty)
    }

    func test_mergesAdjacentRuns_belowGap() {
        // High for 80s, drop for 10s, high for 80s — gap < 15s, should merge
        var samples = (0...80).map { sample($0, cpu: 90) }
        samples += (81...90).map { sample($0, cpu: 50) }
        samples += (91...170).map { sample($0, cpu: 90) }
        let events = InsightEngine.detectEvents(in: samples)
        let cpuEvents = events.filter { $0.kind == .highCPU }
        XCTAssertEqual(cpuEvents.count, 1)
    }

    func test_doesNotMergeRuns_aboveGap() {
        var samples = (0...80).map { sample($0, cpu: 90) }
        samples += (81...110).map { sample($0, cpu: 50) }   // 30s gap > 15s
        samples += (111...190).map { sample($0, cpu: 90) }
        let events = InsightEngine.detectEvents(in: samples)
        let cpuEvents = events.filter { $0.kind == .highCPU }
        XCTAssertEqual(cpuEvents.count, 2)
    }

    func test_detectsFanPeak_singleEvent() {
        let samples = (0...10).map { sample($0, fan: $0 * 1000) }  // peaks at 10000
        let events = InsightEngine.detectEvents(in: samples)
        let peaks = events.filter { $0.kind == .fanPeak }
        XCTAssertEqual(peaks.count, 1)
        XCTAssertEqual(peaks.first!.peakValue, 10000)
    }

    func test_detectsHighTemp_30sMin() {
        // 0..40s at 95°C (above 90, lasts 40s ≥ 30s threshold)
        let samples = (0...40).map { sample($0, maxTemp: 95) }
        let events = InsightEngine.detectEvents(in: samples)
        XCTAssertEqual(events.filter { $0.kind == .highTemp }.count, 1)
    }
}
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `detectEvents`**

  Append to `InsightEngine.swift`:

```swift
extension InsightEngine {

    struct Threshold {
        var kind: InsightKind
        var test: (Sample) -> Double?    // returns the value if the sample qualifies
        var minDurationSec: Double
        var mergeGapSec: Double
    }

    static let thresholds: [Threshold] = [
        Threshold(kind: .highCPU,         test: { $0.cpuUtil > 80 ? $0.cpuUtil : nil },        minDurationSec: 60, mergeGapSec: 15),
        Threshold(kind: .highGPU,         test: { $0.gpuUtil > 80 ? $0.gpuUtil : nil },        minDurationSec: 60, mergeGapSec: 15),
        Threshold(kind: .highMemPressure, test: { $0.memPressure > 80 ? $0.memPressure : nil }, minDurationSec: 60, mergeGapSec: 15),
        Threshold(kind: .highTemp,        test: { $0.maxTemp > 90 ? Double($0.maxTemp) : nil }, minDurationSec: 30, mergeGapSec: 10),
    ]

    static func detectEvents(in samples: [Sample]) -> [InsightEvent] {
        let sorted = samples.sorted { $0.timestamp < $1.timestamp }
        var events: [InsightEvent] = []

        for t in thresholds {
            events.append(contentsOf: detectRuns(in: sorted, threshold: t))
        }

        if let peakSample = sorted.max(by: { $0.maxFanSpeed < $1.maxFanSpeed }), peakSample.maxFanSpeed > 0 {
            events.append(InsightEvent(
                kind: .fanPeak,
                startTime: peakSample.timestamp,
                endTime: peakSample.timestamp,
                peakValue: Double(peakSample.maxFanSpeed)
            ))
        }

        return events.sorted { $0.startTime < $1.startTime }
    }

    private static func detectRuns(in samples: [Sample], threshold t: Threshold) -> [InsightEvent] {
        var raw: [(start: Date, end: Date, peak: Double)] = []
        var cur: (start: Date, end: Date, peak: Double)?
        for s in samples {
            if let v = t.test(s) {
                if var run = cur {
                    run.end = s.timestamp
                    run.peak = max(run.peak, v)
                    cur = run
                } else {
                    cur = (s.timestamp, s.timestamp, v)
                }
            } else {
                if let run = cur { raw.append(run); cur = nil }
            }
        }
        if let run = cur { raw.append(run) }

        // Merge gaps
        var merged: [(start: Date, end: Date, peak: Double)] = []
        for r in raw {
            if let last = merged.last, r.start.timeIntervalSince(last.end) <= t.mergeGapSec {
                let combined = (start: last.start, end: r.end, peak: max(last.peak, r.peak))
                merged.removeLast()
                merged.append(combined)
            } else {
                merged.append(r)
            }
        }

        return merged
            .filter { $0.end.timeIntervalSince($0.start) >= t.minDurationSec }
            .map { InsightEvent(kind: t.kind, startTime: $0.start, endTime: $0.end, peakValue: $0.peak) }
    }
}
```

- [ ] **Step 4: Run tests → PASS**

### Task 4.3: Test full summary computation

**Files:**
- Modify: `MacPerf/Services/InsightEngine.swift`
- Modify: `MacPerfTests/InsightEngineTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
extension InsightEngineTests {
    func test_computeSummary_aggregatesAllFields() {
        let samples = (0...120).map { sample($0, cpu: 90, gpu: 30, memP: 40, maxTemp: 75, fan: 3000) }
        let summary = InsightEngine.computeSummary(samples: samples)
        XCTAssertEqual(summary.cpuUtil.max, 90)
        XCTAssertEqual(summary.cpuUtil.min, 90)
        XCTAssertEqual(summary.gpuUtil.avg, 30, accuracy: 0.001)
        XCTAssertEqual(summary.maxFanSpeed.max, 3000)
        // 121 samples at 1s spacing → 120s elapsed; cpu > 80 the whole time → 120
        XCTAssertEqual(summary.secondsAboveCPU80, 120)
        // events should include exactly one highCPU
        XCTAssertEqual(summary.events.filter { $0.kind == .highCPU }.count, 1)
    }
}
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `computeSummary`**

  Append to `InsightEngine.swift`:

```swift
extension InsightEngine {

    static func computeSummary(samples: [Sample]) -> SessionSummary {
        let sorted = samples.sorted { $0.timestamp < $1.timestamp }
        var s = SessionSummary()

        s.cpuUtil      = stats(of: sorted.map(\.cpuUtil))
        s.memPressure  = stats(of: sorted.map(\.memPressure))
        s.gpuUtil      = stats(of: sorted.map(\.gpuUtil))
        s.maxTemp      = stats(of: sorted.map { Double($0.maxTemp) })
        s.maxCpuTemp   = stats(of: sorted.map { Double($0.maxCpuTemp) })
        s.maxGpuTemp   = stats(of: sorted.map { Double($0.maxGpuTemp) })
        s.maxFanSpeed  = stats(of: sorted.map { Double($0.maxFanSpeed) })

        s.secondsAboveCPU80         = secondsAbove(samples: sorted) { $0.cpuUtil > 80 }
        s.secondsAboveGPU80         = secondsAbove(samples: sorted) { $0.gpuUtil > 80 }
        s.secondsAboveMemPressure80 = secondsAbove(samples: sorted) { $0.memPressure > 80 }
        s.secondsAboveTemp90        = secondsAbove(samples: sorted) { $0.maxTemp > 90 }

        s.events = detectEvents(in: sorted)
        return s
    }

    private static func secondsAbove(samples: [Sample], where pred: (Sample) -> Bool) -> Int {
        var total: TimeInterval = 0
        var prev: Sample?
        for s in samples {
            if let p = prev, pred(p) {
                total += s.timestamp.timeIntervalSince(p.timestamp)
            }
            prev = s
        }
        return Int(total.rounded())
    }
}
```

- [ ] **Step 4: Run tests → PASS**

### Task 4.4: Wire summary computation into the importer

**Files:** Modify `MacPerf/Services/CSVImporter.swift`

- [ ] **Step 1: After session and samples are inserted, compute summary**

  In `importFile`, after the `for r in rows { ... }` insert loop, replace the `return session` line with:

```swift
        // Compute summary using the parsed rows (avoid round-tripping through SwiftData)
        let synthetic = rows.map {
            Sample(
                timestamp: $0.timestamp,
                cpuUtil: $0.cpuUtil, memPressure: $0.memPressure,
                memWired: $0.memWired, memUsed: $0.memUsed, memCached: $0.memCached, memFree: $0.memFree,
                gpuUtil: $0.gpuUtil, gpuMemUsed: $0.gpuMemUsed,
                maxTemp: $0.maxTemp, maxCpuTemp: $0.maxCpuTemp, maxGpuTemp: $0.maxGpuTemp,
                maxFanSpeed: $0.maxFanSpeed
            )
        }
        session.summary = InsightEngine.computeSummary(samples: synthetic)
        return session
```

- [ ] **Step 2: Update the fixture-import test to assert summary populated**

  Modify `test_importsRealFixture_writesSessionAndSamples` and append:

```swift
        XCTAssertGreaterThan(session.summary.cpuUtil.max, 0)
        XCTAssertGreaterThan(session.summary.maxTemp.max, 0)
        // The fixture is real production data; just sanity-check the summary ran
        XCTAssertNotNil(session.summary.events)
```

- [ ] **Step 3: Run all tests → PASS**

---

## Phase 5 — App Skeleton & AppModel

### Task 5.1: Write `AppModel`

**Files:** Create `MacPerf/Shared/AppModel.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation
import SwiftUI
import SwiftData

@Observable
final class AppModel {
    var folderPath: URL?
    var selectedSessionIDs: Set<PersistentIdentifier> = []
    var lastImportToast: String?
    var lastImportError: String?

    init() {
        // folderPath is restored later in the BookmarkStore-aware version (Task 9.4)
        self.folderPath = nil
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 5.2: Write the `@main` app entry

**Files:** Replace `MacPerf/App/MacPerfApp.swift`

- [ ] **Step 1: Replace the file content**

```swift
import SwiftUI
import SwiftData

@main
struct MacPerfApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
        }
        .modelContainer(for: [Session.self, Sample.self])
        .commands {
            CommandGroup(replacing: .newItem) { }   // hide "New" — single-window app
        }

        Settings {
            SettingsScene()
                .environment(appModel)
        }
        .modelContainer(for: [Session.self, Sample.self])
    }
}
```

- [ ] **Step 2: Build → expect "Cannot find 'RootView'" and "Cannot find 'SettingsScene'"**. We'll add stubs next.

### Task 5.3: Stub `RootView` and `SettingsScene`

**Files:**
- Create: `MacPerf/Features/Library/LibraryView.swift` (stub)
- Create: `MacPerf/Features/Settings/SettingsScene.swift` (stub)
- Create: `MacPerf/Features/Common/EmptyStateView.swift` (stub)
- Create: `MacPerf/App/RootView.swift`

- [ ] **Step 1: EmptyStateView stub**

```swift
import SwiftUI

struct EmptyStateView: View {
    let message: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(message).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

- [ ] **Step 2: LibraryView stub**

```swift
import SwiftUI
import SwiftData

struct LibraryView: View {
    @Query(sort: \Session.startTime, order: .reverse) private var sessions: [Session]
    @Environment(AppModel.self) private var app

    var body: some View {
        if sessions.isEmpty {
            EmptyStateView(message: "No sessions yet.\nConfigure the watched folder in Settings.")
        } else {
            Text("\(sessions.count) sessions").padding()
        }
    }
}
```

- [ ] **Step 3: SettingsScene stub**

```swift
import SwiftUI

struct SettingsScene: View {
    var body: some View {
        Form {
            Text("Settings will go here.")
        }
        .frame(width: 480, height: 280)
    }
}
```

- [ ] **Step 4: RootView**

```swift
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        NavigationSplitView {
            LibraryView()
                .frame(minWidth: 360)
        } detail: {
            EmptyStateView(message: "Select a session to view details.")
        }
    }
}
```

- [ ] **Step 5: Build & run (⌘R) → empty window with split view appears.**

---

## Phase 6 — Library View (real)

### Task 6.1: Real LibraryView with multi-select Table

**Files:** Replace `MacPerf/Features/Library/LibraryView.swift`

- [ ] **Step 1: Replace the file**

```swift
import SwiftUI
import SwiftData

struct LibraryView: View {
    @Query(sort: \Session.startTime, order: .reverse) private var sessions: [Session]
    @Environment(\.modelContext) private var context
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        Group {
            if sessions.isEmpty {
                EmptyStateView(message: "No sessions yet.\nConfigure the watched folder in Settings.")
            } else {
                Table(sessions, selection: $app.selectedSessionIDs) {
                    TableColumn("Start") { s in
                        Text(s.startTime, format: .dateTime.year().month().day().hour().minute())
                    }
                    TableColumn("Duration") { s in
                        Text(Fmt.duration(s.durationSeconds))
                    }
                    TableColumn("Peak CPU") { s in
                        Text(Fmt.percent(s.summary.cpuUtil.max))
                    }
                    TableColumn("Peak Temp") { s in
                        Text(Fmt.temperature(Int(s.summary.maxTemp.max)))
                    }
                    TableColumn("Peak Fan") { s in
                        Text(Fmt.rpm(Int(s.summary.maxFanSpeed.max)))
                    }
                    TableColumn("Samples") { s in
                        Text("\(s.sampleCount)")
                    }
                }
                .contextMenu(forSelectionType: PersistentIdentifier.self) { ids in
                    Button("Delete", role: .destructive) {
                        for id in ids {
                            if let s = sessions.first(where: { $0.persistentModelID == id }) {
                                context.delete(s)
                            }
                        }
                        try? context.save()
                    }
                } primaryAction: { _ in }
            }
        }
        .navigationTitle("MacPerf")
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 6.2: Wire selection into RootView detail switching

**Files:**
- Modify: `MacPerf/App/RootView.swift`
- Create: `MacPerf/Features/SessionDetail/SessionDetailView.swift` (stub)
- Create: `MacPerf/Features/Compare/CompareView.swift` (stub)

- [ ] **Step 1: Stub SessionDetailView**

```swift
import SwiftUI

struct SessionDetailView: View {
    let session: Session
    var body: some View {
        Text("Detail: \(session.sourceFilename)").padding()
    }
}
```

- [ ] **Step 2: Stub CompareView**

```swift
import SwiftUI

struct CompareView: View {
    let sessions: [Session]
    var body: some View {
        Text("Compare \(sessions.count) sessions").padding()
    }
}
```

- [ ] **Step 3: Update RootView**

```swift
import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Query private var allSessions: [Session]

    var body: some View {
        NavigationSplitView {
            LibraryView().frame(minWidth: 360)
        } detail: {
            let selected = allSessions.filter { app.selectedSessionIDs.contains($0.persistentModelID) }
            switch selected.count {
            case 0:
                EmptyStateView(message: "Select a session to view details.")
            case 1:
                SessionDetailView(session: selected[0])
            case 2...6:
                CompareView(sessions: selected.sorted { $0.startTime < $1.startTime })
            default:
                EmptyStateView(message: "Select at most 6 sessions to compare.")
            }
        }
    }
}
```

- [ ] **Step 4: Build & run. Expected: window opens; library is empty.**

---

## Phase 7 — Chart Theme + Session Detail Panels

### Task 7.1: Chart palette

**Files:** Create `MacPerf/Shared/ChartTheme.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI

enum ChartPalette {
    static let cpu       = Color(red: 0.30, green: 0.55, blue: 0.95)
    static let cpuTemp   = Color(red: 0.95, green: 0.45, blue: 0.30)
    static let memWired  = Color(red: 0.45, green: 0.40, blue: 0.85)
    static let memUsed   = Color(red: 0.55, green: 0.65, blue: 0.95)
    static let memCached = Color(red: 0.70, green: 0.80, blue: 0.95)
    static let memFree   = Color(red: 0.85, green: 0.90, blue: 0.95)
    static let memPress  = Color(red: 0.90, green: 0.30, blue: 0.30)
    static let gpu       = Color(red: 0.30, green: 0.75, blue: 0.50)
    static let gpuMem    = Color(red: 0.50, green: 0.85, blue: 0.65)
    static let gpuTemp   = Color(red: 0.95, green: 0.65, blue: 0.20)
    static let maxTemp   = Color(red: 0.85, green: 0.30, blue: 0.20)
    static let fan       = Color(red: 0.40, green: 0.65, blue: 0.85)

    static let categorical: [Color] = [
        .blue, .orange, .green, .pink, .purple, .teal,
    ]
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 7.2: CPU panel

**Files:** Create `MacPerf/Features/SessionDetail/CPUPanel.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI
import Charts

struct CPUPanel: View {
    let samples: [Sample]
    @Binding var hoverDate: Date?

    var body: some View {
        let utilPoints = downsample(samples.map { ($0.timestamp, $0.cpuUtil) })
        let tempPoints = downsample(samples.map { ($0.timestamp, Double($0.maxCpuTemp)) })

        Chart {
            ForEach(utilPoints, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("CPU %", p.1))
                    .foregroundStyle(ChartPalette.cpu)
                    .interpolationMethod(.linear)
                    .lineStyle(StrokeStyle(lineWidth: 1.2))
            }
            ForEach(tempPoints, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("Temp", p.1))
                    .foregroundStyle(ChartPalette.cpuTemp)
                    .interpolationMethod(.linear)
                    .lineStyle(StrokeStyle(lineWidth: 1.2))
                    .opacity(0.85)
            }
            if let h = hoverDate {
                RuleMark(x: .value("Hover", h))
                    .foregroundStyle(.gray.opacity(0.4))
            }
        }
        .chartYScale(domain: 0...100)
        .chartXAxisLabel("Time")
        .chartYAxisLabel("CPU % / °C")
        .frame(height: 180)
        .padding(.vertical, 4)
    }

    private func downsample(_ pts: [(Date, Double)]) -> [(Date, Double)] {
        Downsampler.bucketAverage(points: pts, targetCount: 5000)
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 7.3: Memory panel

**Files:** Create `MacPerf/Features/SessionDetail/MemoryPanel.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI
import Charts

struct MemoryPanel: View {
    let samples: [Sample]

    var body: some View {
        // Stacked area: order matters bottom→top: wired, used, cached, free
        let series: [(String, Color, [(Date, Double)])] = [
            ("Wired",  ChartPalette.memWired,  samples.map { ($0.timestamp, Fmt.bytesToGB($0.memWired)) }),
            ("Used",   ChartPalette.memUsed,   samples.map { ($0.timestamp, Fmt.bytesToGB($0.memUsed)) }),
            ("Cached", ChartPalette.memCached, samples.map { ($0.timestamp, Fmt.bytesToGB($0.memCached)) }),
            ("Free",   ChartPalette.memFree,   samples.map { ($0.timestamp, Fmt.bytesToGB($0.memFree)) }),
        ]
        let pressure = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, $0.memPressure) }, targetCount: 5000)

        Chart {
            ForEach(series, id: \.0) { name, color, raw in
                let pts = Downsampler.bucketAverage(points: raw, targetCount: 5000)
                ForEach(pts, id: \.0) { p in
                    AreaMark(
                        x: .value("Time", p.0),
                        y: .value("GB", p.1),
                        stacking: .standard
                    )
                    .foregroundStyle(by: .value("Series", name))
                }
            }
            ForEach(pressure, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("Pressure", p.1))
                    .foregroundStyle(ChartPalette.memPress)
                    .lineStyle(StrokeStyle(lineWidth: 1.2))
            }
        }
        .chartForegroundStyleScale([
            "Wired": ChartPalette.memWired,
            "Used":  ChartPalette.memUsed,
            "Cached": ChartPalette.memCached,
            "Free":  ChartPalette.memFree,
        ])
        .frame(height: 180)
        .padding(.vertical, 4)
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 7.4: GPU panel

**Files:** Create `MacPerf/Features/SessionDetail/GPUPanel.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI
import Charts

struct GPUPanel: View {
    let samples: [Sample]

    var body: some View {
        let util = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, $0.gpuUtil) }, targetCount: 5000)
        let mem  = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, Fmt.bytesToMB($0.gpuMemUsed)) }, targetCount: 5000)
        let temp = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, Double($0.maxGpuTemp)) }, targetCount: 5000)

        Chart {
            ForEach(util, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("GPU %", p.1))
                    .foregroundStyle(ChartPalette.gpu)
            }
            ForEach(mem, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("GPU Mem MB", p.1))
                    .foregroundStyle(ChartPalette.gpuMem)
                    .opacity(0.6)
            }
            ForEach(temp, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("GPU Temp", p.1))
                    .foregroundStyle(ChartPalette.gpuTemp)
            }
        }
        .frame(height: 180)
        .padding(.vertical, 4)
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 7.5: Thermal & Fan panel

**Files:** Create `MacPerf/Features/SessionDetail/ThermalPanel.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI
import Charts

struct ThermalPanel: View {
    let samples: [Sample]

    var body: some View {
        let temp = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, Double($0.maxTemp)) }, targetCount: 5000)
        let fan  = Downsampler.bucketAverage(points: samples.map { ($0.timestamp, Double($0.maxFanSpeed)) }, targetCount: 5000)

        Chart {
            ForEach(temp, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("Temp °C", p.1))
                    .foregroundStyle(ChartPalette.maxTemp)
            }
            ForEach(fan, id: \.0) { p in
                LineMark(x: .value("Time", p.0), y: .value("Fan RPM", p.1))
                    .foregroundStyle(ChartPalette.fan)
                    .opacity(0.7)
            }
        }
        .frame(height: 180)
        .padding(.vertical, 4)
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 7.6: Compose `SessionDetailView` with InsightsPanel slot

**Files:**
- Replace: `MacPerf/Features/SessionDetail/SessionDetailView.swift`
- Create: `MacPerf/Features/SessionDetail/InsightsPanel.swift`

- [ ] **Step 1: Stub InsightsPanel**

```swift
import SwiftUI

struct InsightsPanel: View {
    let events: [InsightEvent]
    @Binding var focusedEventID: UUID?

    var body: some View {
        if events.isEmpty {
            Text("No notable events.").foregroundStyle(.secondary).padding()
        } else {
            List(events) { e in
                Button {
                    focusedEventID = e.id
                } label: {
                    EventRow(event: e)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct EventRow: View {
    let event: InsightEvent
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(emoji).font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.headline)
                Text(rangeText).font(.caption).foregroundStyle(.secondary)
                Text(peakText).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var emoji: String {
        switch event.kind {
        case .highCPU: return "🔥"
        case .highGPU: return "🎮"
        case .highMemPressure: return "🧠"
        case .highTemp: return "🌡"
        case .fanPeak: return "💨"
        }
    }
    private var label: String {
        switch event.kind {
        case .highCPU: return "CPU sustained > 80%"
        case .highGPU: return "GPU sustained > 80%"
        case .highMemPressure: return "Memory pressure > 80%"
        case .highTemp: return "Temperature > 90°C"
        case .fanPeak: return "Fan peak"
        }
    }
    private var rangeText: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        let s = f.string(from: event.startTime)
        let e = f.string(from: event.endTime)
        let dur = Fmt.duration(Int(event.duration))
        return event.kind == .fanPeak ? s : "\(s) → \(e)  (\(dur))"
    }
    private var peakText: String {
        switch event.kind {
        case .highCPU, .highGPU, .highMemPressure: return "peak \(Int(event.peakValue))%"
        case .highTemp: return "peak \(Int(event.peakValue))°C"
        case .fanPeak:  return "peak \(Int(event.peakValue)) RPM"
        }
    }
}
```

- [ ] **Step 2: Replace SessionDetailView**

```swift
import SwiftUI

struct SessionDetailView: View {
    let session: Session
    @State private var focusedEventID: UUID?
    @State private var hoverDate: Date?

    private var sortedSamples: [Sample] {
        session.samples.sorted { $0.timestamp < $1.timestamp }
    }

    var body: some View {
        HSplitView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeader("CPU")
                    CPUPanel(samples: sortedSamples, hoverDate: $hoverDate)

                    SectionHeader("Memory")
                    MemoryPanel(samples: sortedSamples)

                    SectionHeader("GPU")
                    GPUPanel(samples: sortedSamples)

                    SectionHeader("Thermal & Fan")
                    ThermalPanel(samples: sortedSamples)
                }
                .padding()
            }
            .frame(minWidth: 540)

            InsightsPanel(events: session.summary.events, focusedEventID: $focusedEventID)
                .frame(minWidth: 280, idealWidth: 320, maxWidth: 400)
        }
        .navigationTitle(session.sourceFilename)
    }
}

private struct SectionHeader: View {
    let title: String
    init(_ t: String) { title = t }
    var body: some View {
        Text(title).font(.headline)
    }
}
```

- [ ] **Step 3: Build & run. Manually verify**: import the fixture via a test or wait for Phase 9 (file watcher). For now, we verify panels compile and use Previews (next step).

- [ ] **Step 4: Add a Preview for SessionDetailView**

  At the bottom of `SessionDetailView.swift`:

```swift
#Preview {
    let schema = Schema([Session.self, Sample.self])
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try! ModelContainer(for: schema, configurations: [config])
    let ctx = ModelContext(container)
    let s = Session(
        sourceFilename: "preview.csv", sourceFileHash: "preview",
        startTime: .now.addingTimeInterval(-3600), endTime: .now, sampleCount: 0
    )
    ctx.insert(s)
    return SessionDetailView(session: s)
        .frame(width: 1100, height: 700)
}
```

  Click the canvas refresh — preview should render the empty layout.

---

## Phase 8 — Compare View

### Task 8.1: Metrics table tab

**Files:** Create `MacPerf/Features/Compare/MetricsTableTab.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI

struct MetricsRow: Identifiable {
    let id: UUID
    let session: Session
}

struct MetricsTableTab: View {
    let sessions: [Session]

    var body: some View {
        let rows = sessions.map { MetricsRow(id: $0.id, session: $0) }

        Table(rows) {
            TableColumn("Session") { row in
                Text(row.session.startTime, format: .dateTime.year().month().day().hour().minute())
            }
            TableColumn("Duration") { row in
                Text(Fmt.duration(row.session.durationSeconds))
            }
            TableColumn("Avg CPU") { row in
                Text(Fmt.percent(row.session.summary.cpuUtil.avg))
            }
            TableColumn("Peak CPU") { row in
                Text(Fmt.percent(row.session.summary.cpuUtil.max))
            }
            TableColumn("CPU >80% time") { row in
                Text(Fmt.duration(row.session.summary.secondsAboveCPU80))
            }
            TableColumn("Avg Temp") { row in
                Text(Fmt.temperature(Int(row.session.summary.maxTemp.avg)))
            }
            TableColumn("Peak Temp") { row in
                Text(Fmt.temperature(Int(row.session.summary.maxTemp.max)))
            }
            TableColumn("Hot >90°C time") { row in
                Text(Fmt.duration(row.session.summary.secondsAboveTemp90))
            }
            TableColumn("Peak Fan") { row in
                Text(Fmt.rpm(Int(row.session.summary.maxFanSpeed.max)))
            }
        }
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 8.2: Overlay charts tab

**Files:** Create `MacPerf/Features/Compare/OverlayChartsTab.swift`

- [ ] **Step 1: Write the file**

```swift
import SwiftUI
import Charts

struct OverlayChartsTab: View {
    let sessions: [Session]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Group {
                    OverlayChart(
                        title: "CPU Utilization (%)",
                        sessions: sessions,
                        valueFor: { Double($0.cpuUtil) },
                        yLabel: "%"
                    )
                    OverlayChart(
                        title: "Max Temperature (°C)",
                        sessions: sessions,
                        valueFor: { Double($0.maxTemp) },
                        yLabel: "°C"
                    )
                    OverlayChart(
                        title: "Memory Pressure (%)",
                        sessions: sessions,
                        valueFor: { Double($0.memPressure) },
                        yLabel: "%"
                    )
                    OverlayChart(
                        title: "Max Fan Speed (RPM)",
                        sessions: sessions,
                        valueFor: { Double($0.maxFanSpeed) },
                        yLabel: "RPM"
                    )
                }
            }
            .padding()
        }
    }
}

private struct OverlayChart: View {
    let title: String
    let sessions: [Session]
    let valueFor: (Sample) -> Double
    let yLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Chart {
                ForEach(Array(sessions.enumerated()), id: \.element.id) { idx, session in
                    let color = ChartPalette.categorical[idx % ChartPalette.categorical.count]
                    let label = formatted(session)
                    let pts = elapsedPoints(of: session)
                    ForEach(pts, id: \.0) { p in
                        LineMark(
                            x: .value("Elapsed", p.0),
                            y: .value(yLabel, p.1)
                        )
                        .foregroundStyle(by: .value("Session", label))
                    }
                }
            }
            .chartForegroundStyleScale(domain: sessions.map(formatted), range: paletteSlice)
            .frame(height: 180)
        }
    }

    private var paletteSlice: [Color] {
        (0..<sessions.count).map { ChartPalette.categorical[$0 % ChartPalette.categorical.count] }
    }

    private func formatted(_ s: Session) -> String {
        let f = DateFormatter()
        f.dateFormat = "MMM d HH:mm"
        return f.string(from: s.startTime)
    }

    private func elapsedPoints(of s: Session) -> [(TimeInterval, Double)] {
        let sorted = s.samples.sorted { $0.timestamp < $1.timestamp }
        guard let first = sorted.first else { return [] }
        let pairs: [(Date, Double)] = sorted.map { ($0.timestamp, valueFor($0)) }
        let down = Downsampler.bucketAverage(points: pairs, targetCount: 5000 / max(sessions.count, 1))
        return down.map { (p) in (p.0.timeIntervalSince(first.timestamp), p.1) }
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 8.3: Compose CompareView

**Files:** Replace `MacPerf/Features/Compare/CompareView.swift`

- [ ] **Step 1: Replace the file**

```swift
import SwiftUI

struct CompareView: View {
    let sessions: [Session]

    var body: some View {
        TabView {
            OverlayChartsTab(sessions: sessions)
                .tabItem { Label("Overlays", systemImage: "waveform.path") }
            MetricsTableTab(sessions: sessions)
                .tabItem { Label("Metrics", systemImage: "tablecells") }
        }
        .padding(.top, 8)
        .navigationTitle("Compare \(sessions.count) sessions")
    }
}
```

- [ ] **Step 2: Build & run. Empty library still — Phase 9 hooks up imports.**

---

## Phase 9 — Folder Watcher, Settings, Auto-Import

### Task 9.1: Bookmark store

**Files:** Create `MacPerf/Services/BookmarkStore.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation
import AppKit

enum BookmarkStore {
    private static let key = "folderBookmark"

    static func save(url: URL) throws {
        let data = try url.bookmarkData(
            options: [.withSecurityScope],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        UserDefaults.standard.set(data, forKey: key)
    }

    static func load() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        var stale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        if stale { return nil }
        guard url.startAccessingSecurityScopedResource() else { return nil }
        return url
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    static func pickFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose folder"
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        return url
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 9.2: Real Settings scene

**Files:** Replace `MacPerf/Features/Settings/SettingsScene.swift`

- [ ] **Step 1: Replace the file**

```swift
import SwiftUI

struct SettingsScene: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        TabView {
            GeneralTab().tabItem { Label("General", systemImage: "gear") }
            AboutTab().tabItem   { Label("About",   systemImage: "info.circle") }
        }
        .frame(width: 520, height: 320)
        .padding()
    }
}

private struct GeneralTab: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        Form {
            Section("Watched Folder") {
                HStack {
                    Text(app.folderPath?.path ?? "Not configured").lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Button("Choose…") {
                        if let url = BookmarkStore.pickFolder() {
                            do {
                                try BookmarkStore.save(url: url)
                                app.folderPath = url
                            } catch {
                                app.lastImportError = "Could not save bookmark: \(error.localizedDescription)"
                            }
                        }
                    }
                    Button("Reset") {
                        BookmarkStore.clear()
                        app.folderPath = nil
                    }
                }
                Text("MacPerf will auto-import any new CSV files iStatistica Pro writes here.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct AboutTab: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("MacPerf").font(.title)
            Text("Version 1.0").foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 9.3: Folder watcher (FSEvents wrapper)

**Files:** Create `MacPerf/Services/FolderWatcher.swift`

- [ ] **Step 1: Write the file**

```swift
import Foundation
import CoreServices

final class FolderWatcher {
    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "macperf.folderwatcher")

    var onEvent: ((URL) -> Void)?

    func start(at url: URL) {
        stop()
        let path = url.path as CFString
        let paths = [path] as CFArray

        var ctx = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil, release: nil, copyDescription: nil
        )

        guard let s = FSEventStreamCreate(
            kCFAllocatorDefault,
            { _, info, count, paths, flags, _ in
                guard let info = info else { return }
                let me = Unmanaged<FolderWatcher>.fromOpaque(info).takeUnretainedValue()
                let pathsArr = unsafeBitCast(paths, to: NSArray.self) as! [String]
                for p in pathsArr {
                    let u = URL(fileURLWithPath: p)
                    if u.pathExtension.lowercased() == "csv" {
                        me.onEvent?(u)
                    }
                }
            },
            &ctx,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0,    // latency
            FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)
        ) else {
            return
        }

        FSEventStreamSetDispatchQueue(s, queue)
        FSEventStreamStart(s)
        self.stream = s
    }

    func stop() {
        if let s = stream {
            FSEventStreamStop(s)
            FSEventStreamInvalidate(s)
            FSEventStreamRelease(s)
            stream = nil
        }
    }

    deinit { stop() }
}
```

- [ ] **Step 2: Build. Expected: success.**

### Task 9.4: Auto-import pipeline

**Files:**
- Create: `MacPerf/Services/ImportCoordinator.swift`
- Modify: `MacPerf/App/MacPerfApp.swift`
- Modify: `MacPerf/Shared/AppModel.swift`

- [ ] **Step 1: Create ImportCoordinator**

```swift
import Foundation
import SwiftData

@MainActor
final class ImportCoordinator {
    let watcher = FolderWatcher()
    private var debounce: [String: Task<Void, Never>] = [:]
    private weak var app: AppModel?
    private let container: ModelContainer

    init(app: AppModel, container: ModelContainer) {
        self.app = app
        self.container = container
        watcher.onEvent = { [weak self] url in
            Task { @MainActor in self?.scheduleImport(of: url) }
        }
    }

    func start() {
        guard let url = app?.folderPath else { return }
        // Full-scan for files we missed while not running.
        if let entries = try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) {
            for f in entries where f.pathExtension.lowercased() == "csv" {
                scheduleImport(of: f, debounceSeconds: 0)
            }
        }
        watcher.start(at: url)
    }

    func stop() {
        watcher.stop()
    }

    /// Wait until the file's mtime is stable for ~2s before importing
    /// (iStatistica might still be writing).
    private func scheduleImport(of url: URL, debounceSeconds: Double = 2.0) {
        let key = url.path
        debounce[key]?.cancel()
        debounce[key] = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(debounceSeconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.runImport(url: url)
            await MainActor.run { self?.debounce.removeValue(forKey: key) }
        }
    }

    private func runImport(url: URL) async {
        let context = ModelContext(container)
        do {
            let session = try CSVImporter.importFile(at: url, into: context)
            try context.save()
            app?.lastImportToast = "Imported \(session.sourceFilename) (\(session.sampleCount) samples)"
        } catch CSVImportError.duplicate {
            // silent skip
        } catch {
            app?.lastImportError = error.localizedDescription
        }
    }
}
```

- [ ] **Step 2: Add coordinator hook to AppModel**

  Replace `MacPerf/Shared/AppModel.swift`:

```swift
import Foundation
import SwiftUI
import SwiftData

@Observable
final class AppModel {
    var folderPath: URL?
    var selectedSessionIDs: Set<PersistentIdentifier> = []
    var lastImportToast: String?
    var lastImportError: String?

    init() {
        self.folderPath = BookmarkStore.load()
    }
}
```

- [ ] **Step 3: Wire ImportCoordinator into the app**

  Replace `MacPerf/App/MacPerfApp.swift`:

```swift
import SwiftUI
import SwiftData

@main
struct MacPerfApp: App {
    @State private var appModel = AppModel()
    private let container: ModelContainer = {
        let schema = Schema([Session.self, Sample.self])
        return try! ModelContainer(for: schema)
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .task(id: appModel.folderPath) {
                    let coord = ImportCoordinator(app: appModel, container: container)
                    coord.start()
                    defer { coord.stop() }
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 1_000_000_000)
                    }
                }
        }
        .modelContainer(container)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }

        Settings {
            SettingsScene()
                .environment(appModel)
        }
        .modelContainer(container)
    }
}
```

- [ ] **Step 4: Build & run. Open Settings → Choose the `mac status/` folder. The fixture CSV should auto-import. Click it in the library → SessionDetailView shows charts.**

  Manual verification checklist:
  - Settings → Choose folder → pick `/Users/zzh/Visual Studio Code/mac status/`
  - Library populates with 1 session
  - Click row → 4 chart panels render with data
  - InsightsPanel shows real events (the fixture has periods of high CPU and high temp)

### Task 9.5: Import toast

**Files:**
- Create: `MacPerf/Features/Common/ImportToast.swift`
- Modify: `MacPerf/App/RootView.swift`

- [ ] **Step 1: Toast view**

```swift
import SwiftUI

struct ImportToast: View {
    let message: String
    var body: some View {
        Text(message)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            .shadow(radius: 6)
    }
}
```

- [ ] **Step 2: Show toast in RootView**

  Replace `RootView.swift`:

```swift
import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Query private var allSessions: [Session]
    @State private var toastVisible = false

    var body: some View {
        @Bindable var app = app
        ZStack(alignment: .bottomTrailing) {
            NavigationSplitView {
                LibraryView().frame(minWidth: 360)
            } detail: {
                let selected = allSessions.filter { app.selectedSessionIDs.contains($0.persistentModelID) }
                switch selected.count {
                case 0:
                    EmptyStateView(message: "Select a session to view details.")
                case 1:
                    SessionDetailView(session: selected[0])
                case 2...6:
                    CompareView(sessions: selected.sorted { $0.startTime < $1.startTime })
                default:
                    EmptyStateView(message: "Select at most 6 sessions to compare.")
                }
            }

            if toastVisible, let msg = app.lastImportToast {
                ImportToast(message: msg)
                    .padding(20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: app.lastImportToast) { _, newValue in
            guard newValue != nil else { return }
            withAnimation { toastVisible = true }
            Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                withAnimation { toastVisible = false; app.lastImportToast = nil }
            }
        }
    }
}
```

- [ ] **Step 3: Build & run. Move a CSV into the watched folder and watch the toast appear.**

---

## Phase 10 — Polish

### Task 10.1: Empty state guidance + error banner

**Files:** Modify `MacPerf/Features/Library/LibraryView.swift`

- [ ] **Step 1: Show clearer guidance when no folder configured**

  Replace the `if sessions.isEmpty { ... }` branch:

```swift
            if sessions.isEmpty {
                if app.folderPath == nil {
                    EmptyStateView(message: "Choose a watched folder in Settings (⌘,)")
                } else {
                    EmptyStateView(message: "Watching \(app.folderPath!.lastPathComponent)…\nWaiting for iStatistica Pro to write a CSV.")
                }
            } else {
```

- [ ] **Step 2: Build. Expected: success.**

### Task 10.2: Error banner

**Files:** Modify `MacPerf/App/RootView.swift`

- [ ] **Step 1: Replace `RootView.swift` body with banner + ZStack**

  Replace the entire `body` property of `RootView` with this version:

```swift
    var body: some View {
        @Bindable var app = app
        VStack(spacing: 0) {
            if let err = app.lastImportError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text(err).lineLimit(2)
                    Spacer()
                    Button("Dismiss") { app.lastImportError = nil }
                }
                .padding(8)
                .background(Color.yellow.opacity(0.2))
            }

            ZStack(alignment: .bottomTrailing) {
                NavigationSplitView {
                    LibraryView().frame(minWidth: 360)
                } detail: {
                    let selected = allSessions.filter { app.selectedSessionIDs.contains($0.persistentModelID) }
                    switch selected.count {
                    case 0:
                        EmptyStateView(message: "Select a session to view details.")
                    case 1:
                        SessionDetailView(session: selected[0])
                    case 2...6:
                        CompareView(sessions: selected.sorted { $0.startTime < $1.startTime })
                    default:
                        EmptyStateView(message: "Select at most 6 sessions to compare.")
                    }
                }

                if toastVisible, let msg = app.lastImportToast {
                    ImportToast(message: msg)
                        .padding(20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .onChange(of: app.lastImportToast) { _, newValue in
            guard newValue != nil else { return }
            withAnimation { toastVisible = true }
            Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                withAnimation { toastVisible = false; app.lastImportToast = nil }
            }
        }
    }
```

- [ ] **Step 2: Build & run. Trigger an error (e.g. drop a malformed CSV in the folder) → banner appears.**

### Task 10.3: Keyboard / menu commands

**Files:** Modify `MacPerf/App/MacPerfApp.swift`

- [ ] **Step 1: Add a "Rescan Folder" menu item**

  Inside the `.commands { … }` of the WindowGroup:

```swift
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .toolbar) {
                Button("Rescan Folder") {
                    NotificationCenter.default.post(name: .rescanFolder, object: nil)
                }
                .keyboardShortcut("R", modifiers: [.command, .shift])
            }
        }
```

- [ ] **Step 2: Add notification name + listener**

  At the bottom of `MacPerfApp.swift`:

```swift
extension Notification.Name {
    static let rescanFolder = Notification.Name("rescanFolder")
}
```

  In `ImportCoordinator.start()`, register the observer:

```swift
        NotificationCenter.default.addObserver(forName: .rescanFolder, object: nil, queue: .main) { [weak self] _ in
            guard let self, let url = self.app?.folderPath else { return }
            if let entries = try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) {
                for f in entries where f.pathExtension.lowercased() == "csv" {
                    self.scheduleImport(of: f, debounceSeconds: 0)
                }
            }
        }
```

- [ ] **Step 3: Build & run. Use ⇧⌘R to trigger a rescan.**

### Task 10.4: Final test sweep

- [ ] **Step 1: Run all unit tests (⌘U). Expected: all pass.**

- [ ] **Step 2: Manual smoke test**
  1. Cold launch with no folder configured → empty state guides to Settings
  2. Choose `mac status/` folder → fixture imports, toast appears
  3. Click session → 4 panels render, InsightsPanel lists events
  4. Click an event → (focus state set; visual highlight is a future enhancement — the binding plumbing is in place)
  5. Multi-select 2 sessions → CompareView shows overlay + table tabs
  6. Drop a malformed CSV → error banner appears
  7. Use ⌘, to open Settings, ⇧⌘R to trigger rescan

- [ ] **Step 3: If git was initialized, commit final state**

```bash
git add -A
git commit -m "feat: complete MacPerf v1"
```

---

## Open Items (deferred from spec §8)

These are explicitly out of scope for v1; revisit if the user requests:
- Linking InsightsPanel event clicks to actual chart zoom/highlight (the `focusedEventID` binding exists but is not consumed by the chart panels — would require lifting that state up and adding `RuleMark`/`RectangleMark` annotations in each panel)
- Synced cross-panel hover cursor (the `hoverDate` binding exists in `CPUPanel` only)
- Configurable thresholds in Settings
- Hardcoded default to iStatistica Pro export path (currently the user picks first-time)
- Index on `Sample.timestamp` if charts get sluggish at scale (already declared but worth profiling)

---

## Self-Review Notes

This plan covers spec §1–§7 directly. The two known gaps surfaced as Open Items above (synced cursor + event-to-chart navigation) are placeholders that exist in the data flow (`hoverDate`, `focusedEventID` bindings) but aren't fully wired through every panel — left as a v1.1 enhancement to keep the bite-sized plan from ballooning.
