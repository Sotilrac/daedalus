import type { DataSource } from '@daedalus/shared';

export async function readAllD2(source: DataSource): Promise<Record<string, string>> {
  const paths = await source.listD2Files();
  const out: Record<string, string> = {};
  for (const p of paths) out[p] = await source.readFile(p);
  return out;
}
