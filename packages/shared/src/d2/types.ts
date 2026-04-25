// Subset of @terrastruct/d2's compile output we rely on. The package is an
// untyped WASM bridge; we keep our consumption surface narrow and defensive.

export interface D2Style {
  fill?: string;
  stroke?: string;
  'stroke-width'?: number | string;
  'stroke-dash'?: number | string;
  'font-color'?: string;
  bold?: boolean;
  italic?: boolean;
  shadow?: boolean;
  opacity?: number | string;
}

export interface D2Shape {
  id: string;
  label?: string;
  type?: string;
  pos?: { x: number; y: number };
  width?: number;
  height?: number;
  style?: D2Style;
  // D2's port-side info when ELK is the layout. Field name is best-effort;
  // we read it through a duck-typed accessor in diagram.ts.
}

export interface D2Connection {
  src: string;
  dst: string;
  label?: string;
  style?: D2Style;
  route?: { x: number; y: number }[];
  srcArrow?: string;
  dstArrow?: string;
}

export interface D2Diagram {
  name?: string;
  shapes?: D2Shape[];
  connections?: D2Connection[];
  width?: number;
  height?: number;
}

export interface D2CompileResult {
  diagram: D2Diagram;
  graph?: unknown;
  options?: unknown;
  fs?: Record<string, string>;
}

export interface D2CompileRequest {
  fs: Record<string, string>;
  inputPath: string;
  options?: { layout?: 'dagre' | 'elk'; sketch?: boolean };
}

export interface D2Module {
  compile(req: D2CompileRequest | string): Promise<D2CompileResult>;
}
