import type { D2ParseError } from '@daedalus/shared/d2';

interface Props {
  errors: D2ParseError[];
  onDismiss?: () => void;
}

export function ErrorOverlay({ errors, onDismiss }: Props): JSX.Element | null {
  if (errors.length === 0) return null;
  return (
    <div className="banner" role="alert">
      <ul className="banner-list">
        {errors.map((e, i) => (
          <li key={i}>
            {e.file ? `${e.file}:${e.line}:${e.column}: ` : ''}
            {e.message}
          </li>
        ))}
      </ul>
      {onDismiss && (
        <button
          type="button"
          className="banner-close"
          aria-label="Dismiss errors"
          title="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
