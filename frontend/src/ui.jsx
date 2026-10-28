import { createContext, useContext, useState, useCallback } from 'react';
const Ctx = createContext();
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const confirm = useCallback(msg => new Promise(res => setDlg({ msg, res })), []);
  const close = v => { dlg.res(v); setDlg(null); };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] space-y-2 print:hidden">
        {toasts.map(t => <div key={t.id} role="status" className={`px-4 py-2 rounded-md shadow-lg text-white text-sm ${t.type === 'err' ? 'bg-red-600' : 'bg-emerald-600'}`}>{t.msg}</div>)}
      </div>
      {dlg && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4">
          <div role="dialog" className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <p className="mb-5 text-slate-800">{dlg.msg}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>Cancel</button>
              <button className="btn bg-red-600 hover:bg-red-700" onClick={() => close(true)} autoFocus>Yes</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const Spinner = ({ c = '' }) => <span className={`inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin ${c}`} />;

export async function api(url, { method = 'GET', body } = {}) {
  const headers = {}, t = localStorage.getItem('token');
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const r = await fetch('/api' + url, { method, headers, body });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && t && !url.startsWith('/auth')) { localStorage.removeItem('token'); location.href = '/login'; }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
