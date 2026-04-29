import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import { InsightEvent, InsightKind, Sample } from "../lib/types";
import { bytesToGB, bytesToMB } from "../lib/format";
import { downsample } from "../lib/downsample";

const TARGET_POINTS = 4000;
const SYNC_ID = "session-detail";

function tickTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function tooltipTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #d9e0ec",
  borderRadius: 6,
  boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
};
const TICK_FILL = { fontSize: 11, fill: "#64748b" };
const AXIS_STROKE = "#cbd5e1";
const GRID_STROKE = "#e5eaf3";

interface PanelProps {
  samples: Sample[];
  events?: InsightEvent[];
  focusedEventId?: string | null;
  showBrush?: boolean;
}

function eventColor(kind: InsightKind, focused: boolean): string {
  const op = focused ? 0.34 : 0.13;
  switch (kind) {
    case "highCpu": return `rgba(244, 117, 77, ${op})`;
    case "highGpu": return `rgba(76, 194, 138, ${op})`;
    case "highMemPressure": return `rgba(231, 92, 92, ${op})`;
    case "highTemp": return `rgba(217, 74, 58, ${op})`;
    case "fanPeak": return `rgba(95, 168, 211, ${op})`;
  }
}

function relevantEvents(events: InsightEvent[] | undefined, kinds: InsightKind[]): InsightEvent[] {
  if (!events) return [];
  return events.filter((e) => kinds.includes(e.kind));
}

function eventKey(e: InsightEvent): string {
  return `${e.kind}-${e.start_time}-${e.end_time}`;
}

function ReferenceAreas({ events, focusedEventId }: { events: InsightEvent[]; focusedEventId?: string | null }) {
  return (
    <>
      {events.map((e) => {
        const id = eventKey(e);
        const isPoint = e.start_time === e.end_time;
        const focused = focusedEventId === id;
        return (
          <ReferenceArea
            key={id}
            x1={e.start_time}
            x2={isPoint
              // Give point events a hairline so they're at least visible
              ? new Date(new Date(e.start_time).getTime() + 1000).toISOString()
              : e.end_time}
            yAxisId="L"
            fill={eventColor(e.kind, focused)}
            stroke={focused ? "rgba(15,23,42,0.35)" : "transparent"}
            strokeWidth={focused ? 1 : 0}
          />
        );
      })}
    </>
  );
}

