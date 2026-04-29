import { useEffect, useState } from "react";
import { Session, Sample } from "../lib/types";
import { getSamples } from "../lib/api";
import { CPUPanel, GPUPanel, MemoryPanel, ThermalPanel } from "../components/Charts";
import { InsightsPanel } from "../components/InsightsPanel";
import { fmtDateTime, fmtDuration, fmtPct, fmtRPM, fmtTemp } from "../lib/format";

interface Props {
  session: Session;
}

export function SessionDetail({ session }: Props) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSamples(null);
    getSamples(session.id)
      .then((data) => setSamples(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [session.id]);

  return (
    <div className="detail">
      <div className="detail-header">
        <div>
          <h2>{fmtDateTime(session.start_time)}</h2>
          <div className="detail-meta">
            {fmtDuration(session.duration_seconds)} · {session.sample_count.toLocaleString()} 个采样点 · {session.source_filename}
          </div>
        </div>
        <div className="detail-summary">
          <div className="stat">
            <div className="stat-label">峰值 CPU</div>
            <div className="stat-value">{fmtPct(session.summary.cpu_util.max)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">平均 CPU</div>
            <div className="stat-value">{fmtPct(session.summary.cpu_util.avg)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">峰值温度</div>
            <div className="stat-value">{fmtTemp(session.summary.max_temp.max)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">峰值风扇</div>
            <div className="stat-value">{fmtRPM(session.summary.max_fan_speed.max)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">CPU &gt;80%</div>
            <div className="stat-value">{fmtDuration(session.summary.seconds_above_cpu80)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">温度 &gt;90°</div>
            <div className="stat-value">{fmtDuration(session.summary.seconds_above_temp90)}</div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-charts">
          {loading && <div className="loading">加载采样数据中…</div>}
          {error && <div className="error-msg">加载失败：{error}</div>}
          {samples && samples.length > 0 && (
            <>
              <section className="chart-block">
                <div className="chart-title">CPU</div>
                <CPUPanel samples={samples} />
              </section>
              <section className="chart-block">
                <div className="chart-title">内存</div>
                <MemoryPanel samples={samples} />
              </section>
              <section className="chart-block">
                <div className="chart-title">GPU</div>
                <GPUPanel samples={samples} />
              </section>
              <section className="chart-block">
                <div className="chart-title">温度 &amp; 风扇</div>
                <ThermalPanel samples={samples} />
              </section>
            </>
          )}
        </div>
        <aside className="detail-aside">
          <InsightsPanel events={session.summary.events} />
        </aside>
      </div>
    </div>
  );
}
