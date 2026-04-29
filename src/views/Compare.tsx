import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Session, Sample } from "../lib/types";
import { getSamples } from "../lib/api";
import {
  fmtDateTime,
  fmtDuration,
  fmtPct,
  fmtRPM,
  fmtTemp,
} from "../lib/format";
interface Props {
  sessions: Session[];
}

const PALETTE = ["#5b8def", "#f4754d", "#4cc28a", "#e75c5c", "#a78bfa", "#22d3ee"];

const METRICS: {
  key: keyof Sample;
  title: string;
  unit: string;
  cap?: number;
}[] = [
  { key: "cpu_util", title: "CPU 利用率", unit: "%", cap: 100 },
  { key: "max_temp", title: "最高温度", unit: "°C" },
  { key: "mem_pressure", title: "内存压力", unit: "%", cap: 100 },
  { key: "max_fan_speed", title: "风扇转速", unit: "RPM" },
];

interface ChartRow {
  elapsed: number; // seconds since session start
  [seriesName: string]: number;
}

export function Compare({ sessions }: Props) {
  const [samplesByID, setSamplesByID] = useState<Record<number, Sample[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overlay" | "table">("overlay");

  useEffect(() => {
    setLoading(true);
    Promise.all(sessions.map((s) => getSamples(s.id).then((d) => [s.id, d] as const)))
      .then((pairs) => {
        const map: Record<number, Sample[]> = {};
        for (const [id, samples] of pairs) map[id] = samples;
        setSamplesByID(map);
      })
      .finally(() => setLoading(false));
  }, [sessions]);

  return (
    <div className="compare">
      <div className="compare-header">
        <h2>对比 {sessions.length} 条记录</h2>
        <div className="compare-tabs">
          <button className={tab === "overlay" ? "active" : ""} onClick={() => setTab("overlay")}>
            叠加图
          </button>
          <button className={tab === "table" ? "active" : ""} onClick={() => setTab("table")}>
            指标对比
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">加载采样数据中…</div>
      ) : tab === "overlay" ? (
        <OverlayCharts sessions={sessions} samplesByID={samplesByID} />
      ) : (
        <MetricsTable sessions={sessions} />
      )}
    </div>
  );
}

