import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { Sample } from "../lib/types";
import { bytesToGB, bytesToMB } from "../lib/format";
import { downsample } from "../lib/downsample";

const TARGET_POINTS = 4000;

function tickTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tooltipTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface PanelProps {
  samples: Sample[];
}

export function CPUPanel({ samples }: PanelProps) {
  const data = downsample(samples, ["cpu_util", "max_cpu_temp"] as any, TARGET_POINTS);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#e5eaf3" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
        <YAxis yAxisId="L" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} />
        <YAxis yAxisId="R" orientation="right" domain={[0, 110]} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={{ background: "#ffffff", border: "1px solid #d9e0ec", borderRadius: 6, boxShadow: "0 4px 14px rgba(15,23,42,0.08)" }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
          formatter={(v: number, name: string) => {
            if (name === "CPU %") return `${v.toFixed(1)}%`;
            return `${Math.round(v)}°C`;
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="L" dataKey="cpu_util" name="CPU %" stroke="#5b8def" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="max_cpu_temp" name="CPU 温度 °C" stroke="#f4754d" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MemoryPanel({ samples }: PanelProps) {
  const data = downsample(
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
  );
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#e5eaf3" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
        <YAxis yAxisId="L" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} unit=" GB" />
        <YAxis yAxisId="R" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} unit="%" />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={{ background: "#ffffff", border: "1px solid #d9e0ec", borderRadius: 6, boxShadow: "0 4px 14px rgba(15,23,42,0.08)" }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
          formatter={(v: number, name: string) => {
            if (name === "压力") return `${Math.round(v)}%`;
            return `${(v as number).toFixed(2)} GB`;
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area yAxisId="L" type="monotone" dataKey="wired" name="Wired" stackId="1" stroke="#7568d6" fill="#7568d6" fillOpacity={0.7} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="used" name="Used" stackId="1" stroke="#8aa6f4" fill="#8aa6f4" fillOpacity={0.7} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="cached" name="Cached" stackId="1" stroke="#b3c7f1" fill="#b3c7f1" fillOpacity={0.6} isAnimationActive={false} />
        <Area yAxisId="L" type="monotone" dataKey="free" name="Free" stackId="1" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.6} isAnimationActive={false} />
        <Line yAxisId="R" type="monotone" dataKey="pressure" name="压力" stroke="#e75c5c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GPUPanel({ samples }: PanelProps) {
  const data = downsample(
    samples.map((s) => ({
      timestamp: s.timestamp,
      gpu_util: s.gpu_util,
      gpu_mem_mb: bytesToMB(s.gpu_mem_used),
      max_gpu_temp: s.max_gpu_temp,
    })),
    ["gpu_util", "gpu_mem_mb", "max_gpu_temp"] as any,
    TARGET_POINTS
  );
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#e5eaf3" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
        <YAxis yAxisId="L" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} unit="%" />
        <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={48} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={{ background: "#ffffff", border: "1px solid #d9e0ec", borderRadius: 6, boxShadow: "0 4px 14px rgba(15,23,42,0.08)" }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="L" dataKey="gpu_util" name="GPU %" stroke="#4cc28a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="gpu_mem_mb" name="显存 MB" stroke="#82d8aa" strokeWidth={1.2} dot={false} isAnimationActive={false} opacity={0.7} />
        <Line yAxisId="L" dataKey="max_gpu_temp" name="GPU 温度 °C" stroke="#f5a533" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ThermalPanel({ samples }: PanelProps) {
  const data = downsample(
    samples.map((s) => ({
      timestamp: s.timestamp,
      max_temp: s.max_temp,
      max_fan_speed: s.max_fan_speed,
    })),
    ["max_temp", "max_fan_speed"] as any,
    TARGET_POINTS
  );
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#e5eaf3" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={tickTime} tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
        <YAxis yAxisId="L" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={36} unit="°C" />
        <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={48} />
        <Tooltip
          labelFormatter={tooltipTime}
          contentStyle={{ background: "#ffffff", border: "1px solid #d9e0ec", borderRadius: 6, boxShadow: "0 4px 14px rgba(15,23,42,0.08)" }}
          labelStyle={{ color: "#1f2937", fontWeight: 600 }}
          itemStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="L" dataKey="max_temp" name="最高温度 °C" stroke="#d94a3a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line yAxisId="R" dataKey="max_fan_speed" name="风扇 RPM" stroke="#5fa8d3" strokeWidth={1.5} dot={false} isAnimationActive={false} opacity={0.85} />
      </LineChart>
    </ResponsiveContainer>
  );
}
