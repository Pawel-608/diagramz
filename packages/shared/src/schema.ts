import type { ElementType } from "./types.js";

/** Valid element types for validation */
export const ELEMENT_TYPES: ElementType[] = [
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "text",
];

/** Default TTL for diagrams: 30 days in milliseconds */
export const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Maximum elements per diagram */
export const MAX_ELEMENTS = 500;

/** Maximum title length */
export const MAX_TITLE_LENGTH = 200;
