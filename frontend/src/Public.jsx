import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api, useUI, Spinner } from './ui';
import Chatbot from './Chatbot';

const fetchSku = async sku => {
  try { return { sku, entries: (await api('/search?sku=' + encodeURIComponent(sku))).results }; }
  catch { return { sku, entries: [] }; }
};
const abs = u => (/^https?:/.test(u) ? u : location.origin + u);

// Sticky single-SKU search bar (used on both the single and multiple SKU pages)
function SearchBar({ store }) {
  const [sku, setSku] = useState(''), [busy, setBusy] = useState(false);
  const nav = useNavigate(), loc = useLocation(), { toast } = useUI();
  const run = async e => {
    e.preventDefault();
    const s = sku.trim(); if (!s) return toast('Enter a product SKU', 'err');
    setBusy(true); store.add([await fetchSku(s)]); setSku(''); setBusy(false);
    if (loc.pathname === '/multi') nav('/');
  };
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm print:hidden">
      <div className="max-w-6xl mx-auto px-3 py-3 flex flex-wrap items-center gap-2">
        <Link to="/" className="font-bold text-slate-800 w-full sm:w-auto sm:mr-3">Price & Details Checker</Link>
        <form onSubmit={run} className="flex flex-1 min-w-[220px] gap-2">
          <input className="inp" placeholder="Enter Product SKU" value={sku} onChange={e => setSku(e.target.value)} aria-label="Product SKU" />
          <button className="btn" disabled={busy}>{busy ? <Spinner /> : 'Search'}</button>
        </form>
        <Link to="/multi" className="btn-ghost">Add Multiple SKU</Link>
        <Link to="/login" className="btn-ghost">Login</Link>
      </div>
    </header>
  );
}

const embed = u => {
  let m = u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = u.match(/vimeo\.com\/(\d+)/); return m ? 'https://player.vimeo.com/video/' + m[1] : null;
};
const Video = ({ u }) => { const e = embed(u); return e ? <iframe src={e} className="w-full aspect-video rounded" allowFullScreen title="Product video" /> : <video src={u} controls className="w-full rounded" />; };

function Entry({ e, layout }) {
  const imgs = e.images.filter(s => !(e.html || '').includes(s)); // images already inside html are not repeated
  const body = e.html ? <div className="doc" dangerouslySetInnerHTML={{ __html: e.html }} /> : <div className="whitespace-pre-wrap leading-relaxed">{e.text}</div>;
  const hasMedia = imgs.length || e.videos.length;
  const mediaCls = layout === 'horizontal' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : layout === 'vertical' ? 'flex flex-col gap-3' : 'flex flex-wrap gap-3';
  return (
    <article className="border border-slate-200 rounded-lg p-4 break-inside-avoid">
      <div className="flex flex-wrap justify-between gap-2 mb-3">
        <h3 className="font-semibold text-lg">SKU: {e.sku_display}</h3>
        <span className="text-xs text-slate-500">Source: {e.file_title || e.file_name}{' '}
          <a className="underline print:hidden" href={e.source_url} target="_blank" rel="noreferrer">(view original{e.page ? `, page ${e.page}` : ''})</a></span>
      </div>
      <div className={layout === 'horizontal' && hasMedia ? 'grid md:grid-cols-2 gap-4' : 'space-y-4'}>
        {body}
        {hasMedia ? (
          <div className={mediaCls}>
            {imgs.map(s => <a key={s} href={s} target="_blank" rel="noreferrer"><img src={s} alt={'SKU ' + e.sku_display} loading="lazy" className={`rounded border ${layout === 'normal' ? 'max-h-64' : 'w-full'}`} /></a>)}
            {e.videos.map(v => <div key={v} className={layout === 'normal' ? 'w-full sm:w-96' : ''}><Video u={v} /></div>)}
          </div>
        ) : null}
      </div>
      {e.links.length > 0 && (
        <div className="mt-3 text-sm"><b>Links</b>
          <ul className="list-disc ml-5">{e.links.map(l => <li key={l}><a className="text-blue-700 underline break-all" href={l} target="_blank" rel="noreferrer">{l}</a></li>)}</ul>
        </div>
      )}
    </article>
  );
}

