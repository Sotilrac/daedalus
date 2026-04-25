import type { D2ParseError } from '@daedalus/shared/d2';

export function ErrorOverlay({ errors }: { errors: D2ParseError[] }): JSX.Element | null {
  if (errors.length === 0) return null;
  return (
    <div className="banner" role="alert">
      {errors.map((e, i) => (
        <div key={i}>
          {e.file ? `${e.file}:${e.line}:${e.column}: ` : ''}
          {e.message}
        </div>
      ))}
    </div>
  );
}
