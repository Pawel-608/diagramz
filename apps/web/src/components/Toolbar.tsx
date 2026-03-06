interface ToolbarProps {
  sketchy: boolean;
  onSketchyChange: (v: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #ddd",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

export function Toolbar({
  sketchy,
  onSketchyChange,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
}: ToolbarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(255,255,255,0.95)",
        padding: "8px 12px",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 10,
        flexWrap: "wrap",
      }}
    >
      <label style={{ fontSize: 13, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={sketchy}
          onChange={(e) => onSketchyChange(e.target.checked)}
        />{" "}
        Sketchy
      </label>

      <div style={{ width: 1, height: 20, background: "#ddd" }} />

      <button style={btnStyle} onClick={onZoomIn} title="Zoom in">+</button>
      <button style={btnStyle} onClick={onZoomOut} title="Zoom out">-</button>
      <button style={btnStyle} onClick={onZoomFit} title="Fit to content">Fit</button>

      <div style={{ width: 1, height: 20, background: "#ddd" }} />

      <button style={btnStyle} onClick={onDeleteSelected} title="Delete selected">Del</button>
      <button style={btnStyle} onClick={onBringToFront} title="Bring to front">Front</button>
      <button style={btnStyle} onClick={onSendToBack} title="Send to back">Back</button>
    </div>
  );
}
