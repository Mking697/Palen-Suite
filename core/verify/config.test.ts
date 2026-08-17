/**
 * Where the server binds.
 * Run:  node core/verify/config.test.ts
 *
 * This has a test because getting it wrong is invisible: the app starts, the
 * log looks fine, and the host returns 503 with nothing to explain it. That is
 * exactly what the first Hostinger deploy did on 17 August 2026.
 */

import assert from 'node:assert/strict';
import { binding, DEFAULT_PORT } from '../../server/config.ts';

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

t('nothing stated is a desk: localhost, on the usual port', () => {
  const b = binding({});
  assert.equal(b.host, '127.0.0.1');
  assert.equal(b.port, DEFAULT_PORT);
});

t('a platform that supplies a port is proxying, so bind where it can reach', () => {
  const b = binding({ PORT: '38412' });
  assert.equal(b.host, '0.0.0.0', 'binding to localhost here is a 503');
  assert.equal(b.port, 38412);
});

t('HOST stated always wins, in both directions', () => {
  // a host that does set it
  assert.equal(binding({ HOST: '0.0.0.0', PORT: '8080' }).host, '0.0.0.0');
  // and a desk that wants to stay private on a chosen port
  assert.equal(binding({ HOST: '127.0.0.1', PORT: '8080' }).host, '127.0.0.1');
});

t('every binding says why, because that line is what explains a 503', () => {
  for (const env of [{}, { PORT: '8080' }, { HOST: '0.0.0.0' }]) {
    assert.ok(binding(env).reason.length > 10, JSON.stringify(env));
  }
});

console.log(`\n  ${passed} passed\n`);
