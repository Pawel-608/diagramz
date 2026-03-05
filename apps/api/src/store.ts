import type { Diagram } from "@diagramz/shared";
import { DEFAULT_TTL_MS } from "@diagramz/shared";

/**
 * In-memory diagram store.
 * Replace with PostgreSQL/Redis for production.
 */
const diagrams = new Map<string, Diagram>();

export function getDiagram(id: string): Diagram | undefined {
  const diagram = diagrams.get(id);
  if (!diagram) return undefined;
  if (new Date(diagram.expiresAt) < new Date()) {
    diagrams.delete(id);
    return undefined;
  }
  return diagram;
}

export function saveDiagram(diagram: Diagram): void {
  diagrams.set(diagram.id, diagram);
}

export function deleteDiagram(id: string): boolean {
  return diagrams.delete(id);
}

export function touchDiagram(id: string): void {
  const diagram = diagrams.get(id);
  if (diagram) {
    diagram.updatedAt = new Date().toISOString();
    diagram.expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
  }
}
