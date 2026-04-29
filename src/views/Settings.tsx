import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getThresholds, setThresholds, setWatchedFolder } from "../lib/api";
import { AppConfig, Thresholds } from "../lib/types";

interface Props {
  config: AppConfig;
  onClose: () => void;
  onUpdated: (cfg: AppConfig) => void;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  cpu_pct: 80,
  cpu_min_seconds: 60,
  gpu_pct: 80,
  gpu_min_seconds: 60,
  mem_pressure_pct: 80,
  mem_min_seconds: 60,
  temp_celsius: 90,
  temp_min_seconds: 30,
};

export function Settings({ config, onClose, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThr] = useState<Thresholds>(config.thresholds ?? DEFAULT_THRESHOLDS);
  const [thrSavedAt, setThrSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getThresholds().then(setThr).catch(() => {});
  }, []);

  const pickFolder = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 iStatistica Pro 导出文件夹",
      });
      if (!selected) return;
      const folder = typeof selected === "string" ? selected : (selected as any).path;
      setBusy(true);
      const cfg = await setWatchedFolder(folder);
      onUpdated(cfg);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveThresholds = async (reanalyze: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setThresholds(thresholds, reanalyze);
      setThrSavedAt(Date.now());
      onUpdated({ ...config, thresholds });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setThr(DEFAULT_THRESHOLDS);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>设置</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <h3>监视文件夹</h3>
            <p className="settings-desc">
              MacPerf 会自动导入 iStatistica Pro 写入此文件夹的所有 CSV。
            </p>
            <div className="settings-row">
              <code className="settings-path">
                {config.watched_folder ?? "（未配置）"}
              </code>
              <button onClick={pickFolder} disabled={busy}>
                {busy ? "处理中…" : "选择文件夹…"}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>洞察阈值</h3>
            <p className="settings-desc">
              超过这些阈值并且持续指定的时间，就会被检测为一个事件。
            </p>
            <div className="threshold-grid">
              <ThresholdControl
                label="CPU 利用率"
                pct={thresholds.cpu_pct}
                seconds={thresholds.cpu_min_seconds}
                pctMin={30}
                pctMax={100}
                onPct={(v) => setThr({ ...thresholds, cpu_pct: v })}
                onSec={(v) => setThr({ ...thresholds, cpu_min_seconds: v })}
                unit="%"
              />
              <ThresholdControl
                label="GPU 利用率"
                pct={thresholds.gpu_pct}
                seconds={thresholds.gpu_min_seconds}
                pctMin={20}
                pctMax={100}
                onPct={(v) => setThr({ ...thresholds, gpu_pct: v })}
                onSec={(v) => setThr({ ...thresholds, gpu_min_seconds: v })}
                unit="%"
              />
              <ThresholdControl
                label="内存压力"
                pct={thresholds.mem_pressure_pct}
                seconds={thresholds.mem_min_seconds}
                pctMin={30}
                pctMax={100}
                onPct={(v) => setThr({ ...thresholds, mem_pressure_pct: v })}
                onSec={(v) => setThr({ ...thresholds, mem_min_seconds: v })}
                unit="%"
              />
              <ThresholdControl
                label="温度"
                pct={thresholds.temp_celsius}
                seconds={thresholds.temp_min_seconds}
                pctMin={60}
                pctMax={110}
                onPct={(v) => setThr({ ...thresholds, temp_celsius: Math.round(v) })}
                onSec={(v) => setThr({ ...thresholds, temp_min_seconds: v })}
                unit="°C"
              />
            </div>
            <div className="settings-row" style={{ marginTop: 16 }}>
              <button onClick={reset} disabled={busy}>恢复默认</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => saveThresholds(false)} disabled={busy}>仅保存</button>
              <button
                onClick={() => saveThresholds(true)}
                disabled={busy}
                style={{ background: "var(--accent)", color: "white", borderColor: "var(--accent)" }}
              >
                {busy ? "处理中…" : "保存并重新分析全部记录"}
              </button>
            </div>
            {thrSavedAt && (
              <div className="settings-saved">已保存 ✓</div>
            )}
          </section>

          {error && <div className="error-msg">{error}</div>}

          <section className="settings-section">
            <h3>关于</h3>
            <p>MacPerf v0.1 — iStatistica Pro CSV 性能分析器</p>
          </section>
        </div>
      </div>
    </div>
  );
}

interface ControlProps {
  label: string;
  pct: number;
  seconds: number;
  pctMin: number;
  pctMax: number;
  onPct: (v: number) => void;
  onSec: (v: number) => void;
  unit: string;
}

function ThresholdControl(p: ControlProps) {
  return (
    <div className="threshold-control">
      <div className="threshold-label">{p.label}</div>
      <div className="threshold-row">
        <span className="threshold-sub">阈值</span>
        <input
          type="range"
          min={p.pctMin}
          max={p.pctMax}
          value={p.pct}
          onChange={(e) => p.onPct(Number(e.target.value))}
        />
        <span className="threshold-value">{p.pct}{p.unit}</span>
      </div>
      <div className="threshold-row">
        <span className="threshold-sub">最少持续</span>
        <input
          type="range"
          min={5}
          max={300}
          step={5}
          value={p.seconds}
          onChange={(e) => p.onSec(Number(e.target.value))}
        />
        <span className="threshold-value">{p.seconds}s</span>
      </div>
    </div>
  );
}
