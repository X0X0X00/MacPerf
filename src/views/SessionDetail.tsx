import { useEffect, useRef, useState } from "react";
import { Session, Sample, InsightEvent, InsightKind } from "../lib/types";
import { getSamples } from "../lib/api";
import { CPUPanel, GPUPanel, MemoryPanel, ThermalPanel, eventKey } from "../components/Charts";
import { InsightsPanel } from "../components/InsightsPanel";
import { fmtDateTime, fmtDuration, fmtPct, fmtRPM, fmtTemp } from "../lib/format";

interface Props {
  session: Session;
}

const PANEL_FOR_KIND: Record<InsightKind, string> = {
  highCpu: "panel-cpu",
  highGpu: "panel-gpu",
  highMemPressure: "panel-mem",
  highTemp: "panel-thermal",
  fanPeak: "panel-thermal",
};

export function SessionDetail({ session }: Props) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);

  const cpuRef = useRef<HTMLElement>(null);
  const memRef = useRef<HTMLElement>(null);
  const gpuRef = useRef<HTMLElement>(null);
  const thermalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSamples(null);
    setFocusedEventId(null);
    getSamples(session.id)
      .then((data) => setSamples(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [session.id]);

  const handleEventClick = (e: InsightEvent) => {
    const id = eventKey(e);
    setFocusedEventId(id);
    const ref = (() => {
      switch (e.kind) {
        case "highCpu": return cpuRef;
        case "highGpu": return gpuRef;
        case "highMemPressure": return memRef;
        case "highTemp":
        case "fanPeak":
          return thermalRef;
      }
    })();
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="detail">
      <div className="detail-header">
        <div className="detail-header-left">
          <h2>{fmtDateTime(session.start_time)}</h2>
          <div className="detail-meta">
            {fmtDuration(session.duration_seconds)} · {session.sample_count.toLocaleString()} 个采样点 · {session.source_filename}
          </div>
          {session.summary.tags && session.summary.tags.length > 0 && (
            <div className="tag-row tag-row-large">
              {session.summary.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
        </div>
        <div className="detail-summary">
          <Stat label="峰值 CPU" value={fmtPct(session.summary.cpu_util.max)} />
          <Stat label="平均 CPU" value={fmtPct(session.summary.cpu_util.avg)} />
          <Stat label="峰值温度" value={fmtTemp(session.summary.max_temp.max)} />
          <Stat label="峰值风扇" value={fmtRPM(session.summary.max_fan_speed.max)} />
          <Stat label="CPU >80%" value={fmtDuration(session.summary.seconds_above_cpu80)} />
          <Stat label="温度 >90°" value={fmtDuration(session.summary.seconds_above_temp90)} />
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-charts">
          {loading && <div className="loading">加载采样数据中…</div>}
          {error && <div className="error-msg">加载失败：{error}</div>}
          {samples && samples.length > 0 && (
            <>
              <section className="chart-block" id={PANEL_FOR_KIND.highCpu} ref={cpuRef}>
                <div className="chart-title">CPU <span className="chart-hint">拖底部 brush 缩放</span></div>
                <CPUPanel
                  samples={samples}
                  events={session.summary.events}
                  focusedEventId={focusedEventId}
                  showBrush
                />
              </section>
              <section className="chart-block" id={PANEL_FOR_KIND.highMemPressure} ref={memRef}>
                <div className="chart-title">内存</div>
                <MemoryPanel
                  samples={samples}
                  events={session.summary.events}
                  focusedEventId={focusedEventId}
                />
              </section>
              <section className="chart-block" id={PANEL_FOR_KIND.highGpu} ref={gpuRef}>
                <div className="chart-title">GPU</div>
                <GPUPanel
                  samples={samples}
                  events={session.summary.events}
                  focusedEventId={focusedEventId}
                />
              </section>
              <section className="chart-block" id={PANEL_FOR_KIND.highTemp} ref={thermalRef}>
                <div className="chart-title">温度 &amp; 风扇</div>
                <ThermalPanel
                  samples={samples}
                  events={session.summary.events}
                  focusedEventId={focusedEventId}
                />
              </section>
            </>
          )}
        </div>
        <aside className="detail-aside">
          <InsightsPanel
            events={session.summary.events}
            focusedEventId={focusedEventId}
            onSelect={handleEventClick}
          />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
