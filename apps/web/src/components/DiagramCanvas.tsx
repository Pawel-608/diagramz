"use client";

import type { Diagram } from "@diagramz/shared";

interface DiagramCanvasProps {
  diagram: Diagram;
}

export default function DiagramCanvas({ diagram }: DiagramCanvasProps) {
  // TODO: Integrate @excalidraw/excalidraw component here
  // Convert Diagram elements to Excalidraw format and render
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div
        style={{
          padding: "1rem",
          borderBottom: "1px solid #eee",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <strong>{diagram.title || "Untitled Diagram"}</strong>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 60px)",
          color: "#999",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Excalidraw canvas will render here ({diagram.elements.length} elements)
      </div>
    </div>
  );
}
