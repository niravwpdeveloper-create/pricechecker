// Parses uploaded files and splits them into per-SKU blocks.
// Rule: a block = text beside the SKU + everything below it until the next SKU.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const pdf = require('pdf-parse/lib/pdf-parse.js'), mammoth = require('mammoth'), XLSX = require('xlsx');
const { parse } = require('node-html-parser'), Tesseract = require('tesseract.js');

const UP = path.join(__dirname, 'uploads'), FILES_DIR = path.join(UP, 'files'), MEDIA_DIR = path.join(UP, 'media');
[FILES_DIR, MEDIA_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// "SKU: AB-123", "Item Code ABC123", "Product No. X9" (code must contain a digit)
const LABEL = new RegExp(process.env.SKU_REGEX || String.raw`\b(?:SKU|Item\s*(?:Code|No\.?)|Product\s*(?:Code|No\.?)|Model\s*No\.?)\s*[:#.\-]?\s*((?=[A-Za-z0-9\-_\/.]*\d)[A-Za-z0-9](?:[A-Za-z0-9\-_\/.]*[A-Za-z0-9])?)`, 'i');
const BARE = /^\s*([A-Za-z]{1,6}[-_]?\d[A-Za-z0-9\-_\/]*)\b/; // fallback: line starting with a code
const HEAD = /^\s*(sku|item\s*code|product\s*code|code|item\s*no\.?|model\s*no\.?)\s*$/i;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const m1 = l => { const m = LABEL.exec(l); return m && { sku: m[1], rest: (l.slice(0, m.index) + ' ' + l.slice(m.index + m[0].length)).replace(/^[\s:\-–|]+/, '').trim() }; };
const m2 = l => { const m = BARE.exec(l); return m && { sku: m[1], rest: l.slice(m[0].length).replace(/^[\s:\-–|]+/, '').trim() }; };
const pick = lines => (lines.some(l => m1(l)) ? m1 : m2);
const nb = (sku, page) => ({ sku, page, lines: [], extra: [], html: '', images: [], videos: [], links: [] });

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
function finish(blocks) {
  return blocks.map(b => {
    const text = b.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    ((text + ' ' + b.extra.join(' ')).match(URL_RE) || []).forEach(u => {
      u = u.replace(/[.,;]+$/, '');
      if (/youtube\.com|youtu\.be|vimeo\.com|\.(mp4|webm|ogg|mov)(\?|$)/i.test(u)) b.videos.push(u);
      else if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u)) b.images.push(u);
      else b.links.push(u);
    });
    return { sku: b.sku, page: b.page, text, html: b.html, images: [...new Set(b.images)], videos: [...new Set(b.videos)], links: [...new Set(b.links)] };
  });
}

function fromLines(items) { // items: [{t, page}]
  const m = pick(items.map(i => i.t)), out = []; let cur = null;
  for (const { t, page } of items) {
    const r = m(t);
    if (r) { cur = nb(r.sku, page); out.push(cur); if (r.rest) cur.lines.push(r.rest); }
    else if (cur) cur.lines.push(t.trimEnd());
  }
  return out;
}

async function pdfLines(file) {
  const pages = [];
  await pdf(fs.readFileSync(file), {
    pagerender: p => p.getTextContent().then(tc => {
      let last, s = '';
      for (const it of tc.items) { s += last === undefined || last === it.transform[5] ? it.str : '\n' + it.str; last = it.transform[5]; }
      pages.push(s); return s;
    })
  });
  return pages.flatMap((s, i) => s.split('\n').map(t => ({ t, page: i + 1 })));
}

