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
  | 'sql_table'
  | 'image';

export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: number;
  fontColor?: string;
  fontSize?: number;
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
  // D2 supports `style.bold` and `style.italic` on connections too; we now
  // pass them through so edge labels respect the same typography flags as
  // node labels.
  bold?: boolean;
  italic?: boolean;
  // D2's `style.animated: true` produces marching-ants on the edge stroke.
  // The renderer turns this into a CSS keyframe animation on
  // `stroke-dashoffset`.
  animated?: boolean;
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
  // For shape: image — the `icon` path D2 emitted, kept verbatim. The
  // renderer (web layer) is responsible for resolving it relative to the
  // active project folder and turning it into something <image> can load.
  imageSrc?: string;
}

// D2's arrowhead palette. Mirrors the @terrastruct/d2 `Arrowhead` union.
export type Arrowhead =
  | 'none'
  | 'arrow'
  | 'triangle'
  | 'unfilled-triangle'
  | 'diamond'
  | 'filled-diamond'
  | 'circle'
  | 'filled-circle'
  | 'box'
  | 'filled-box'
  | 'line'
  | 'cf-one'
  | 'cf-many'
  | 'cf-one-required'
  | 'cf-many-required';

export interface ModelEdge {
  from: NodeId;
  to: NodeId;
  label?: string;
  style: EdgeStyle;
  // D2's arrowhead at each endpoint. Missing means D2 didn't emit one
  // (typically only `dstArrow` is set for plain `->` edges).
  srcArrow?: Arrowhead;
  dstArrow?: Arrowhead;
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
  // Position of the label along the route's arc length, 0..1 (0 = at the
  // source pin, 1 = at the destination pin). Default 0.5 (midpoint).
  // Stored on the layout so a manual drag survives re-routing and is
  // round-tripped through the sidecar.
  labelT?: number;
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
  theme: 'slate' | 'paper';
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
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0, theme: 'slate' };

export function emptyConnections(): Record<Side, EdgeId[]> {
  return { top: [], right: [], bottom: [], left: [] };
}
