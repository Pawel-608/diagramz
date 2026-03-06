const API_BASE = "/api/v1";

export interface Diagram {
  id: string;
  title?: string;
  elements: unknown[];
  connections: unknown[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CreateDiagramResponse {
  id: string;
  url: string;
  diagram: Diagram;
}

export async function createDiagram(
  body: Record<string, unknown> = {},
): Promise<CreateDiagramResponse> {
  const res = await fetch(`${API_BASE}/diagrams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDiagram(id: string): Promise<Diagram> {
  const res = await fetch(`${API_BASE}/diagrams/${id}`);
  if (!res.ok) throw new Error("Diagram not found");
  return res.json();
}

export async function updateDiagram(
  id: string,
  body: Record<string, unknown>,
): Promise<Diagram> {
  const res = await fetch(`${API_BASE}/diagrams/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDiagram(id: string): Promise<void> {
  await fetch(`${API_BASE}/diagrams/${id}`, { method: "DELETE" });
}
