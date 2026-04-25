export interface D2ParseError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  raw: string;
}

const PATTERN = /^([^:]+):(\d+):(\d+):\s*(.+)$/;

export function normalizeD2Error(err: unknown): D2ParseError[] {
  const text = err instanceof Error ? err.message : String(err);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): D2ParseError => {
      const m = PATTERN.exec(line);
      if (m && m[1] && m[2] && m[3] && m[4]) {
        return {
          file: m[1],
          line: Number(m[2]),
          column: Number(m[3]),
          message: m[4],
          raw: line,
        };
      }
      return { message: line, raw: line };
    });
}
