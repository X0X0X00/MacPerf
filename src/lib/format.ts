export function bytesToGB(b: number): number {
  return b / 1_073_741_824;
}

export function bytesToMB(b: number): number {
  return b / 1_048_576;
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function fmtPct(v: number): string {
  return `${Math.round(v)}%`;
}

export function fmtTemp(v: number): string {
  return `${Math.round(v)}°C`;
}

export function fmtRPM(v: number): string {
  return `${Math.round(v).toLocaleString()} RPM`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
