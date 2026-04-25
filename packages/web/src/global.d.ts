// Once this file imports anything it becomes a module, so all global
// declarations have to live inside `declare global`.

import type * as React from 'react';

declare global {
  const __APP_VERSION__: string;
  const __APP_AUTHOR__: string;

  // React 19 dropped the global JSX namespace; re-export so existing
  // return-type annotations like `JSX.Element` keep working.
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementType = React.JSX.ElementType;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}

export {};