export function Public({ store }) {
  const { st, setSt, add } = store, { pages, cur } = st, n = pages.length, page = pages[cur];
  const { toast, confirm } = useUI(), [params] = useSearchParams();
  const [layout, setLayout] = useState('vertical'), [go, setGo] = useState(''), [loading, setLoading] = useState(false);

  useEffect(() => { // shared link: /check-price?sku=XYZ
    const s = params.get('sku')?.trim();
    if (s) { setLoading(true); fetchSku(s).then(p => { add([p]); setLoading(false); }); }
  }, []);

  const goTo = i => setSt(s => ({ ...s, cur: i }));
  const clearPage = async () => {
    if (await confirm('Are you sure you want to clear this page?'))
      setSt(s => { const p = s.pages.filter((_, i) => i !== s.cur); return { pages: p, cur: Math.max(0, Math.min(s.cur, p.length - 1)) }; });
  };
  const clearAll = async () => { if (await confirm('Are you sure you want to clear multiple pages?')) setSt({ pages: [], cur: 0 }); };
  const submitGo = e => { e.preventDefault(); const k = parseInt(go, 10); if (k >= 1 && k <= n) { goTo(k - 1); setGo(''); } else toast(`Enter a page number from 1 to ${n}`, 'err'); };

  const ok = () => (page?.entries.length ? true : (toast('No result to export', 'err'), false));
  const rows = () => page.entries.map(e => ({ SKU: e.sku_display, Details: e.text, Images: e.images.map(abs).join(' '), Videos: e.videos.join(' '), Links: e.links.join(' '), Source: e.file_title || e.file_name }));
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const exp = kind => {
    if (!ok()) return; const r = rows(), f = 'sku-' + page.sku;
    if (kind === 'txt') dl(new Blob([r.map(o => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n\n-----\n\n')], { type: 'text/plain' }), f + '.txt');
    else if (kind === 'csv') { const q = v => `"${String(v).replace(/"/g, '""')}"`; dl(new Blob(['\ufeff' + [Object.keys(r[0]).map(q).join(','), ...r.map(o => Object.values(o).map(q).join(','))].join('\n')], { type: 'text/csv' }), f + '.csv'); }
    else { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), 'Result'); XLSX.writeFile(wb, f + '.xlsx'); }
  };
  const share = async () => {
    const url = `${location.origin}/check-price${page ? '?sku=' + encodeURIComponent(page.sku) : ''}`;
    try { await navigator.clipboard.writeText(url); toast('Share link copied'); } catch { window.prompt('Copy this link:', url); }
  };

  const controls = () => (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <button className="btn-ghost" onClick={clearPage} disabled={!n}>Clear</button>
      <button className="btn-ghost" onClick={clearAll} disabled={!n}>Clear All Pages</button>
      <span className="px-2 text-slate-600">Page {n ? cur + 1 : 0} of {n}</span>
      <button className="btn-ghost" onClick={() => goTo(cur - 1)} disabled={cur <= 0}>Back Page</button>
      <button className="btn-ghost" onClick={() => goTo(cur + 1)} disabled={cur >= n - 1}>Next Page</button>
      <form onSubmit={submitGo} className="flex gap-1">
        <input type="number" min="1" max={n} className="inp w-20" value={go} onChange={e => setGo(e.target.value)} placeholder="Page" aria-label="Go to page" disabled={!n} />
        <button className="btn-ghost" disabled={!n}>Go To</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <SearchBar store={store} />
      <main className="max-w-6xl mx-auto px-3 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center print:hidden">
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden" role="group" aria-label="Layout">
            {['vertical', 'horizontal', 'normal'].map(l => (
              <button key={l} onClick={() => setLayout(l)} aria-pressed={layout === l} className={`px-3 py-2 text-sm capitalize ${layout === l ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button className="btn-ghost" onClick={() => exp('txt')}>Download</button>
            <button className="btn-ghost" onClick={() => exp('csv')}>Download CSV</button>
            <button className="btn-ghost" onClick={() => exp('xlsx')}>Download Excel</button>
            <button className="btn-ghost" onClick={() => ok() && window.print()}>Print</button>
            <button className="btn-ghost" onClick={share}>Copy Share Link</button>
          </div>
        </div>
        {controls()}
        <section className="bg-white rounded-lg border border-slate-200 min-h-[55vh] p-3 sm:p-4">
          <h2 className="text-center font-semibold bg-slate-200 rounded py-2 mb-4">Result Box{page ? ` – ${page.sku}` : ''}</h2>
          {loading ? <div className="flex justify-center py-20"><Spinner c="w-8 h-8 text-slate-500" /></div>
            : !n ? <p className="text-center text-slate-500 py-20">Search a SKU above to see its price and details.</p>
            : !page.entries.length ? <p className="text-center text-slate-600 py-20 text-lg">No result found</p>
            : <div className="space-y-4">{page.entries.map(e => <Entry key={e.id} e={e} layout={layout} />)}</div>}
        </section>
        {controls()}
      </main>
      <Chatbot />
    </div>
  );
}

export function Multi({ store }) {
  const [skus, setSkus] = useState(Array(15).fill('')), [busy, setBusy] = useState(false);
  const nav = useNavigate(), { toast } = useUI();
  const set = (i, v) => setSkus(s => s.map((x, j) => (j === i ? v : x)));
  const all = async () => {
    const list = skus.map(s => s.trim()).filter(Boolean);
    if (!list.length) return toast('Enter at least one SKU', 'err');
    setBusy(true); store.add(await Promise.all(list.map(fetchSku))); setSkus(Array(15).fill('')); setBusy(false); nav('/');
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <SearchBar store={store} />
      <main className="max-w-3xl mx-auto px-3 py-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6">
          <h1 className="text-xl font-semibold text-center mb-5">Add Multiple SKU</h1>
          <div className="grid sm:grid-cols-2 gap-3">
            {skus.map((s, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="w-14 text-slate-500 shrink-0">SKU {i + 1}</span>
                <input className="inp" value={s} onChange={e => set(i, e.target.value)} onKeyDown={e => e.key === 'Enter' && all()} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 mt-5">
            <button className="btn-ghost" onClick={() => setSkus(s => [...s, ''])}>Add More SKU</button>
            <button className="btn" onClick={all} disabled={busy}>{busy ? <><Spinner /> Searching</> : 'Search All'}</button>
          </div>
        </div>
      </main>
      <Chatbot />
    </div>
  );
}
