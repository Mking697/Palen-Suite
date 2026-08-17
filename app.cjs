/**
 * The entry point, and the only thing that can tell us why a host will not
 * start this app.
 *
 * Three deploys to Hostinger returned 503 with its Runtime Logs page saying
 * "No logs found" — no error, no output, nothing, whether the app ran from
 * TypeScript or from a build. An empty log proves nothing about our code: it
 * may mean the process never started, or only that the host does not capture
 * stdout. Those need different fixes, so this writes the same lines to
 * **`startup.log` beside this file**, which can be opened in any file manager.
 *
 * After a deploy, that file answers it:
 *
 *   the file is missing        -> the host never started this process at all,
 *                                 so the fault is the start command or the
 *                                 entry file, not the app
 *   the file is there          -> read it: it states the Node it got, the
 *                                 environment as it arrived, whether a build
 *                                 was found, and the error if there was one
 *
 * It is **CommonJS on purpose**. An app server that loads an entry point with
 * `require()` cannot load an ES module, and that failure happens before any of
 * our code — including any logging — can run. `app.js` is one line that imports
 * this, so both entry file names work and neither can be the problem.
 */

'use strict';

const { appendFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const HERE = __dirname;
const LOG = join(HERE, 'startup.log');

/** Say it to stdout for a host that captures it, and to disk for one that does not. */
function say(line) {
  const stamped = `${new Date().toISOString()}  ${line}`;
  console.log(stamped);
  try {
    appendFileSync(LOG, `${stamped}\n`);
  } catch {
    /* a read-only filesystem is not a reason to fail to start */
  }
}

async function start() {
  say('');
  say('=== Hikom Panel Suite starting ===');
  say(`node ${process.version} · pid ${process.pid}`);
  say(`cwd  ${process.cwd()}`);
  say(`dir  ${HERE}`);
  say(`argv ${process.argv.slice(1).join(' ')}`);
  for (const key of ['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS']) {
    say(`  ${key} = ${process.env[key] === undefined ? '(not set)' : process.env[key]}`);
  }

  const built = join(HERE, 'dist', 'server', 'serve.js');
  const source = join(HERE, 'server', 'serve.ts');
  const haveBuild = existsSync(built);
  say(`dist/ present: ${haveBuild}`);

  if (!haveBuild) {
    // running the TypeScript directly needs a new enough Node; say so here
    // rather than letting it fail as `Unknown file extension ".ts"`
    const [major, minor] = process.versions.node.split('.').map(Number);
    const atLeast = (wantMajor, wantMinor) =>
      major > wantMajor || (major === wantMajor && minor >= wantMinor);
    if (!atLeast(22, 6)) {
      say(`FAILED: no dist/ and Node ${process.versions.node} cannot read TypeScript.`);
      say('        Set the host build command to `npm run build`. See DEPLOY.md.');
      process.exitCode = 1;
      return;
    }
    if (!process.features.typescript && !atLeast(22, 18)) {
      say(`FAILED: Node ${process.versions.node} needs type stripping turned on.`);
      say('        Set NODE_OPTIONS=--experimental-strip-types, or build. See DEPLOY.md.');
      process.exitCode = 1;
      return;
    }
  }

  const target = haveBuild ? built : source;
  say(`importing ${target}`);
  try {
    await import(pathToFileURL(target).href);
    say('import returned — the server should be listening now');
  } catch (err) {
    say(`FAILED to start: ${err && err.message}`);
    for (const line of String((err && err.stack) || '').split('\n').slice(0, 8)) {
      say(`        ${line.trim()}`);
    }
    process.exitCode = 1;
  }
}

start();