function OverlayCharts({
  sessions,
  samplesByID,
}: {
  sessions: Session[];
  samplesByID: Record<number, Sample[]>;
}) {
  return (
    <div className="overlay-charts">
      {METRICS.map((m) => {
        const merged = mergeBySession(sessions, samplesByID, m.key, m.cap);
        return (
          <div key={String(m.key)} className="chart-block">
            <div className="chart-title">{m.title} ({m.unit})</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={merged.data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#e5eaf3" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="elapsed"
                  type="number"
                  domain={[0, "dataMax"]}
                  tickFormatter={(v) => fmtDuration(Math.round(v as number))}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  stroke="#cbd5e1"
                />
                <YAxis
                  domain={m.cap ? [0, m.cap] : ["auto", "auto"]}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  stroke="#cbd5e1"
                  width={48}
                />
                <Tooltip
                  labelFormatter={(v) => `经过 ${fmtDuration(Math.round(v as number))}`}
                  contentStyle={{ background: "#ffffff", border: "1px solid #d9e0ec", borderRadius: 6, boxShadow: "0 4px 14px rgba(15,23,42,0.08)" }}
                  labelStyle={{ color: "#1f2937", fontWeight: 600 }}
                  itemStyle={{ fontSize: 12 }}
                  formatter={(v: number) => `${(v as number).toFixed(1)} ${m.unit}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {merged.seriesNames.map((name, idx) => (
                  <Line
                    key={name}
                    dataKey={name}
                    name={name}
                    stroke={PALETTE[idx % PALETTE.length]}
                    strokeWidth={1.4}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function mergeBySession(
  sessions: Session[],
  samplesByID: Record<number, Sample[]>,
  key: keyof Sample,
  cap?: number
): { data: ChartRow[]; seriesNames: string[] } {
  // Each session: convert (timestamp, value) into (elapsed_seconds, value)
  // Then bucket-merge into a shared grid of elapsed seconds.
  const seriesNames: string[] = [];
  const tracks: Record<string, [number, number][]> = {};
  for (const s of sessions) {
    const samples = samplesByID[s.id] || [];
    if (samples.length === 0) continue;
    const startMs = new Date(s.start_time).getTime();
    const name = fmtDateTime(s.start_time);
    seriesNames.push(name);
    const pts: [number, number][] = samples.map((sm) => {
      const elapsed = (new Date(sm.timestamp).getTime() - startMs) / 1000;
      let v = sm[key] as number;
      if (cap) v = Math.min(v, cap);
      return [elapsed, v];
    });
    // Downsample to ~1500 points each
    tracks[name] = bucketTimeSeries(pts, 1500);
  }

  // Build a sorted union of elapsed buckets and merge values
  const allElapsed = new Set<number>();
  for (const name of seriesNames) {
    for (const [t] of tracks[name]) allElapsed.add(t);
  }
  const sortedTimes = Array.from(allElapsed).sort((a, b) => a - b);

  // For each series, build a quick map for lookup
  const lookups: Record<string, Map<number, number>> = {};
  for (const name of seriesNames) {
    lookups[name] = new Map(tracks[name]);
  }

  const data: ChartRow[] = sortedTimes.map((t) => {
    const row: ChartRow = { elapsed: t };
    for (const name of seriesNames) {
      const v = lookups[name].get(t);
      if (v !== undefined) row[name] = v;
    }
    return row;
  });
  return { data, seriesNames };
}

function bucketTimeSeries(pts: [number, number][], target: number): [number, number][] {
  if (pts.length <= target || pts.length === 0) return pts;
  const first = pts[0][0];
  const last = pts[pts.length - 1][0];
  const total = last - first;
  if (total <= 0) return pts;
  const w = total / target;
  const buckets: [number, number][][] = Array.from({ length: target }, () => []);
  for (const p of pts) {
    let idx = Math.floor((p[0] - first) / w);
    if (idx >= target) idx = target - 1;
    if (idx < 0) idx = 0;
    buckets[idx].push(p);
  }
  const out: [number, number][] = [];
  for (let i = 0; i < target; i++) {
    const b = buckets[i];
    if (!b.length) continue;
    const tMid = first + (i + 0.5) * w;
    const avg = b.reduce((a, [_, v]) => a + v, 0) / b.length;
    out.push([Math.round(tMid), avg]);
  }
  return out;
}

function MetricsTable({ sessions }: { sessions: Session[] }) {
  type Col = {
    label: string;
    get: (s: Session) => string;
    num?: (s: Session) => number;
    deltaUnit?: (delta: number) => string;
  };
  const cols: Col[] = [
    { label: "开始", get: (s) => fmtDateTime(s.start_time) },
    {
      label: "时长",
      get: (s) => fmtDuration(s.duration_seconds),
      num: (s) => s.duration_seconds,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${fmtDuration(Math.abs(Math.round(d))).replace(/^/, d < 0 ? "-" : "")}`,
    },
    {
      label: "Avg CPU",
      get: (s) => fmtPct(s.summary.cpu_util.avg),
      num: (s) => s.summary.cpu_util.avg,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}%`,
    },
    {
      label: "Peak CPU",
      get: (s) => fmtPct(s.summary.cpu_util.max),
      num: (s) => s.summary.cpu_util.max,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}%`,
    },
    {
      label: "CPU >80% 时长",
      get: (s) => fmtDuration(s.summary.seconds_above_cpu80),
      num: (s) => s.summary.seconds_above_cpu80,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d}s`,
    },
    {
      label: "Avg Temp",
      get: (s) => fmtTemp(s.summary.max_temp.avg),
      num: (s) => s.summary.max_temp.avg,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}°C`,
    },
    {
      label: "Peak Temp",
      get: (s) => fmtTemp(s.summary.max_temp.max),
      num: (s) => s.summary.max_temp.max,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d.toFixed(0)}°C`,
    },
    {
      label: "过热(>90°) 时长",
      get: (s) => fmtDuration(s.summary.seconds_above_temp90),
      num: (s) => s.summary.seconds_above_temp90,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${d}s`,
    },
    {
      label: "Peak Fan",
      get: (s) => fmtRPM(s.summary.max_fan_speed.max),
      num: (s) => s.summary.max_fan_speed.max,
      deltaUnit: (d) => `${d > 0 ? "+" : ""}${Math.round(d).toLocaleString()} RPM`,
    },
  ];

  // Show diff column only when exactly 2 sessions
  const showDiff = sessions.length === 2;
  const a = sessions[0];
  const b = sessions[1];

  return (
    <div className="metrics-table">
      <table>
        <thead>
          <tr>
            <th>指标</th>
            {sessions.map((s) => <th key={s.id}>{fmtDateTime(s.start_time)}</th>)}
            {showDiff && <th>Δ (B − A)</th>}
          </tr>
        </thead>
        <tbody>
          {cols.slice(1).map((c) => (
            <tr key={c.label}>
              <td className="row-label">{c.label}</td>
              {sessions.map((s) => <td key={s.id}>{c.get(s)}</td>)}
              {showDiff && c.num && c.deltaUnit && (() => {
                const delta = c.num(b) - c.num(a);
                const sign = delta === 0 ? "zero" : delta > 0 ? "pos" : "neg";
                return (
                  <td className={`delta delta-${sign}`}>
                    {c.deltaUnit(delta)}
                  </td>
                );
              })()}
              {showDiff && !c.num && <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
