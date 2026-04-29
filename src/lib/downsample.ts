/**
 * Average-bucket downsampling. If pts.length <= target, returns pts unchanged.
 */
export function downsample<T extends { timestamp: string }>(
  pts: T[],
  numericKeys: (keyof T)[],
  target: number
): T[] {
  if (pts.length <= target || pts.length === 0) return pts;
  const first = new Date(pts[0].timestamp).getTime();
  const last = new Date(pts[pts.length - 1].timestamp).getTime();
  const totalMs = last - first;
  if (totalMs <= 0) return pts;
  const bucketMs = totalMs / target;

  const buckets: T[][] = Array.from({ length: target }, () => []);
  for (const p of pts) {
    const ms = new Date(p.timestamp).getTime();
    let idx = Math.floor((ms - first) / bucketMs);
    if (idx >= target) idx = target - 1;
    if (idx < 0) idx = 0;
    buckets[idx].push(p);
  }

  const result: T[] = [];
  for (let i = 0; i < target; i++) {
    const bucket = buckets[i];
    if (!bucket.length) continue;
    const avg: any = { ...bucket[0] };
    const midMs = first + (i + 0.5) * bucketMs;
    avg.timestamp = new Date(midMs).toISOString();
    for (const k of numericKeys) {
      let s = 0;
      for (const p of bucket) s += (p as any)[k] as number;
      avg[k] = s / bucket.length;
    }
    result.push(avg);
  }
  return result;
}
