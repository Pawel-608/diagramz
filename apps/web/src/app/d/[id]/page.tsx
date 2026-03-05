"use client";

import { useEffect, useState } from "react";
import type { Diagram } from "@diagramz/shared";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const DiagramCanvas = dynamic(() => import("@/components/DiagramCanvas"), {
  ssr: false,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function DiagramPage() {
  const { id } = useParams<{ id: string }>();
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/diagrams/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Diagram not found");
        return res.json();
      })
      .then(setDiagram)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>{error}</p>
      </div>
    );
  }

  if (!diagram) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading...</p>
      </div>
    );
  }

  return <DiagramCanvas diagram={diagram} />;
}
