/**
 * Claude Code chat transcript backup.
 *
 * Claude Code keeps one .jsonl per session under
 *   %USERPROFILE%\.claude\projects\<slugified-cwd>\<session-id>.jsonl
 * Those live outside the repo, so opening a different folder makes the history
 * look lost even though the file is still there. This copies the raw .jsonl
 * (exact backup) and writes a readable .md next to it.
 *
 *   node tools/chat-backup.ts                     # this project
 *   node tools/chat-backup.ts f:\panel-calculator # another project folder
 *   node tools/chat-backup.ts f--panel-calculator # or its slug directly
 *
 * Output goes to .chat-backup/ (gitignored — transcripts are not source).
 */

import { readdirSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';

/** Claude Code's project folder name: every non-alphanumeric becomes a dash. */
export function slugify(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, '-');
}

const PROJECTS = join(homedir(), '.claude', 'projects');
const OUT = resolve(process.cwd(), '.chat-backup');

/** Tool payloads can be megabytes. The raw .jsonl keeps them in full. */
const MAX_TOOL_CHARS = 1500;

type Block = { type: string; text?: string; thinking?: string; name?: string; input?: unknown; content?: unknown };
type Entry = {
  type?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  summary?: string;
  message?: { role?: string; content?: string | Block[] };
};

const clip = (s: string, n = MAX_TOOL_CHARS) =>
  s.length > n ? `${s.slice(0, n)}\n… [${s.length - n} more chars — see raw/]` : s;

const asText = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v, null, 2) ?? '';

function renderBlock(b: Block): string {
  switch (b.type) {
    case 'text':
      return b.text?.trim() ?? '';
    case 'thinking':
      return `<details><summary>thinking</summary>\n\n${clip(b.thinking ?? '')}\n\n</details>`;
    case 'tool_use':
      return `**→ ${b.name}**\n\n\`\`\`json\n${clip(asText(b.input))}\n\`\`\``;
    case 'tool_result': {
      const c = Array.isArray(b.content)
        ? (b.content as Block[]).map((x) => x.text ?? asText(x)).join('\n')
        : asText(b.content);
      return `<details><summary>result</summary>\n\n\`\`\`\n${clip(c)}\n\`\`\`\n\n</details>`;
    }
    default:
      return `_[${b.type}]_`;
  }
}

/** One .jsonl session -> markdown. Malformed lines are skipped, not fatal. */
export function toMarkdown(jsonl: string, title: string): string {
  const out: string[] = [`# ${title}`, ''];
  let meta = false;
  let turns = 0;

  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let e: Entry;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }

    if (!meta && e.cwd) {
      out.push(`> folder \`${e.cwd}\`${e.gitBranch ? ` · branch \`${e.gitBranch}\`` : ''}`, '');
      meta = true;
    }
    if (e.type === 'summary' && e.summary) {
      out.push(`**Summary:** ${e.summary}`, '');
      continue;
    }
    if (!e.message) continue;

    const role = e.message.role === 'assistant' ? 'Claude' : 'User';
    const when = e.timestamp ? new Date(e.timestamp).toLocaleString('en-GB') : '';
    const body = Array.isArray(e.message.content)
      ? e.message.content.map(renderBlock).filter(Boolean).join('\n\n')
      : (e.message.content ?? '').trim();
    if (!body) continue;

    turns++;
    out.push('---', '', `### ${role}${when ? ` · ${when}` : ''}`, '', body, '');
  }

  out.splice(1, 0, `_${turns} messages_`, '');
  return out.join('\n');
}

function backupProject(slug: string): number {
  const dir = join(PROJECTS, slug);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    console.log(`  ✗ no transcripts for ${slug}`);
    return 0;
  }
  if (files.length === 0) {
    console.log(`  ✗ ${slug} has no .jsonl sessions`);
    return 0;
  }

  const rawDir = join(OUT, slug, 'raw');
  mkdirSync(rawDir, { recursive: true });

  for (const f of files) {
    const src = join(dir, f);
    const kb = Math.round(statSync(src).size / 1024);
    copyFileSync(src, join(rawDir, f));

    const id = basename(f, '.jsonl');
    const md = toMarkdown(readFileSync(src, 'utf8'), `${slug} · session ${id}`);
    writeFileSync(join(OUT, slug, `${id}.md`), md, 'utf8');
    console.log(`  ✓ ${slug}/${id}  (${kb} KB raw + markdown)`);
  }
  return files.length;
}

const args = process.argv.slice(2);
const targets = (args.length ? args : [process.cwd()]).map((a) =>
  // already a slug if it has no path separators
  /[\\/:]/.test(a) ? slugify(resolve(a)) : a,
);

console.log(`\nChat backup -> ${OUT}\n`);
let total = 0;
for (const t of new Set(targets)) total += backupProject(t);
console.log(`\n${total} session(s) backed up.\n`);
