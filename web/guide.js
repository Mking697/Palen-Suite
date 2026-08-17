/**
 * The guide page — `GUIDE.md`, rendered.
 *
 * There is deliberately no second copy of the instructions. Two sets of the
 * same instructions drift apart, and the one that gets read is the one on the
 * screen, so the file the repo already keeps is the one shown here. The server
 * hands the file over at `/api/guide` and this turns it into HTML.
 *
 * It is a small Markdown subset — headings, tables, lists, quotes, fenced code
 * and inline marks — which is all `GUIDE.md` uses. No dependency, the same rule
 * the rest of the app follows.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);

/**
 * GitHub's own heading slug, so the contents table at the top of GUIDE.md
 * links to the right section without the file having to state ids.
 * Each space becomes its own hyphen — that is why `A — B` gives `a--b`.
 */
const slug = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/ /g, '-');

/**
 * The stand-in a code span leaves behind while the other marks are applied.
 * It has to be something the guide's own text can never contain — a bare
 * number would collide with every `102 mm` on the page — so it is a control
 * character, spelt out rather than typed.
 */
const HOLD = String.fromCharCode(0);
const HELD = new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g');

/**
 * Inline marks, applied to text that is already HTML-escaped.
 *
 * Code spans are lifted out first and put back last, so a `**` inside one is
 * printed rather than read as bold.
 */
function inline(s) {
  const codes = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `${HOLD}${codes.length - 1}${HOLD}`;
  });
  t = t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t.replace(HELD, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (row) =>
  row
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

const isDivider = (row) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(row) && row.includes('-');

/** Markdown to HTML. Called again on its own for the inside of a quote. */
function render(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code — taken verbatim, marks and all
    if (line.startsWith('```')) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6}) +(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      out.push(`<h${level} id="${slug(text)}">${inline(esc(text))}</h${level}>`);
      i++;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    // table: a row of cells, then the divider under it
    if (line.trim().startsWith('|') && isDivider(lines[i + 1] ?? '')) {
      const head = cells(line.trim());
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(cells(lines[i].trim()));
        i++;
      }
      const th = head.map((c) => `<th>${inline(esc(c))}</th>`).join('');
      const tr = body
        .map((row) => `<tr>${row.map((c) => `<td>${inline(esc(c))}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="scroller"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
      continue;
    }

    // quote — rendered by the same function, so a quote can hold anything
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        body.push(lines[i].replace(/^> ?/, ''));
        i++;
      }
      out.push(`<blockquote>${render(body.join('\n'))}</blockquote>`);
      continue;
    }

    const bullet = /^[-*] +/;
    const number = /^\d+\. +/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = number.test(line);
      const mark = ordered ? number : bullet;
      const items = [];
      while (i < lines.length && mark.test(lines[i])) {
        // a wrapped item carries on while the next line is indented
        const item = [lines[i].replace(mark, '')];
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !mark.test(lines[i].trim())) {
          item.push(lines[i].trim());
          i++;
        }
        items.push(`<li>${inline(esc(item.join(' ')))}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    // anything else is a paragraph, up to the next blank line
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^([#>`|-]|\d+\. )/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (!para.length) {
      // a line that looked like a block but started none — keep it as text
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
  }

  return out.join('\n');
}

const body = document.getElementById('guide');

fetch('/api/guide')
  .then((r) => {
    if (!r.ok) throw new Error(`the server returned ${r.status}`);
    return r.text();
  })
  .then((md) => {
    body.innerHTML = render(md);
    // a link into the page from a fresh load has to be jumped to by hand,
    // because the content arrives after the browser has looked for the anchor
    if (location.hash) {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    }
  })
  .catch((err) => {
    body.innerHTML =
      `<p class="muted">The guide could not be loaded — ${esc(String(err.message))}. ` +
      `It is the file <code>GUIDE.md</code> in the repository.</p>`;
  });
