import { __ } from "@wordpress/i18n";
import { useBlockProps, InspectorControls, MediaUpload } from "@wordpress/block-editor";
import { Panel, PanelBody, PanelRow, Button } from "@wordpress/components";
import "./editor.scss";

export default function Edit({ attributes, setAttributes }) {
    const pts = attributes.controlPoints || [];

    function setPts(newPts) {
        setAttributes({ controlPoints: [...newPts].sort((a, b) => a.t - b.t) });
    }

    function updatePoint(idx, key, val) {
        setPts(pts.map((p, i) => i === idx ? { ...p, [key]: parseFloat(val) || 0 } : p));
    }

    function addPoint() {
        const last = pts[pts.length - 1] || { t: 1, x: 0, y: 0 };
        const prev = pts[pts.length - 2] || { t: 0, x: 0, y: 0 };
        const newT = parseFloat(((prev.t + last.t) / 2).toFixed(4));
        setPts([...pts, { t: Math.min(newT, 0.9999), x: 0, y: 0 }]);
    }

    function removePoint(idx) {
        if (pts.length <= 2) return;
        setPts(pts.filter((_, i) => i !== idx));
    }

    return (
        <div {...useBlockProps()}>
            <InspectorControls>
                <Panel header={__("3D Map Settings", "three-object-viewer")}>
                    <PanelBody title={__("Waveform Texture", "three-object-viewer")} initialOpen={true}>
                        <PanelRow>
                            <span style={{ fontSize: "12px", color: "#aaa" }}>
                                {attributes.waveformUrl
                                    ? attributes.waveformUrl.split("/").pop()
                                    : __("No texture — procedural fallback used.", "three-object-viewer")}
                            </span>
                        </PanelRow>
                        <PanelRow>
                            <MediaUpload
                                onSelect={(obj) => setAttributes({ waveformUrl: obj.url })}
                                allowedTypes={["image"]}
                                value={attributes.waveformUrl}
                                render={({ open }) => (
                                    <Button isSecondary onClick={open}>
                                        {attributes.waveformUrl
                                            ? __("Replace Waveform", "three-object-viewer")
                                            : __("Select Waveform Image", "three-object-viewer")}
                                    </Button>
                                )}
                            />
                        </PanelRow>
                        {attributes.waveformUrl && (
                            <PanelRow>
                                <Button isDestructive isSmall onClick={() => setAttributes({ waveformUrl: "" })}>
                                    {__("Clear", "three-object-viewer")}
                                </Button>
                            </PanelRow>
                        )}
                    </PanelBody>

                    <PanelBody title={__("Centerline Control Points", "three-object-viewer")} initialOpen={true}>
                        <PanelRow>
                            <div style={{ width: "100%" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr 1fr 24px", gap: "4px", marginBottom: "4px" }}>
                                    <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase" }}>t</span>
                                    <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", textAlign: "center" }}>X</span>
                                    <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", textAlign: "center" }}>Y</span>
                                    <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", textAlign: "center" }}>0–1</span>
                                    <span />
                                </div>
                                {pts.map((pt, i) => (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr 1fr 24px", gap: "4px", alignItems: "center", borderBottom: "1px solid #2a2a2a", padding: "3px 0" }}>
                                        <span style={{ fontSize: "10px", color: "#666", fontFamily: "monospace" }}>{Math.round(pt.t * 100)}%</span>
                                        <input type="number" step="0.5" value={pt.x}
                                            style={{ width: "100%", fontSize: "11px", padding: "2px 4px", background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: "2px" }}
                                            onChange={(e) => updatePoint(i, "x", e.target.value)} />
                                        <input type="number" step="0.5" value={pt.y}
                                            style={{ width: "100%", fontSize: "11px", padding: "2px 4px", background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: "2px" }}
                                            onChange={(e) => updatePoint(i, "y", e.target.value)} />
                                        <input type="number" step="0.01" min="0" max="1" value={pt.t}
                                            style={{ width: "100%", fontSize: "11px", padding: "2px 4px", background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: "2px" }}
                                            onChange={(e) => updatePoint(i, "t", e.target.value)} />
                                        {pts.length > 2 ? (
                                            <button onClick={() => removePoint(i)}
                                                style={{ border: "none", background: "transparent", color: "#888", cursor: "pointer", fontSize: "14px" }}>×</button>
                                        ) : <span />}
                                    </div>
                                ))}
                                <div style={{ marginTop: "8px" }}>
                                    <Button isSecondary onClick={addPoint} style={{ width: "100%", justifyContent: "center" }}>
                                        {__("+ Add Control Point", "three-object-viewer")}
                                    </Button>
                                </div>
                            </div>
                        </PanelRow>
                    </PanelBody>
                </Panel>
            </InspectorControls>

            <div className="three-object-viewer-inner">
            <div className="three-object-viewer-inner-edit-container">
             <svg className="custom-icon custom-icon-cube" viewBox="0 0 40 40" version="1.1" xmlns="http://www.w3.org/2000/svg">
             <g transform="matrix(1,0,0,1,-1.1686,0.622128)">
              <path d="M37.485,28.953L21.699,38.067L21.699,19.797L37.485,10.683L37.485,28.953ZM21.218,19.821L21.218,38.065L5.435,28.953L5.435,10.709L21.218,19.821ZM37.207,10.288L21.438,19.392L5.691,10.301L21.46,1.197L37.207,10.288Z" />
              </g>
              </svg>
					<p><b>3D Map</b></p>
				</div>
			</div>
        </div>
    );
}
