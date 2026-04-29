import { useMemo, useState } from "react";
import { Session } from "../lib/types";
import { fmtDateTime, fmtDuration, fmtPct, fmtRPM, fmtTemp } from "../lib/format";
import { Sparkline } from "../components/Sparkline";

interface Props {
  sessions: Session[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number, multi: boolean) => void;
  onDelete: (id: number) => void;
}

type SortKey = "start_time" | "duration_seconds" | "cpu_max" | "temp_max" | "fan_max";
type SortDir = "asc" | "desc";

export function Library({ sessions, selectedIds, onToggleSelect, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("start_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const filtered = query.trim()
      ? sessions.filter((s) => {
          const q = query.trim().toLowerCase();
          return (
            s.source_filename.toLowerCase().includes(q) ||
            fmtDateTime(s.start_time).toLowerCase().includes(q) ||
            (s.summary.tags ?? []).some((t) => t.toLowerCase().includes(q))
          );
        })
      : sessions;
    const valueOf = (s: Session) => {
      switch (sortKey) {
        case "start_time": return new Date(s.start_time).getTime();
        case "duration_seconds": return s.duration_seconds;
        case "cpu_max": return s.summary.cpu_util.max;
        case "temp_max": return s.summary.max_temp.max;
        case "fan_max": return s.summary.max_fan_speed.max;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      const d = va - vb;
      return sortDir === "asc" ? d : -d;
    });
  }, [sessions, query, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const sortIndicator = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (sessions.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📭</div>
        <div className="empty-msg">还没有任何记录</div>
        <div className="empty-sub">在右上角设置里选择 iStatistica Pro 导出文件夹</div>
      </div>
    );
  }

  return (
    <div className="library">
      <div className="library-search">
        <input
          type="text"
          placeholder="搜索文件名 / 时间 / 标签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="clear-btn" onClick={() => setQuery("")}>×</button>}
      </div>
      <div className="library-head">
        <div className="library-row library-row-head">
          <div className="col-time" onClick={() => toggleSort("start_time")}>开始时间{sortIndicator("start_time")}</div>
          <div className="col-spark">Trend</div>
          <div className="col-dur" onClick={() => toggleSort("duration_seconds")}>时长{sortIndicator("duration_seconds")}</div>
          <div className="col-num" onClick={() => toggleSort("cpu_max")}>CPU{sortIndicator("cpu_max")}</div>
          <div className="col-num" onClick={() => toggleSort("temp_max")}>温度{sortIndicator("temp_max")}</div>
          <div className="col-num" onClick={() => toggleSort("fan_max")}>风扇{sortIndicator("fan_max")}</div>
        </div>
      </div>
      <div className="library-body">
        {sorted.map((s) => {
          const selected = selectedIds.has(s.id);
          const tags = s.summary.tags ?? [];
          return (
            <div
              key={s.id}
              className={`library-row ${selected ? "selected" : ""}`}
              onClick={(e) => onToggleSelect(s.id, e.metaKey || e.shiftKey)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`删除这条记录？\n${s.source_filename}`)) {
                  onDelete(s.id);
                }
              }}
              title={s.source_filename}
            >
              <div className="col-time">
                <div>{fmtDateTime(s.start_time)}</div>
                {tags.length > 0 && (
                  <div className="tag-row">
                    {tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
                )}
              </div>
              <div className="col-spark"><Sparkline sessionId={s.id} /></div>
              <div className="col-dur">{fmtDuration(s.duration_seconds)}</div>
              <div className="col-num">{fmtPct(s.summary.cpu_util.max)}</div>
              <div className="col-num">{fmtTemp(s.summary.max_temp.max)}</div>
              <div className="col-num">{fmtRPM(s.summary.max_fan_speed.max)}</div>
            </div>
          );
        })}
      </div>
      <div className="library-footer">
        {sorted.length === sessions.length
          ? `${sessions.length} 条记录`
          : `${sorted.length} / ${sessions.length} 条`}
      </div>
    </div>
  );
}
