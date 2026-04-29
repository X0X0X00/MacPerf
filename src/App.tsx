import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  deleteSession,
  getConfig,
  getOverview,
  listSessions,
} from "./lib/api";
import { AppConfig, Overview, Session } from "./lib/types";
import { Library } from "./views/Library";
import { SessionDetail } from "./views/SessionDetail";
import { Compare } from "./views/Compare";
import { Settings } from "./views/Settings";
import { OverviewBar } from "./components/OverviewBar";
import "./styles.css";

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const searchFocusRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    try {
      const [list, ov] = await Promise.all([listSessions(), getOverview()]);
      setSessions(list);
      setOverview(ov);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await getConfig();
      setConfig(cfg);
      if (!cfg.watched_folder) {
        setShowSettings(true);
      }
      reload();
    })();
  }, [reload]);

  // Listen for backend events
  useEffect(() => {
    const unlistens: Array<() => void> = [];
    listen<number>("session-imported", (event) => {
      reload();
      setImporting(null);
      const id = event.payload;
      setToast(`已导入新记录 #${id}`);
    }).then((u) => unlistens.push(u));
    listen<string>("import-error", (event) => {
      setImporting(null);
      setError(event.payload);
    }).then((u) => unlistens.push(u));
    listen<string>("import-started", (event) => {
      setImporting(event.payload);
    }).then((u) => unlistens.push(u));
    return () => {
      unlistens.forEach((u) => u());
    };
  }, [reload]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
      } else if (cmd && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchFocusRef.current?.();
      } else if (cmd && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowOverview((v) => !v);
      } else if (e.key === "Escape") {
        setShowSettings(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSelect = (id: number, multi: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSession(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const selectedSessions = useMemo(
    () => sessions.filter((s) => selectedIds.has(s.id)),
    [sessions, selectedIds]
  );

  let detail;
  if (selectedSessions.length === 0) {
    detail = (
      <div className="empty">
        <div className="empty-icon">📊</div>
        <div className="empty-msg">选择左侧一条记录查看分析</div>
        <div className="empty-sub">⌘ + 单击多选可以做对比 · ⌘F 搜索 · ⌘, 设置</div>
      </div>
    );
  } else if (selectedSessions.length === 1) {
    detail = <SessionDetail session={selectedSessions[0]} />;
  } else if (selectedSessions.length <= 6) {
    detail = (
      <Compare
        sessions={[...selectedSessions].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )}
      />
    );
  } else {
    detail = (
      <div className="empty">
        <div className="empty-icon">⚠️</div>
        <div className="empty-msg">最多选择 6 条进行对比</div>
        <div className="empty-sub">当前选了 {selectedSessions.length} 条</div>
      </div>
    );
  }

  const onJumpToSession = (id: number) => {
    setSelectedIds(new Set([id]));
  };

  if (!config) return null; // wait for config to load before rendering anything

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-title">MacPerf</div>
        <button
          className="topbar-btn-ghost"
          onClick={() => setShowOverview((v) => !v)}
          title="切换全局摘要 (⌘K)"
        >
          {showOverview ? "▲ 摘要" : "▼ 摘要"}
        </button>
        <div className="topbar-spacer" />
        <div className="topbar-meta">
          {importing ? (
            <span style={{ color: "var(--accent)" }}>⟳ 正在解析 {importing}…</span>
          ) : config.watched_folder ? (
            <span title={config.watched_folder}>
              👀 {shortPath(config.watched_folder)} · {sessions.length} 条记录
            </span>
          ) : (
            <span style={{ color: "#94a3b8" }}>未配置文件夹</span>
          )}
        </div>
        <button className="topbar-btn" onClick={() => setShowSettings(true)} title="⌘,">
          ⚙️ 设置
        </button>
      </div>

      {showOverview && <OverviewBar overview={overview} onJump={onJumpToSession} />}

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="main">
        <aside className="sidebar">
          <Library
            sessions={sessions}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onDelete={handleDelete}
          />
        </aside>
        <main className="content">{detail}</main>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showSettings && (
        <Settings
          config={config}
          onClose={() => setShowSettings(false)}
          onUpdated={(cfg) => {
            setConfig(cfg);
            reload();
          }}
        />
      )}
    </div>
  );
}

function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}

export default App;
