import { Overview } from "../lib/types";
import { fmtDuration } from "../lib/format";

interface Props {
  overview: Overview | null;
  onJump?: (sessionId: number) => void;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function OverviewBar({ overview, onJump }: Props) {
  if (!overview || overview.session_count === 0) return null;

  const { peak_temp, peak_cpu, peak_fan, hour_histogram, weekday_histogram } = overview;
  const maxHourly = Math.max(1, ...hour_histogram);
  const maxWeekly = Math.max(1, ...weekday_histogram);
  const peakHour = hour_histogram.indexOf(Math.max(...hour_histogram));

  return (
    <div className="overview-bar">
      <div className="overview-cell">
        <div className="ov-label">总记录</div>
        <div className="ov-value">{overview.session_count}</div>
        <div className="ov-sub">{fmtDuration(overview.total_duration_seconds)} 已分析</div>
      </div>

      {peak_temp && (
        <div className="overview-cell clickable" onClick={() => onJump?.(peak_temp.session_id)} title="跳转到那条记录">
          <div className="ov-label">历史峰值温度</div>
          <div className="ov-value">{Math.round(peak_temp.value)}°C</div>
          <div className="ov-sub">{peak_temp.session_label}</div>
        </div>
      )}

      {peak_cpu && (
        <div className="overview-cell clickable" onClick={() => onJump?.(peak_cpu.session_id)} title="跳转到那条记录">
          <div className="ov-label">历史峰值 CPU</div>
          <div className="ov-value">{Math.round(peak_cpu.value)}%</div>
          <div className="ov-sub">{peak_cpu.session_label}</div>
        </div>
      )}

      {peak_fan && (
        <div className="overview-cell clickable" onClick={() => onJump?.(peak_fan.session_id)} title="跳转到那条记录">
          <div className="ov-label">历史峰值风扇</div>
          <div className="ov-value">{Math.round(peak_fan.value).toLocaleString()}</div>
          <div className="ov-sub">RPM · {peak_fan.session_label}</div>
        </div>
      )}

      <div className="overview-cell wide">
        <div className="ov-label">时段分布（高峰 {peakHour}:00）</div>
        <div className="histogram">
          {hour_histogram.map((c, i) => (
            <div
              key={i}
              className="histogram-bar"
              style={{ height: `${(c / maxHourly) * 100}%` }}
              title={`${i}:00 — ${c} 条`}
            />
          ))}
        </div>
        <div className="histogram-axis">
          <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      <div className="overview-cell">
        <div className="ov-label">星期分布</div>
        <div className="weekly">
          {weekday_histogram.map((c, i) => (
            <div key={i} className="weekly-cell" title={`${WEEKDAY_LABELS[i]} — ${c} 条`}>
              <div className="weekly-bar" style={{ height: `${(c / maxWeekly) * 100}%` }} />
              <div className="weekly-label">{WEEKDAY_LABELS[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
