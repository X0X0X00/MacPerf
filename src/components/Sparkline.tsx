import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface MiniSeries {
  cpu: number[];
  temp: number[];
}

interface Props {
  sessionId: number;
  width?: number;
  height?: number;
}

const cache = new Map<number, MiniSeries>();

/**
 * Tiny SVG sparkline of a session's CPU + temperature.
 * Lazily loads samples once per session, caches in memory.
 */
export function Sparkline({ sessionId, width = 140, height = 28 }: Props) {
  const [series, setSeries] = useState<MiniSeries | null>(cache.get(sessionId) ?? null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache.has(sessionId)) {
      setSeries(cache.get(sessionId)!);
      return;
    }
    let cancelled = false;
    invoke<{ cpu: number[]; temp: number[] }>("get_session_sparkline", { sessionId, points: 80 })
      .then((data) => {
        if (cancelled) return;
        cache.set(sessionId, data);
        setSeries(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!series || series.cpu.length === 0) {
    return <div ref={containerRef} className="sparkline-placeholder" style={{ width, height }} />;
  }

  const cpuPath = pathFor(series.cpu, width, height, 0, 100);
  const tempMax = Math.max(100, ...series.temp);
  const tempPath = pathFor(series.temp, width, height, 30, tempMax);

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={tempPath} fill="none" stroke="#f4754d" strokeWidth={1} opacity={0.65} />
      <path d={cpuPath} fill="none" stroke="#3b6df0" strokeWidth={1.2} />
    </svg>
  );
}

function pathFor(values: number[], width: number, height: number, vmin: number, vmax: number): string {
  if (values.length < 2) return "";
  const span = Math.max(1, vmax - vmin);
  const stepX = width / (values.length - 1);
  let d = "";
  values.forEach((v, i) => {
    const x = i * stepX;
    const y = height - ((v - vmin) / span) * height;
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return d;
}
