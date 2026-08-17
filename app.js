/**
 * Entry point for a host that wants a `.js` file to start.
 *
 * Everything is in `app.cjs` — deliberately CommonJS, because an app server
 * that loads an entry point with `require()` cannot load an ES module, and that
 * failure happens before any of our code can say so. This one line means both
 * `app.js` and `app.cjs` work as the entry file, so which one a host is
 * pointed at can never be the reason it does not start.
 *
 * See `app.cjs` for what it writes to `startup.log`, and DEPLOY.md for the
 * three failed deploys that made that necessary.
 */

import './app.cjs';