async function docx(file, prefix) {
  let n = 0;
  const { value } = await mammoth.convertToHtml({ path: file }, {
    convertImage: mammoth.images.imgElement(img => img.read().then(buf => {
      const name = `${prefix}${n++}.${(img.contentType.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
      fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
      return { src: '/uploads/media/' + name };
    }))
  });
  const els = [];
  parse(value).childNodes.forEach(nd => {
    const tag = (nd.rawTagName || '').toLowerCase();
    if (tag === 'table') nd.querySelectorAll('tr').forEach(el => els.push({ el, wrap: 'tr' }));
    else if (tag === 'ul' || tag === 'ol') nd.querySelectorAll('li').forEach(el => els.push({ el, wrap: tag }));
    else els.push({ el: nd });
  });
  const texts = els.map(({ el, wrap }) => wrap === 'tr' ? el.querySelectorAll('td,th').map(c => c.text.trim()).join(' | ') : el.text);
  const m = pick(texts), out = []; let cur = null;
  els.forEach(({ el, wrap }, i) => {
    const r = m(texts[i]);
    if (r) { cur = nb(r.sku); out.push(cur); if (r.rest) cur.lines.push(r.rest); }
    else if (cur) cur.lines.push(texts[i]);
    if (!cur) return;
    const h = el.outerHTML || el.toString();
    cur.html += wrap === 'tr' ? `<table>${h}</table>` : wrap ? `<${wrap}>${h}</${wrap}>` : h;
    el.querySelectorAll?.('img').forEach(im => cur.images.push(im.getAttribute('src')));
    el.querySelectorAll?.('a').forEach(a => a.getAttribute('href') && cur.extra.push(a.getAttribute('href')));
  });
  return out;
}

function sheet(file) {
  const wb = XLSX.readFile(file), out = [], lines = [];
  wb.SheetNames.forEach(sn => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
    const hi = rows.findIndex(r => r.some(c => HEAD.test(String(c))));
    if (hi < 0) return rows.forEach(r => lines.push({ t: r.filter(c => String(c).trim() !== '').join(' | ') }));
    const H = rows[hi].map(String), sc = H.findIndex(c => HEAD.test(c)); let cur = null;
    rows.slice(hi + 1).forEach(r => {
      const s = String(r[sc] || '').trim();
      if (s) { cur = nb(s); out.push(cur); }
      if (!cur) return;
      const kv = H.map((h, i) => (i !== sc && String(r[i] ?? '').trim() ? [h || 'Column ' + (i + 1), String(r[i])] : null)).filter(Boolean);
      kv.forEach(([h, v]) => cur.lines.push(`${h}: ${v}`));
      cur.html += kv.map(([h, v]) => `<tr><th>${esc(h)}</th><td>${esc(v)}</td></tr>`).join('');
    });
  });
  out.forEach(b => b.html && (b.html = `<table>${b.html}</table>`));
  return out.concat(lines.length ? fromLines(lines) : []);
}

async function ocr(file) {
  const { data } = await Tesseract.recognize(file, 'eng');
  const bl = fromLines(data.text.split('\n').map(t => ({ t })));
  bl.forEach(b => b.images.push('/uploads/files/' + path.basename(file)));
  return bl;
}

const cdr = file => new Promise((res, rej) => {
  const out = file + '.pdf';
  execFile(process.env.INKSCAPE_PATH || 'inkscape', [file, '--export-type=pdf', '--export-filename=' + out], { timeout: 120000 },
    e => (e || !fs.existsSync(out) ? rej(new Error('CDR conversion failed. Install Inkscape 1.x (set INKSCAPE_PATH) and make sure the file is a valid CorelDRAW file.')) : res(out)));
});

async function extract(file, ext, prefix) {
  let b;
  switch (ext) {
    case '.pdf': b = fromLines(await pdfLines(file)); break;
    case '.docx': b = await docx(file, prefix); break;
    case '.xlsx': case '.xls': case '.csv': b = sheet(file); break;
    case '.txt': b = fromLines(fs.readFileSync(file, 'utf8').split(/\r?\n/).map(t => ({ t }))); break;
    case '.jpg': case '.jpeg': case '.png': b = await ocr(file); break;
    case '.cdr': b = fromLines(await pdfLines(await cdr(file))); break;
    default: throw new Error('Unsupported file type');
  }
  return finish(b);
}
module.exports = { extract, FILES_DIR, MEDIA_DIR };
