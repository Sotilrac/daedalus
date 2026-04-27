import { openUrl } from '@tauri-apps/plugin-opener';

// Tauri's webview ignores `target="_blank"` and `window.open` — clicks on a
// plain `<a>` either no-op or try to navigate the embedded view. Route the
// click through the opener plugin so the URL launches in the user's actual
// browser. Use this on `<a>` onClick handlers; keep the `href` so middle-click,
// "copy link", and accessibility tooling continue to see the real URL.
export function onExternalLink(href: string): (e: React.MouseEvent) => void {
  return (e) => {
    e.preventDefault();
    void openUrl(href);
  };
}
