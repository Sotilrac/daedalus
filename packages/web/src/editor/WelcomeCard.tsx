import { DISPLAY_NAME, VERSION_LABEL } from '../branding.js';
import { onExternalLink } from '../util/openExternal.js';

const RELEASES_URL = 'https://github.com/Sotilrac/daedalus/releases';
const SOURCE_URL = 'https://gitlab.com/sotilrac/daedalus';

// Pure-presentation card used both as the home-page empty state and as an
// overlay when the user clicks the bottom-left brand while a project is open.
// The wrapper around it (empty-state vs welcome-overlay) is the caller's job.
export function WelcomeCard(): JSX.Element {
  return (
    <article className="welcome-card">
      <header className="welcome-header">
        <h1 className="welcome-name">{DISPLAY_NAME}</h1>
        <p className="welcome-tagline">Artfully customize your D2 layouts</p>
      </header>
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
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="View releases on GitHub"
          onClick={onExternalLink(RELEASES_URL)}
        >
          {VERSION_LABEL}
        </a>
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
