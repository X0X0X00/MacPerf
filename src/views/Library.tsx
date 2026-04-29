import { Session } from "../lib/types";
import { fmtDateTime, fmtDuration, fmtPct, fmtRPM, fmtTemp } from "../lib/format";

interface Props {
  sessions: Session[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number, multi: boolean) => void;
  onDelete: (id: number) => void;
}

export function Library({ sessions, selectedIds, onToggleSelect, onDelete }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📭</div>
        <div className="empty-msg">还没有任何记录</div>
        <div className="empty-sub">在右上角设置里选择 iStatistica Pro 导出文件夹</div>
      </div>
    );
  }

  return (
    <div className="library">
      <div className="library-head">
        <div className="library-row library-row-head">
          <div className="col-time">开始时间</div>
          <div className="col-dur">时长</div>
          <div className="col-num">峰值 CPU</div>
          <div className="col-num">峰值温度</div>
          <div className="col-num">峰值风扇</div>
          <div className="col-num">采样数</div>
        </div>
      </div>
      <div className="library-body">
        {sessions.map((s) => {
          const selected = selectedIds.has(s.id);
          return (
            <div
              key={s.id}
              className={`library-row ${selected ? "selected" : ""}`}
              onClick={(e) => onToggleSelect(s.id, e.metaKey || e.shiftKey)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`删除这条记录？\n${s.source_filename}`)) {
                  onDelete(s.id);
                }
              }}
              title={s.source_filename}
            >
              <div className="col-time">{fmtDateTime(s.start_time)}</div>
              <div className="col-dur">{fmtDuration(s.duration_seconds)}</div>
              <div className="col-num">{fmtPct(s.summary.cpu_util.max)}</div>
              <div className="col-num">{fmtTemp(s.summary.max_temp.max)}</div>
              <div className="col-num">{fmtRPM(s.summary.max_fan_speed.max)}</div>
              <div className="col-num">{s.sample_count.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
