// Turns site content into retrieval chunks.
// Shared by the build (src/pages/ask-index.json.ts) and the evals (scripts/ask/eval.mjs),
// so the index that is tested is the index that ships.

const MAX_WORDS = 220; // split sections longer than this at paragraph breaks
const MIN_WORDS = 30; // merge sections shorter than this into the next piece

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => (s.match(/\S+/g) || []).length;

/** Same algorithm Astro uses for heading ids (github-slugger), without the duplicate counter. */
export function slugify(heading) {
  return plain(heading)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Markdown to plain text, for scoring and snippets. */
export function plain(md) {
  return md
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keep markdown links (the model cites them) but drop images and raw HTML. */
function clean(md) {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLong(text) {
  if (words(text) <= MAX_WORDS) return [text];
  const out = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n/)) {
    if (cur && words(cur) + words(para) > MAX_WORDS) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

function sections(body) {
  const out = [];
  let h2 = '';
  let heading = '';
  let buf = [];
  let inCode = false;
  const flush = () => {
    const text = clean(buf.join('\n'));
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) inCode = !inCode;
    const m = !inCode && line.match(/^(#{2,3})\s+(.+?)\s*#*$/);
    if (m) {
      flush();
      const title = plain(m[2]);
      if (m[1].length === 2) {
        h2 = title;
        heading = title;
      } else {
        heading = title;
      }
      out.push({ marker: true, heading, anchor: slugify(m[2]), parent: m[1].length === 3 ? h2 : '' });
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/**
 * @param {Array<{type:string,url:string,title:string,description?:string,summary?:string,body?:string,faqs?:{q:string,a:string}[],lists?:Record<string,string[]>}>} docs
 */
export function buildChunks(docs) {
  const chunks = [];
  for (const doc of docs) {
    const base = { url: doc.url, title: doc.title, type: doc.type };
    const push = (heading, anchor, text) =>
      chunks.push({ id: chunks.length, ...base, heading, anchor, text });

    const intro = [doc.summary, doc.description].filter(Boolean).join(' ');
    const lists = Object.entries(doc.lists || {})
      .filter(([, items]) => items.length)
      .map(([label, items]) => `${label}:\n${items.map((i) => `- ${i}`).join('\n')}`)
      .join('\n\n');
    if (intro || lists) push('', '', [intro, lists].filter(Boolean).join('\n\n'));

    let anchor = '';
    let heading = '';
    let carry = '';
    const headings = new Set();
    for (const s of sections(doc.body || '')) {
      if (s.marker) {
        if (carry) {
          push(heading, anchor, carry);
          carry = '';
        }
        heading = s.parent && s.parent !== s.heading ? `${s.parent}: ${s.heading}` : s.heading;
        anchor = s.anchor;
        headings.add(norm(s.heading));
        continue;
      }
      for (const piece of splitLong(s.text)) {
        // A table of contents repeats every heading and outranks the real sections.
        if (/table of contents$/i.test(heading)) continue;
        const text = carry ? `${carry}\n\n${piece}` : piece;
        if (words(text) < MIN_WORDS) carry = text;
        else {
          push(heading, anchor, text);
          carry = '';
        }
      }
    }
    if (carry) push(heading, anchor, carry);

    // FAQ schema entries repeat the FAQ section of the body word for word; index each once.
    for (const f of doc.faqs || []) {
      const q = norm(f.q);
      if (![...headings].some((h) => h.endsWith(q))) push(f.q, '', f.a);
    }
  }
  return chunks;
}

/** Facts that live in site settings instead of a Markdown page. */
export function extraDocs(site) {
  return [
    {
      type: 'page',
      url: '/contact/',
      title: `Contact ${site.name}`,
      description: `How to contact or hire ${site.name}. Email ${site.email}. LinkedIn: ${site.linkedin}. GitHub: ${site.github}. Based in ${site.location}, working with teams anywhere in the US. Replies within two business days. To start a project, send what you need, your timeline, and your site or product URL.`,
    },
  ];
}
