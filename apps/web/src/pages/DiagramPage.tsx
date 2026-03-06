import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getDiagram, updateDiagram } from "../api";
import { Toolbar } from "../components/Toolbar";

type WasmModule = typeof import("../wasm/diagramz_renderer");
type Whiteboard = InstanceType<Awaited<WasmModule>["Whiteboard"]>;

let wasmModule: Awaited<WasmModule> | null = null;
let wasmInitPromise: Promise<Awaited<WasmModule>> | null = null;

function loadWasm(): Promise<Awaited<WasmModule>> {
  if (wasmModule) return Promise.resolve(wasmModule);
  if (!wasmInitPromise) {
    wasmInitPromise = import("../wasm/diagramz_renderer")
      .then(async (mod) => {
        await mod.default();
        wasmModule = mod;
        return mod;
      })
      .catch((err) => {
        wasmInitPromise = null;
        throw err;
      });
  }
  return wasmInitPromise;
}

export function DiagramPage() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wbRef = useRef<Whiteboard | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sketchy, setSketchy] = useState(true);

  const scheduleSave = useCallback(() => {
    if (!id || !wbRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!wbRef.current) return;
      try {
        savingRef.current = true;
        const json = wbRef.current.get_diagram();
        const diagram = JSON.parse(json);
        await updateDiagram(id, {
          elements: diagram.elements,
          connections: diagram.connections,
        });
      } catch {
        // ignore save errors
      } finally {
        savingRef.current = false;
      }
    }, 500);
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    (async () => {
      try {
        const [diagram, wasm] = await Promise.all([getDiagram(id), loadWasm()]);
        if (cancelled) return;

        localStorage.setItem("diagramz:lastDiagramId", id);

        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
          canvas.width = canvas.clientWidth * devicePixelRatio;
          canvas.height = canvas.clientHeight * devicePixelRatio;
        };
        resize();

        const wb = new wasm.Whiteboard(canvas, JSON.stringify(diagram));
        wbRef.current = wb;

        const onMouseDown = (e: MouseEvent) => {
          const rect = canvas.getBoundingClientRect();
          wb.on_mouse_down(
            (e.clientX - rect.left) * devicePixelRatio,
            (e.clientY - rect.top) * devicePixelRatio,
          );
        };
        const onMouseMove = (e: MouseEvent) => {
          const rect = canvas.getBoundingClientRect();
          const sx = (e.clientX - rect.left) * devicePixelRatio;
          const sy = (e.clientY - rect.top) * devicePixelRatio;
          wb.on_mouse_move(sx, sy);
          if (e.buttons === 0) {
            canvas.style.cursor = wb.has_element_at(sx, sy) ? "move" : "";
          }
        };
        const onMouseUp = () => {
          wb.on_mouse_up();
          scheduleSave();
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const rect = canvas.getBoundingClientRect();
            wb.on_wheel_zoom(
              (e.clientX - rect.left) * devicePixelRatio,
              (e.clientY - rect.top) * devicePixelRatio,
              e.deltaY,
            );
          } else {
            wb.on_wheel_pan(
              e.deltaX * devicePixelRatio,
              e.deltaY * devicePixelRatio,
            );
          }
        };
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            wb.delete_selected();
            scheduleSave();
          }
        };
        const onResize = () => {
          resize();
          wb.render();
        };

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onResize);

        cleanupRef.current = () => {
          canvas.removeEventListener("mousedown", onMouseDown);
          canvas.removeEventListener("mousemove", onMouseMove);
          canvas.removeEventListener("mouseup", onMouseUp);
          canvas.removeEventListener("wheel", onWheel);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("resize", onResize);
          wbRef.current = null;
        };

        setLoading(false);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load diagram");
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [id, scheduleSave]);

  useEffect(() => {
    wbRef.current?.set_sketchy(sketchy);
    wbRef.current?.set_roughness(sketchy ? 1.5 : 0);
  }, [sketchy]);

  // SSE: listen for remote updates
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/v1/diagrams/${id}/events`);
    es.addEventListener("updated", async () => {
      if (savingRef.current || !wbRef.current) return;
      try {
        const diagram = await getDiagram(id);
        wbRef.current.set_diagram(JSON.stringify(diagram));
      } catch {
        // ignore
      }
    });
    return () => es.close();
  }, [id]);

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.8)",
          }}
        >
          Loading...
        </div>
      )}
      {!loading && (
        <Toolbar
          sketchy={sketchy}
          onSketchyChange={setSketchy}
          onZoomIn={() => wbRef.current?.zoom_in()}
          onZoomOut={() => wbRef.current?.zoom_out()}
          onZoomFit={() => wbRef.current?.zoom_to_fit()}
          onDeleteSelected={() => {
            wbRef.current?.delete_selected();
            scheduleSave();
          }}
          onBringToFront={() => {
            wbRef.current?.bring_to_front();
            scheduleSave();
          }}
          onSendToBack={() => {
            wbRef.current?.send_to_back();
            scheduleSave();
          }}
        />
      )}
    </div>
  );
}
