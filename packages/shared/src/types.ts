/** Supported diagram element types */
export type ElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "text";

/** A single element on the diagram canvas */
export interface DiagramElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  strokeColor?: string;
  backgroundColor?: string;
  /** For arrows/lines: the element ID this connects from */
  startBinding?: string;
  /** For arrows/lines: the element ID this connects to */
  endBinding?: string;
}

/** A complete diagram */
export interface Diagram {
  id: string;
  title?: string;
  elements: DiagramElement[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/** POST /api/diagrams request body */
export interface CreateDiagramRequest {
  title?: string;
  /** Natural language prompt for AI generation */
  prompt?: string;
  /** Or provide elements directly */
  elements?: DiagramElement[];
}

/** POST /api/diagrams response */
export interface CreateDiagramResponse {
  id: string;
  url: string;
  editUrl: string;
  diagram: Diagram;
}

/** PATCH /api/diagrams/:id request body */
export interface UpdateDiagramRequest {
  title?: string;
  elements?: DiagramElement[];
}
