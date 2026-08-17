/**
 * Entry point for a host that wants a `.js` file to start.
 *
 * It prefers a build if there is one. `dist/` is plain JavaScript with no
 * TypeScript left in it, so nothing about which Node the host uses, or how it
 * starts the app, can break it. That matters because a host may build with one
 * Node and start the app with another — on Hostinger the older runtime threw
 * `Unknown file extension ".ts"` before a line of ours ran, and with stdout not
 * captured the result was a 503 and an empty log. See DEPLOY.md.
 *
 * With no build it falls back to running the TypeScript directly, which is how
 * a desk runs it, and then the Node version does matter — so it is checked, and
 * the fix printed, rather than left to that same unreadable failure.
 *
 * Started this way the app binds every interface, which is what a host behind a
 * proxy needs; `npm run dev` passes `--local` to stay on this machine. See
 * server/config.ts for the rule and what the failed deploys taught it.
 */

import { existsSync } from 'node:fs';

const built = new URL('./dist/server/serve.js', import.meta.url);

if (existsSync(built)) {
  console.log('  starting the built copy in dist/ — plain JavaScript');
  await import(built.href);
} else {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const atLeast = (wantMajor, wantMinor) =>
    major > wantMajor || (major === wantMajor && minor >= wantMinor);

  /**
   * From 22.18 and on 23+, Node strips types on its own and reports it here.
   * On 22.6–22.17 it needs --experimental-strip-types, and this is undefined.
   */
  const stripsTypes = process.features.typescript;

  if (!atLeast(22, 6)) {
    console.error(
      `\n  There is no dist/ here, so this runs the TypeScript directly, which` +
        `\n  needs Node 22.6 or newer. This is Node ${process.versions.node}.` +
        `\n` +
        `\n  Either pick a newer Node in the host's settings, or give the host a` +
        `\n  build command of \`npm run build\` — the built copy runs on any Node.` +
        `\n  See DEPLOY.md.\n`,
    );
    process.exit(1);
  }

  if (!stripsTypes && !atLeast(22, 18)) {
    console.error(
      `\n  Node ${process.versions.node} can run this app from source, but only` +
        `\n  with type stripping turned on. Either set` +
        `\n` +
        `\n      NODE_OPTIONS=--experimental-strip-types` +
        `\n` +
        `\n  or give the host a build command of \`npm run build\`, which needs` +
        `\n  nothing. See DEPLOY.md.\n`,
    );
    process.exit(1);
  }

  console.log('  no dist/ — running the TypeScript directly');
  await import('./server/serve.ts');
}
