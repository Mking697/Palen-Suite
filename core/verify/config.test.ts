/**
 * Where the server binds.
 * Run:  node core/verify/config.test.ts
 *
 * This has a test because getting it wrong is invisible: the app starts, its
 * own log looks fine, and the host returns 503 with nothing to explain it.
 * That is what the first two Hostinger deploys did on 17 August 2026.
 */

import assert from 'node:assert/strict';
import { binding, DEFAULT_PORT, environmentReport } from '../../server/config.ts';

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

console.log('\n  where the server listens\n');

t('nothing stated binds where a proxy can reach it', () => {
  // the environment is exactly what cannot be relied on when a deploy fails,
  // so the default is what is right for a server
  const b = binding({});
  assert.equal(b.host, '0.0.0.0');
  assert.equal(b.port, DEFAULT_PORT);
});

t('--local is a desk, and that is how npm run dev starts', () => {
  assert.equal(binding({}, ['--local']).host, '127.0.0.1');
  assert.equal(binding({ PORT: '8080' }, ['--local']).port, 8080, 'still takes the port');
});

t('HOST stated wins over the default, in both directions', () => {
  assert.equal(binding({ HOST: '0.0.0.0' }).host, '0.0.0.0');
  assert.equal(binding({ HOST: '127.0.0.1' }).host, '127.0.0.1');
});

t('--local wins over HOST, because it is the more specific instruction', () => {
  assert.equal(binding({ HOST: '0.0.0.0' }, ['--local']).host, '127.0.0.1');
});

t('a platform port is used as given', () => {
  assert.equal(binding({ PORT: '38412' }).port, 38412);
});

t('every binding says why, because that line is what explains a 503', () => {
  for (const [env, argv] of [[{}, []], [{ HOST: '0.0.0.0' }, []], [{}, ['--local']]] as const) {
    assert.ok(binding(env, argv).reason.length > 10, JSON.stringify([env, argv]));
  }
});

console.log('\n  what the environment gave us\n');

t('the report states the four that matter, set or not', () => {
  const lines = environmentReport({ PORT: '38412' }).join('\n');
  assert.ok(lines.includes('PORT = 38412'));
  assert.ok(lines.includes('HOST = (not set)'), 'an absent one has to say so');
  assert.ok(lines.includes('NODE_ENV = (not set)'));
});

t('any other port-like name is named but not printed', () => {
  const lines = environmentReport({ APP_PORT: '9001', SECRET: 'x' }).join('\n');
  assert.ok(lines.includes('APP_PORT'), 'a platform may say "listen here" some other way');
  assert.ok(!lines.includes('9001'), 'values that are not ours are not printed');
  assert.ok(!lines.includes('SECRET'), 'and nothing unrelated is listed at all');
});

console.log(`\n  ${passed} passed\n`);
