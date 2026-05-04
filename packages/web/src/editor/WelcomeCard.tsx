import { useEffect, useRef, useState } from 'react';
import { DISPLAY_NAME, VERSION_LABEL } from '../branding.js';
import { onExternalLink } from '../util/openExternal.js';
import { UpdateIndicator } from '../util/UpdateIndicator.js';
import { useUpdaterStore } from '../util/updater.js';

const SOURCE_URL = 'https://gitlab.com/sotilrac/daedalus';

// Pure-presentation card used both as the home-page empty state and as an
// overlay when the user clicks the bottom-left brand while a project is open.
// The wrapper around it (empty-state vs welcome-overlay) is the caller's job.
export function WelcomeCard(): JSX.Element {
  const status = useUpdaterStore((s) => s.status);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  // Local flag so a click-driven `up-to-date` flashes briefly, while the
  // mount-time auto-check (which leaves the store in `up-to-date` for the
  // session) doesn't permanently freeze the version button on that label.
  const [showCheckResult, setShowCheckResult] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  const onClickVersion = (): void => {
    setShowCheckResult(true);
    void checkForUpdate();
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setShowCheckResult(false), 2500);
  };

  const isChecking = status.kind === 'checking';
  const versionLabel = isChecking
    ? 'Checking…'
    : showCheckResult && status.kind === 'up-to-date'
      ? 'Up to date'
      : VERSION_LABEL;

  return (
    <article className="welcome-card">
      <header className="welcome-header">
        <h1 className="welcome-name">{DISPLAY_NAME}</h1>
        <p className="welcome-tagline">Artfully customize your D2 layouts</p>
      </header>
      <UpdateIndicator />
      <section>
        <h2>Get started</h2>
        <p>
          Create a new project or open an existing folder of <code>.d2</code> files.
        </p>
        <p>
          The folder must contain <code>index.d2</code>; in turn, it can import other{' '}
          <code>.d2</code> files in the folder.
        </p>
        <p>
          As you edit, your custom layout is automatically saved alongside as{' '}
          <code>.daedalus.json</code>; D2 file changes are tracked live.
        </p>
      </section>
      <section>
        <h2>What you can do</h2>
        <ul className="welcome-features">
          <li>Drag, drop, and resize nodes on the grid</li>
          <li>Move connections to any side of a node</li>
          <li>Click on multiple nodes to select them</li>
          <li>Export to SVG or PNG when you&apos;re done</li>
        </ul>
      </section>
      <footer className="welcome-footer">
        <button
          type="button"
          className="welcome-version"
          title="Check for updates"
          onClick={onClickVersion}
          disabled={isChecking}
        >
          {versionLabel}
        </button>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onExternalLink(SOURCE_URL)}
        >
          View source on GitLab
        </a>
      </footer>
    </article>
  );
}
