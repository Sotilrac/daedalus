export type NodeId = string;
export type EdgeId = string;
export type Side = 'top' | 'right' | 'bottom' | 'left';

export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'] as const;

export type ShapeKind =
  | 'rectangle'
  | 'square'
  | 'circle'
  | 'oval'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'cylinder'
  | 'document'
  | 'stored_data'
  | 'package';

export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  shadow?: boolean;
  opacity?: number;
}

export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: number;
  fontColor?: string;
  opacity?: number;
}

export interface ModelNode {
  label: string;
  shape: ShapeKind;
  style: NodeStyle;
  rawWidth: number;
  rawHeight: number;
}

export interface ModelEdge {
  from: NodeId;
  to: NodeId;
  label?: string;
  style: EdgeStyle;
}

export interface Model {
  nodes: Record<NodeId, ModelNode>;
  edges: Record<EdgeId, ModelEdge>;
}

export interface Point {
  x: number;
  y: number;
}

export interface NodeLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  connections: Record<Side, EdgeId[]>;
}

export interface EdgeLayout {
  fromSide: Side;
  toSide: Side;
}

export interface GridConfig {
  size: number;
  cols: number;
  rows: number;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
  theme: 'blueprint' | 'paper';
}

export interface Layout {
  version: 1;
  grid: GridConfig;
  viewport: Viewport;
  nodes: Record<NodeId, NodeLayout>;
  edges: Record<EdgeId, EdgeLayout>;
  unplaced: NodeId[];
}

export type EdgeRoute = readonly Point[];
export type EdgeRoutes = Record<EdgeId, EdgeRoute>;

export const DEFAULT_GRID: GridConfig = { size: 16, cols: 80, rows: 50 };
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0, theme: 'blueprint' };

export function emptyConnections(): Record<Side, EdgeId[]> {
  return { top: [], right: [], bottom: [], left: [] };
}
