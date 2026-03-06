import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createDiagram } from "../api";

export function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const lastId = localStorage.getItem("diagramz:lastDiagramId");
    if (lastId) {
      navigate(`/d/${lastId}`, { replace: true });
      return;
    }

    createDiagram({ title: "Untitled Diagram" }).then((res) => {
      localStorage.setItem("diagramz:lastDiagramId", res.id);
      navigate(`/d/${res.id}`, { replace: true });
    });
  }, [navigate]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      Loading...
    </div>
  );
}