export function CPUPanel({ samples, events, focusedEventId, showBrush }: PanelProps) {
  const data = useMemo(
    () => downsample(samples, ["cpu_util", "max_cpu_temp"] as any, TARGET_POINTS),
    [samples]
  );
  const evts = relevantEvents(events, ["highCpu"]);
  return (
    <ResponsiveContainer width="100%" height={showBrush ? 240 : 200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }} syncId={SYNC_ID}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={TICK_FILL} stroke={AXIS_STROKE} />
        <YAxis yAxisId="L" domain={[0, 100]} tick={TICK_FILL} stroke={AXIS_STROKE} width={36} />
        <YAxis yAxisId="R" orientation="right" domain={[0, 110]} tick={TICK_FILL} stroke={AXIS_STROKE} width={36} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
          formatter={(v: number, name: string) => name === "CPU %" ? `${v.toFixed(1)}%` : `${Math.round(v)}°C`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceAreas events={evts} focusedEventId={focusedEventId} />
        <Line yAxisId="L" dataKey="cpu_util" name="CPU %" stroke="#5b8def" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="max_cpu_temp" name="CPU 温度 °C" stroke="#f4754d" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        {showBrush && <Brush dataKey="timestamp" height={20} stroke="#3b6df0" tickFormatter={tickTime} travellerWidth={8} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MemoryPanel({ samples, events, focusedEventId }: PanelProps) {
  const data = useMemo(
    () => downsample(
      samples.map((s) => ({
        timestamp: s.timestamp,
        wired: bytesToGB(s.mem_wired),
        used: bytesToGB(s.mem_used),
        cached: bytesToGB(s.mem_cached),
        free: bytesToGB(s.mem_free),
        pressure: s.mem_pressure,
      })),
      ["wired", "used", "cached", "free", "pressure"] as any,
      TARGET_POINTS
    ),
    [samples]
  );
  const evts = relevantEvents(events, ["highMemPressure"]);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }} syncId={SYNC_ID}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={TICK_FILL} stroke={AXIS_STROKE} />
        <YAxis yAxisId="L" tick={TICK_FILL} stroke={AXIS_STROKE} width={36} unit=" GB" />
        <YAxis yAxisId="R" orientation="right" domain={[0, 100]} tick={TICK_FILL} stroke={AXIS_STROKE} width={36} unit="%" />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
          formatter={(v: number, name: string) => name === "压力" ? `${Math.round(v)}%` : `${(v as number).toFixed(2)} GB`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceAreas events={evts} focusedEventId={focusedEventId} />
        <Area yAxisId="L" type="monotone" dataKey="wired" name="Wired" stackId="1" stroke="#7568d6" fill="#7568d6" fillOpacity={0.7} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="used" name="Used" stackId="1" stroke="#8aa6f4" fill="#8aa6f4" fillOpacity={0.7} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="cached" name="Cached" stackId="1" stroke="#b3c7f1" fill="#b3c7f1" fillOpacity={0.6} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="free" name="Free" stackId="1" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.6} isAnimationActive={false} />
        <Line yAxisId="R" type="monotone" dataKey="pressure" name="压力" stroke="#e75c5c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GPUPanel({ samples, events, focusedEventId }: PanelProps) {
  const data = useMemo(
    () => downsample(
      samples.map((s) => ({
        timestamp: s.timestamp,
        gpu_util: s.gpu_util,
        gpu_mem_mb: bytesToMB(s.gpu_mem_used),
        max_gpu_temp: s.max_gpu_temp,
      })),
      ["gpu_util", "gpu_mem_mb", "max_gpu_temp"] as any,
      TARGET_POINTS
    ),
    [samples]
  );
  const evts = relevantEvents(events, ["highGpu"]);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }} syncId={SYNC_ID}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={TICK_FILL} stroke={AXIS_STROKE} />
        <YAxis yAxisId="L" domain={[0, 100]} tick={TICK_FILL} stroke={AXIS_STROKE} width={36} unit="%" />
        <YAxis yAxisId="R" orientation="right" tick={TICK_FILL} stroke={AXIS_STROKE} width={48} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceAreas events={evts} focusedEventId={focusedEventId} />
        <Line yAxisId="L" dataKey="gpu_util" name="GPU %" stroke="#4cc28a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="gpu_mem_mb" name="显存 MB" stroke="#82d8aa" strokeWidth={1.2} dot={false} isAnimationActive={false} opacity={0.7} />
        <Line yAxisId="L" dataKey="max_gpu_temp" name="GPU 温度 °C" stroke="#f5a533" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ThermalPanel({ samples, events, focusedEventId }: PanelProps) {
  const data = useMemo(
    () => downsample(
      samples.map((s) => ({
        timestamp: s.timestamp,
        max_temp: s.max_temp,
        max_fan_speed: s.max_fan_speed,
      })),
      ["max_temp", "max_fan_speed"] as any,
      TARGET_POINTS
    ),
    [samples]
  );
  const evts = relevantEvents(events, ["highTemp", "fanPeak"]);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }} syncId={SYNC_ID}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={TICK_FILL} stroke={AXIS_STROKE} />
        <YAxis yAxisId="L" tick={TICK_FILL} stroke={AXIS_STROKE} width={36} unit="°C" />
        <YAxis yAxisId="R" orientation="right" tick={TICK_FILL} stroke={AXIS_STROKE} width={48} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceAreas events={evts} focusedEventId={focusedEventId} />
        <Line yAxisId="L" dataKey="max_temp" name="最高温度 °C" stroke="#d94a3a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="max_fan_speed" name="风扇 RPM" stroke="#5fa8d3" strokeWidth={1.5} dot={false} isAnimationActive={false} opacity={0.85} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export { eventKey };
