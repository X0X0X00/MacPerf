import { InsightEvent, InsightKind } from "../lib/types";
import { fmtDuration, fmtTime } from "../lib/format";
import { eventKey } from "./Charts";

const META: Record<InsightKind, { emoji: string; label: string; unit: (v: number) => string }> = {
  highCpu: { emoji: "🔥", label: "CPU 持续过高", unit: (v) => `peak ${Math.round(v)}%` },
  highGpu: { emoji: "🎮", label: "GPU 持续过高", unit: (v) => `peak ${Math.round(v)}%` },
  highMemPressure: { emoji: "🧠", label: "内存压力过高", unit: (v) => `peak ${Math.round(v)}%` },
  highTemp: { emoji: "🌡️", label: "温度过高", unit: (v) => `peak ${Math.round(v)}°C` },
  fanPeak: { emoji: "💨", label: "风扇峰值", unit: (v) => `peak ${Math.round(v).toLocaleString()} RPM` },
};

interface Props {
  events: InsightEvent[];
  focusedEventId?: string | null;
  onSelect?: (e: InsightEvent) => void;
}

export function InsightsPanel({ events, focusedEventId, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <div className="insights">
        <h3>洞察</h3>
        <div className="insights-empty">没有检测到异常事件 ✨</div>
      </div>
    );
  }
  return (
    <div className="insights">
      <h3>洞察 ({events.length})</h3>
      <div className="insights-list">
        {events.map((e) => {
          const meta = META[e.kind];
          const start = fmtTime(e.start_time);
          const end = fmtTime(e.end_time);
          const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000;
          const isPoint = e.kind === "fanPeak";
          const id = eventKey(e);
          const focused = focusedEventId === id;
          return (
            <button
              key={id}
              className={`insight-item ${focused ? "focused" : ""}`}
              onClick={() => onSelect?.(e)}
            >
              <div className="insight-emoji">{meta.emoji}</div>
              <div className="insight-body">
                <div className="insight-label">{meta.label}</div>
                <div className="insight-range">
                  {isPoint ? start : `${start} → ${end} · ${fmtDuration(Math.round(dur))}`}
                </div>
                <div className="insight-peak">{meta.unit(e.peak_value)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
