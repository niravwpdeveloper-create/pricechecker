import { useState, useRef, useEffect } from 'react';
import { api, Spinner } from './ui';

const LANGS = [['en-IN', 'English'], ['gu-IN', 'ગુજરાતી (Gujarati)'], ['hi-IN', 'हिन्दी (Hindi)']];
const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;

export default function Chatbot() {
  const [open, setOpen] = useState(false), [lang, setLang] = useState('en-IN'), [q, setQ] = useState('');
  const [busy, setBusy] = useState(false), [st, setSt] = useState('idle');
  const [msgs, setMsgs] = useState([{ bot: 1, text: 'Type a SKU and I will show and read its details.' }]);
  const last = useRef(''), end = useRef(null);

  useEffect(() => { ss?.getVoices(); return () => ss?.cancel(); }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, open]);

  const speak = t => {
    if (!ss) return;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(t), vs = ss.getVoices();
    u.lang = lang;
    u.voice = vs.find(v => v.lang.replace('_', '-') === lang) || vs.find(v => v.lang.startsWith(lang.slice(0, 2))) || null;
    u.onend = u.onerror = () => setSt('idle');
    ss.speak(u); setSt('playing');
  };
  const play = () => { if (st === 'paused') { ss.resume(); setSt('playing'); } else if (last.current) speak(last.current); };
  const pause = () => { ss?.pause(); setSt('paused'); };
  const stop = () => { ss?.cancel(); setSt('idle'); };

  const send = async e => {
    e.preventDefault();
    const s = q.trim(); if (!s) return;
    setMsgs(m => [...m, { text: s }]); setQ(''); setBusy(true);
    let t;
    try {
      const d = await api('/search?type=chatbot&sku=' + encodeURIComponent(s));
      t = d.results.length ? d.results.map(r => `SKU ${r.sku_display}\n${r.text}`).join('\n\n') : 'No result found';
    } catch { t = 'Could not reach the server. Try again.'; }
    setBusy(false); setMsgs(m => [...m, { bot: 1, text: t }]); last.current = t; speak(t);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <div className="mb-3 w-[calc(100vw-2rem)] sm:w-96 h-[70vh] max-h-[560px] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="bg-slate-800 text-white p-3 flex items-center gap-2">
            <span className="font-semibold flex-1">SKU Assistant</span>
            <select value={lang} onChange={e => { stop(); setLang(e.target.value); }} className="text-slate-800 text-sm rounded px-1 py-1" aria-label="Language">
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="px-2 text-xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {msgs.map((m, i) => <div key={i} className={`max-w-[85%] w-fit px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${m.bot ? 'bg-white border border-slate-200' : 'bg-slate-800 text-white ml-auto'}`}>{m.text}</div>)}
            {busy && <Spinner c="text-slate-500" />}
            <div ref={end} />
          </div>
          <div className="flex justify-center gap-2 p-2 border-t border-slate-200">
            <button className="btn-ghost" onClick={play} disabled={st === 'playing' || !last.current}>▶ Play</button>
            <button className="btn-ghost" onClick={pause} disabled={st !== 'playing'}>⏸ Pause</button>
            <button className="btn-ghost" onClick={stop} disabled={st === 'idle'}>⏹ Stop</button>
          </div>
          <form onSubmit={send} className="flex gap-2 p-2 border-t border-slate-200">
            <input className="inp" placeholder="Enter SKU" value={q} onChange={e => setQ(e.target.value)} aria-label="SKU for chatbot" />
            <button className="btn" disabled={busy}>Send</button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} className="ml-auto block w-14 h-14 rounded-full bg-slate-800 text-white text-2xl shadow-lg hover:bg-slate-700" aria-label="Open chatbot">💬</button>
    </div>
  );
}
