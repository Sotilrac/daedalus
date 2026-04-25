import type { D2CompileResult, D2Module } from './types.js';
import { normalizeD2Error, type D2ParseError } from './errors.js';

let modulePromise: Promise<D2Module> | null = null;

async function getD2(): Promise<D2Module> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = (await import('@terrastruct/d2')) as { D2: new () => D2Module };
      return new mod.D2();
    })();
  }
  return modulePromise;
}

export interface CompileOk {
  ok: true;
  result: D2CompileResult;
}

export interface CompileFail {
  ok: false;
  errors: D2ParseError[];
}

export type CompileOutcome = CompileOk | CompileFail;

export interface CompileInput {
  files: Record<string, string>;
  inputPath: string;
  layout?: 'dagre' | 'elk';
}

export async function compileD2({
  files,
  inputPath,
  layout = 'elk',
}: CompileInput): Promise<CompileOutcome> {
  const d2 = await getD2();
  try {
    const result = await d2.compile({
      fs: files,
      inputPath,
      options: { layout },
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, errors: normalizeD2Error(err) };
  }
}
