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
  | 'package'
  | 'page'
  | 'queue'
  | 'step'
  | 'callout'
  | 'person'
  | 'cloud'
  | 'text'
  | 'code'
  | 'class'
  | 'sql_table';

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

// D2's `labelPosition` strings: `<INSIDE|BORDER|OUTSIDE>_<TOP|MIDDLE|BOTTOM>_<LEFT|CENTER|RIGHT>`,
// or `UNSET_LABEL_POSITION`. We keep the raw string so the resolver can map
// every variant without needing the upstream enum.
export type LabelPosition = string;

export interface ModelNode {
  label: string;
  shape: ShapeKind;
  style: NodeStyle;
  rawWidth: number;
  rawHeight: number;
  labelPosition?: LabelPosition;
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

export interface RoutingSettings {
  shapeBuffer: number; // px clearance libavoid keeps from each shape
  leadOut: number; // px the connector leaves perpendicular before bending
  nudging: number; // ideal distance between parallel segments
}

export interface ExportSettings {
  margin: number; // px padding around the diagram bbox
  showGrid: boolean; // include the dot grid in the exported file
}

export interface LayoutSettings {
  routing: RoutingSettings;
  export: ExportSettings;
}

export const DEFAULT_SETTINGS: LayoutSettings = {
  routing: { shapeBuffer: 16, leadOut: 16, nudging: 16 },
  export: { margin: 16, showGrid: false },
};

// `structuredClone` isn't in the shared package's TS lib; LayoutSettings is a
// small fixed shape so a hand-rolled clone is fine.
export function defaultSettings(): LayoutSettings {
  return {
    routing: { ...DEFAULT_SETTINGS.routing },
    export: { ...DEFAULT_SETTINGS.export },
  };
}

export interface Layout {
  version: 1;
  grid: GridConfig;
  viewport: Viewport;
  settings: LayoutSettings;
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
