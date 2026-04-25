declare const __APP_VERSION__: string;
declare const __APP_AUTHOR__: string;

// React 19 dropped the global JSX namespace; re-export so existing return-type
// annotations like `JSX.Element` continue to work without per-file imports.
import type * as React from 'react';
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementType = React.JSX.ElementType;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}
