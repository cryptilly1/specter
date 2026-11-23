import { useEffect, useState, type ReactNode } from "react";
import type { LightingPreset, Quality, SpecterScene } from "specter-core";
import { buildShareUrl, type CommandController } from "specter-voice";

export interface ToolbarProps {
  scene: SpecterScene | null;
  controller: CommandController | null;
  /** Extra query params to keep in share links, for example { pack: "cell" }. */
  shareParams?: () => Record<string, string>;
  children?: ReactNode;
}

/** Quality, lighting, reset view and share. */
export function Toolbar({ scene, controller, shareParams, children }: ToolbarProps) {
  const [quality, setQuality] = useState<Quality>(scene?.getQuality() ?? "standard");
  const [light, setLight] = useState<LightingPreset>(scene?.getLighting() ?? "studio");
  const [share, setShare] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!scene) return;
    setQuality(scene.getQuality());
    setLight(scene.getLighting());
  }, [scene]);

  const url = () => buildShareUrl(location.href, controller?.getApplied() ?? { version: 1, ops: [] }, shareParams?.() ?? {});

  return (
    <>
      <div className="sp-toolbar" role="toolbar" aria-label="Scene tools">
        {children}
        <select
          className="sp-select"
          aria-label="Lighting"
          value={light}
          onChange={(e) => {
            const v = e.target.value as LightingPreset;
            setLight(v);
            scene?.applyLighting(v);
          }}
        >
          <option value="studio">Studio light</option>
          <option value="indoor">Indoor light</option>
          <option value="night">Night</option>
        </select>
        <button
          className={`sp-btn ${quality === "cinematic" ? "sp-active" : ""}`}
          aria-pressed={quality === "cinematic"}
          onClick={() => {
            const next: Quality = quality === "cinematic" ? "standard" : "cinematic";
            scene?.setQuality(next);
            setQuality(scene?.getQuality() ?? next);
          }}
          title="Ambient occlusion and bloom"
        >
          ✨ Cinematic
        </button>
        <button className="sp-btn" onClick={() => scene?.resetView()}>
          ⌂ Reset view
        </button>
        <button
          className="sp-btn"
          onClick={() => {
            setCopied(false);
            setShare(url());
          }}
          data-testid="share-btn"
        >
          ⤴ Share
        </button>
      </div>

      {share && (
        <div className="sp-modal-back" role="dialog" aria-modal="true" aria-label="Share this scene" onClick={() => setShare(null)}>
          <div className="sp-card sp-modal" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: "0 0 8px" }}>Share this scene</h4>
            <p className="sp-note" style={{ marginTop: 0 }}>Anyone with this link sees the scene with your edits applied.</p>
            <textarea readOnly value={share} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
            <p className="sp-note" style={{ margin: "10px 0 4px" }}>Embed it in a page or LMS:</p>
            <textarea
              readOnly
              aria-label="Embed code"
              value={`<iframe src="${share}${share.includes("?") ? "&" : "?"}embed=1" width="100%" height="520" style="border:0;border-radius:12px" allow="microphone; fullscreen" title="Specter scene"></iframe>`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="sp-row" style={{ marginTop: 10 }}>
              <button
                className="sp-btn sp-primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(share);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button className="sp-btn" onClick={() => setShare(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
