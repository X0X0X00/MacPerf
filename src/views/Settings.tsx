import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { setWatchedFolder } from "../lib/api";
import { AppConfig } from "../lib/types";

interface Props {
  config: AppConfig;
  onClose: () => void;
  onUpdated: (cfg: AppConfig) => void;
}

export function Settings({ config, onClose, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={pick} disabled={busy}>
                {busy ? "处理中…" : "选择文件夹…"}
              </button>
            </div>
            {error && <div className="error-msg">{error}</div>}
          </section>
          <section className="settings-section">
            <h3>关于</h3>
            <p>MacPerf v0.1 — iStatistica Pro CSV 性能分析器</p>
          </section>
        </div>
      </div>
    </div>
  );
}
