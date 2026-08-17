/**
 * Compile the app to plain JavaScript in `dist/`, with no dependencies.
 *
 * Why this exists: the app normally has no build step, because Node runs the
 * TypeScript directly. That is the one exotic thing about it, and it is what a
 * shared host cannot be relied on to support — the host may build with one Node
 * and *start* the app with another, and an older one throws
 * `Unknown file extension ".ts"` before a single line of ours runs. On
 * Hostinger that produced a 503 with an empty runtime log, which is the worst
 * kind of failure: nothing to read anywhere.
 *
 * After this, `dist/` contains no TypeScript at all and any Node can run it.
 *
 * **Still no dependencies.** Node strips the types itself, through
 * `module.stripTypeScriptTypes`. It replaces annotations with whitespace rather
 * than reformatting, so line numbers survive and a stack trace from the built
 * app still points at the right line of the source.
 *
 * What it cannot do: anything that is not erasable — enums, namespaces,
 * parameter properties. The repo cannot use those anyway, because Node's own
 * runtime stripping forbids them, so this is not a new restriction.
 *
 * Run:  npm run build
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'dist');

/** Compiled to JavaScript, keeping the tree shape. */
const CODE_DIRS = ['core', 'server'];

/** Copied as they are — the app reads these at runtime. */
const ASSET_DIRS = ['web', 'legacy'];
const ASSET_FILES = ['GUIDE.md', 'package.json'];

/** Not shipped: the verifier's fixtures and tests are not part of the app. */
const skip = (rel: string) => rel.includes('verify');

/** Every file under a directory, recursively, as paths relative to ROOT. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * An import of `./x.ts` has to become `./x.js`, because that is the file that
 * will be there. Only relative specifiers are touched — `node:fs` and the like
 * are left exactly as they are.
 */
function rewriteSpecifiers(code: string): string {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+?)\.ts\2/g,
    (_m, lead, quote, path) => `${lead}${quote}${path}.js${quote}`,
  );
}

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let compiled = 0;
  for (const dir of CODE_DIRS) {
    for (const rel of await walk(dir)) {
      if (skip(rel)) continue;
      const source = await readFile(join(ROOT, rel), 'utf8');

      if (extname(rel) !== '.ts') {
        // a .js or an asset sitting among the code, copied through
        const target = join(OUT, rel);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source);
        continue;
      }

      const stripped = rewriteSpecifiers(
        stripTypeScriptTypes(source, { mode: 'strip' }),
      );
      const target = join(OUT, rel.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, stripped);
      compiled++;
    }
  }

  for (const dir of ASSET_DIRS) {
    await cp(join(ROOT, dir), join(OUT, dir), { recursive: true });
  }
  for (const file of ASSET_FILES) {
    await cp(join(ROOT, file), join(OUT, file));
  }

  /*
   * The entry point, plain JavaScript, importing plain JavaScript. A host can
   * be pointed at `dist/app.js` and nothing about the way it starts the app or
   * which Node it uses can break it.
   */
  await writeFile(
    join(OUT, 'app.js'),
    `/* Built by tools/build.ts — do not edit. Plain JavaScript, so any Node runs it. */\n` +
      `import './server/serve.js';\n`,
  );

  // proof, rather than a claim: nothing TypeScript may remain in dist
  const left = (await walk(relative(ROOT, OUT))).filter((f) => f.endsWith('.ts'));
  if (left.length) {
    throw new Error(`dist still has TypeScript in it: ${left.join(', ')}`);
  }

  console.log(`\n  built dist/ — ${compiled} files compiled, no TypeScript left`);
  console.log(`  start it with:  node dist/app.js\n`);
}

await build();
