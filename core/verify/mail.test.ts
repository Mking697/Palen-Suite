/**
 * Email tests — what gets sent, and what is refused before anything is.
 * Run:  node core/verify/mail.test.ts
 *
 * `server/mail.ts` is impure at the edge — one `fetch` to Brevo — but the
 * decisions around it are not, and those are what this covers: which addresses
 * were meant, what is wrong with a request, and the exact JSON Brevo is handed.
 * The send itself is one line and needs a network; everything that decides
 * whether it should happen is here.
 *
 * The rule worth stating: **the estimator is always the Reply-To.** The From
 * may have to be the authenticated domain, because Brevo will not send as an
 * address it cannot prove the sender owns — but a customer must always be able
 * to reply to a person.
 */

import assert from 'node:assert/strict';
import {
  badAddresses,
  brevoBody,
  defaultSubject,
  parseAddresses,
  problemWith,
  type MailRequest,
} from '../../server/mail.ts';

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

const bytes = (n: number) => new Uint8Array(n);

const request = (over: Partial<MailRequest> = {}): MailRequest => ({
  to: ['customer@example.com'],
  subject: 'HI-15191 — drawings and BOQ',
  text: 'Attached.',
  attachments: [{ name: 'HI-15191-BOQ.xlsx', bytes: bytes(64) }],
  ...over,
});

console.log('\n  addresses, as somebody actually types them\n');

t('commas, semicolons and newlines all separate', () => {
  assert.deepEqual(parseAddresses('a@x.com, b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(parseAddresses('a@x.com;b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(parseAddresses('a@x.com\nb@x.com'), ['a@x.com', 'b@x.com']);
});

t('spaces and trailing separators do not become empty recipients', () => {
  // a trailing comma is what a half-finished list looks like, and sending a
  // blank recipient is how Brevo answers with something unreadable
  assert.deepEqual(parseAddresses('  a@x.com ,, b@x.com , '), ['a@x.com', 'b@x.com']);
  assert.deepEqual(parseAddresses(''), []);
  assert.deepEqual(parseAddresses('   '), []);
});

t('what does not look like an address is named', () => {
  assert.deepEqual(badAddresses(['a@x.com', 'not-an-address', 'b@y.co.uk']), ['not-an-address']);
});

console.log('\n  what is refused, and why it says so here\n');

t('no recipient is answered here, not by Brevo', () => {
  // Brevo replies `invalid_parameter`, which says nothing about the empty box
  assert.match(problemWith(request({ to: [] }))!, /Who is it going to/);
});

t('a bad address is named, so the estimator can see which one', () => {
  const said = problemWith(request({ to: ['ok@x.com'], cc: ['oops'] }));
  assert.match(said!, /oops/);
});

t('an empty subject is refused', () => {
  assert.match(problemWith(request({ subject: '   ' }))!, /subject is empty/);
});

t('attachments past the limit are refused with the size and a way round it', () => {
  // checked against the base64 size, which is what actually travels — the raw
  // bytes are a third smaller and would let an over-size message through
  const big = request({ attachments: [{ name: 'big.pdf', bytes: bytes(8 * 1024 * 1024) }] });
  const said = problemWith(big);
  assert.ok(said, '8MB of bytes is over 10MB once base64 encoded');
  assert.match(said!, /10MB/);
  assert.match(said!, /Drive/, 'it should say what to do instead');
});

t('a request with everything in place has nothing wrong with it', () => {
  assert.equal(problemWith(request()), null);
});

console.log('\n  the JSON Brevo is handed\n');

const FALLBACK = 'info@panelsuite.online';

t('the estimator is the Reply-To, whatever the From turns out to be', () => {
  const body = brevoBody(request({ replyTo: 'asha@example.com' }), FALLBACK);
  assert.deepEqual(body.replyTo, { email: 'asha@example.com' });
});

t('an empty From falls back to the authenticated address', () => {
  // Brevo will not send as an address it cannot prove is ours, and
  // panelsuite.online is the one that is authenticated
  assert.deepEqual(brevoBody(request({ from: '' }), FALLBACK).sender, { email: FALLBACK });
  assert.deepEqual(brevoBody(request({ from: '  ' }), FALLBACK).sender, { email: FALLBACK });
});

t('a stated From is used, with the estimator\'s name when there is one', () => {
  const body = brevoBody(request({ from: 'asha@example.com', fromName: 'Asha' }), FALLBACK);
  assert.deepEqual(body.sender, { email: 'asha@example.com', name: 'Asha' });
});

t('CC and BCC are left out entirely when empty, not sent as empty lists', () => {
  const bare = brevoBody(request(), FALLBACK) as Record<string, unknown>;
  assert.ok(!('cc' in bare), 'an empty cc must not be sent');
  assert.ok(!('bcc' in bare), 'an empty bcc must not be sent');

  const both = brevoBody(request({ cc: ['a@x.com'], bcc: ['b@x.com'] }), FALLBACK);
  assert.deepEqual(both.cc, [{ email: 'a@x.com' }]);
  assert.deepEqual(both.bcc, [{ email: 'b@x.com' }]);
});

t('attachments go as base64, under the name the export gave them', () => {
  const body = brevoBody(
    request({ attachments: [{ name: 'HI-15191-BOQ.xlsx', bytes: new Uint8Array([80, 75, 3, 4]) }] }),
    FALLBACK,
  );
  assert.equal(body.attachment.length, 1);
  assert.equal(body.attachment[0]!.name, 'HI-15191-BOQ.xlsx');
  // `PK\x03\x04` — the zip signature every .xlsx starts with
  assert.equal(body.attachment[0]!.content, Buffer.from([80, 75, 3, 4]).toString('base64'));
});

t('the body is sent as typed, as plain text', () => {
  const typed = 'Line one.\n\nLine two — with a dash.';
  assert.equal(brevoBody(request({ text: typed }), FALLBACK).textContent, typed);
});

t('the subject leads with the job number', () => {
  // it is what a customer replies about, and what anyone searching a mailbox
  // six months later types
  assert.equal(defaultSubject('HI-15191'), 'HI-15191 — drawings and BOQ');
  assert.equal(defaultSubject('  '), 'Panel Suite — drawings and BOQ');
});

console.log(`\n  ${passed} passed\n`);
