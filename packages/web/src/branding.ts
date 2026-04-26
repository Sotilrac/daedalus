// The display-name spelling of "Daedalus" used in user-facing chrome (welcome
// card, brand floating). Native window title and bundle metadata stay ASCII.
export const DISPLAY_NAME = 'Δαeδαluς';

// Version label rendered in the UI. The `-dev` suffix on dev builds (Vite
// `dev` server, including the `tauri dev` flow) makes it obvious at a glance
// whether the running app is a release build or a local hack session.
export const VERSION_LABEL = `v${__APP_VERSION__}${import.meta.env.DEV ? '-dev' : ''}`;
