import { useUpdaterStore, type UpdateStatus } from './updater.js';
import { onExternalLink } from './openExternal.js';

const RELEASES_URL = 'https://github.com/Sotilrac/daedalus/releases';

// Pill rendered next to the version label when the updater plugin reports a
// new release. Click triggers an in-app download + relaunch; while a download
// is in progress the pill becomes a status readout. Errors fall through to
// "Open in browser" so the user always has an escape hatch.
export function UpdateIndicator(): JSX.Element | null {
  const status = useUpdaterStore((s) => s.status);
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);

  if (!shouldRender(status)) return null;

  if (status.kind === 'available') {
    return (
      <button
        type="button"
        className="update-pill"
        title={`Download and install v${status.version}`}
        onClick={() => {
          void downloadAndInstall();
        }}
      >
        Update to v{status.version}
      </button>
    );
  }
  if (status.kind === 'downloading') {
    const pct =
      status.total && status.total > 0
        ? Math.min(100, Math.round((status.downloaded / status.total) * 100))
        : null;
    return (
      <span className="update-pill update-pill-progress" aria-live="polite">
        Downloading{pct !== null ? ` ${pct}%` : ''}…
      </span>
    );
  }
  if (status.kind === 'installing') {
    return (
      <span className="update-pill update-pill-progress" aria-live="polite">
        Installing…
      </span>
    );
  }
  // Error: surface a fallback link so the user can grab the release manually.
  return (
    <a
      className="update-pill update-pill-error"
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={status.kind === 'error' ? status.message : 'Open releases page'}
      onClick={onExternalLink(RELEASES_URL)}
    >
      Update check failed
    </a>
  );
}

function shouldRender(status: UpdateStatus): boolean {
  return (
    status.kind === 'available' ||
    status.kind === 'downloading' ||
    status.kind === 'installing' ||
    status.kind === 'error'
  );
}
