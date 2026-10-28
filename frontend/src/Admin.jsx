import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { api, useUI, Spinner } from './ui';

const Card = ({ title, children }) => <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6">{title && <h2 className="text-lg font-semibold mb-4">{title}</h2>}{children}</div>;
const Field = ({ label, children }) => <label className="block text-sm mb-3"><span className="block text-slate-600 mb-1">{label}</span>{children}</label>;
const Center = ({ children }) => <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">{children}</div>;

export function Login() {
  const [f, setF] = useState({ username: '', password: '' }), [mode, setMode] = useState('login'), [busy, setBusy] = useState(false);
  const nav = useNavigate(), { toast } = useUI();
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'login') { const d = await api('/auth/login', { method: 'POST', body: f }); localStorage.setItem('token', d.token); nav(d.mustChange ? '/admin/settings' : '/admin/upload'); }
      else { const d = await api('/auth/forgot', { method: 'POST', body: { username: f.username } }); toast(d.message); setMode('login'); }
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <Center><form onSubmit={submit} className="w-full max-w-sm"><Card title={mode === 'login' ? 'Admin login' : 'Forgot password'}>
      <Field label={mode === 'login' ? 'Username' : 'Username or email'}><input className="inp" required value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></Field>
      {mode === 'login' && <Field label="Password"><input type="password" className="inp" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>}
      <button className="btn w-full" disabled={busy}>{busy ? <Spinner /> : mode === 'login' ? 'Login' : 'Send reset link'}</button>
      <div className="flex justify-between text-sm mt-4">
        <button type="button" className="text-blue-700" onClick={() => setMode(mode === 'login' ? 'forgot' : 'login')}>{mode === 'login' ? 'Forgot password?' : 'Back to login'}</button>
        <Link to="/" className="text-slate-500">Home</Link>
      </div>
    </Card></form></Center>
  );
}

export function Reset() {
  const [p] = useSearchParams(), [f, setF] = useState({ a: '', b: '' }), [busy, setBusy] = useState(false);
  const nav = useNavigate(), { toast } = useUI();
  const submit = async e => {
    e.preventDefault(); if (f.a !== f.b) return toast('Passwords do not match', 'err');
    setBusy(true);
    try { await api('/auth/reset', { method: 'POST', body: { token: p.get('token'), password: f.a } }); toast('Password reset. Log in with your new password.'); nav('/login'); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <Center><form onSubmit={submit} className="w-full max-w-sm"><Card title="Reset password">
      <Field label="New password"><input type="password" className="inp" required minLength={6} value={f.a} onChange={e => setF({ ...f, a: e.target.value })} /></Field>
      <Field label="Confirm new password"><input type="password" className="inp" required value={f.b} onChange={e => setF({ ...f, b: e.target.value })} /></Field>
      <button className="btn w-full" disabled={busy}>{busy ? <Spinner /> : 'Reset password'}</button>
    </Card></form></Center>
  );
}

export function Admin() {
  const [me, setMe] = useState(null), nav = useNavigate(), loc = useLocation();
  useEffect(() => { if (!localStorage.getItem('token')) return nav('/login'); api('/me').then(setMe).catch(() => nav('/login')); }, []);
  const logout = () => { localStorage.removeItem('token'); nav('/login'); };
  if (!me) return <Center><Spinner c="w-8 h-8 text-slate-500" /></Center>;
  if (me.must_change && !loc.pathname.endsWith('/settings')) return <Navigate to="/admin/settings" replace />;
  const link = ({ isActive }) => `px-3 py-2 rounded-md text-sm whitespace-nowrap ${isActive ? 'bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`;
  return (
    <div className="min-h-screen md:flex bg-slate-100">
      <aside className="bg-slate-800 md:w-56 md:h-screen md:sticky md:top-0 p-3 flex md:flex-col gap-1 overflow-x-auto">
        <div className="text-white font-semibold px-3 py-2 hidden md:block">Admin Panel</div>
        <NavLink to="upload" className={link}>Upload Files</NavLink>
        <NavLink to="data" className={link}>SKU Data</NavLink>
        <NavLink to="settings" className={link}>Settings</NavLink>
        <button onClick={logout} className="px-3 py-2 rounded-md text-sm text-red-300 hover:bg-slate-700 text-left md:mt-auto whitespace-nowrap">Logout</button>
      </aside>
      <main className="flex-1 min-w-0 p-3 sm:p-6">
        {!!me.must_change && <div className="mb-4 p-3 rounded-md bg-amber-100 text-amber-900 text-sm">Change the default password to continue.</div>}
        <Routes>
          <Route path="upload" element={<Upload />} />
          <Route path="data" element={<SkuData />} />
          <Route path="settings" element={<Settings me={me} setMe={setMe} logout={logout} />} />
          <Route path="*" element={<Navigate to="upload" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const EXT = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.cdr'];
const checkFile = f => (!f ? 'Choose a file to upload' : !EXT.some(e => f.name.toLowerCase().endsWith(e)) ? 'Unsupported file type' : f.size > 20 * 1024 * 1024 ? 'File exceeds 20 MB' : null);
const xhr = (url, method, fd, onProg) => new Promise((res, rej) => {
  const x = new XMLHttpRequest();
  x.open(method, '/api' + url);
  x.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('token'));
  x.upload.onprogress = e => e.lengthComputable && onProg(Math.round((e.loaded / e.total) * 100));
  x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} x.status < 300 ? res(d) : rej(new Error(d.error || 'Upload failed')); };
  x.onerror = () => rej(new Error('Network error'));
  x.send(fd);
});
const Progress = ({ p }) => (
  <div className="flex-1 min-w-[160px]">
    <div className="h-2 bg-slate-200 rounded"><div className="h-2 bg-emerald-500 rounded transition-all" style={{ width: p + '%' }} /></div>
    <p className="text-xs text-slate-500 mt-1">{p < 100 ? `Uploading ${p}%` : 'Extracting SKUs…'}</p>
  </div>
);

function Upload() {
  const blank = { name: '', title: '', type: 'general' };
  const [f, setF] = useState(blank), [file, setFile] = useState(null), [prog, setProg] = useState(null), [files, setFiles] = useState(null), [edit, setEdit] = useState(null);
  const ref = useRef(), { toast, confirm } = useUI();
  const load = () => api('/files').then(d => setFiles(d.files)).catch(e => { toast(e.message, 'err'); setFiles([]); });
  useEffect(() => { load(); }, []);
  const submit = async e => {
    e.preventDefault();
    const err = checkFile(file); if (err) return toast(err, 'err');
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); fd.append('file', file);
    setProg(0);
    try { const d = await xhr('/files', 'POST', fd, setProg); toast(`Uploaded: ${d.file.sku_count} SKU(s) extracted`); setF(blank); setFile(null); ref.current.value = ''; load(); }
    catch (e) { toast(e.message, 'err'); }
    setProg(null);
  };
  const del = async x => {
    if (!(await confirm(`Are you sure you want to delete "${x.name}"?`))) return;
    try { await api('/files/' + x.id, { method: 'DELETE' }); toast('File deleted'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="space-y-6">
      <Card title="Upload Files">
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-x-4">
          <Field label="File Type (Mode)">
            <select className="inp" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="general">General</option><option value="chatbot">Chatbot</option></select>
          </Field>
          <Field label="File Name"><input className="inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Defaults to the file's name" /></Field>
          <Field label="File Title"><input className="inp" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Browse"><input ref={ref} type="file" accept={EXT.join(',')} className="inp" onChange={e => setFile(e.target.files[0] || null)} /></Field>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button className="btn" disabled={prog !== null}>{prog !== null ? <Spinner /> : 'Upload'}</button>
            {prog !== null && <Progress p={prog} />}
          </div>
          <p className="sm:col-span-2 text-xs text-slate-500 mt-3">PDF, Word (.docx), Excel, CSV, TXT, JPG, PNG or CDR, up to 20 MB each.</p>
        </form>
      </Card>
      <Card title="Uploaded files">
        {files === null ? <Spinner c="text-slate-500" /> : !files.length ? <p className="text-center text-slate-500 py-8">No files yet. Upload one above to start indexing SKUs.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left bg-slate-100">{['Sr', 'File Name', 'Title', 'Mode', 'SKUs', 'Date & Time', ''].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{files.map((x, i) => (
                <tr key={x.id} className="border-t border-slate-200">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{x.name}<div className="text-xs text-slate-400">{x.original}</div></td>
                  <td className="p-2">{x.title}</td>
                  <td className="p-2 capitalize">{x.type}</td>
                  <td className="p-2">{x.sku_count}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(x.created_at).toLocaleString()}</td>
                  <td className="p-2 whitespace-nowrap space-x-3 text-right">
                    <a className="text-blue-700" href={'/uploads/files/' + x.stored} target="_blank" rel="noreferrer">Preview</a>
                    <button onClick={() => setEdit(x)}>Edit</button>
                    <button className="text-red-600" onClick={() => del(x)}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <EditModal x={edit} close={ok => { setEdit(null); ok && load(); }} />}
    </div>
  );
}

function EditModal({ x, close }) {
  const [f, setF] = useState({ name: x.name, title: x.title, type: x.type }), [file, setFile] = useState(null), [prog, setProg] = useState(null), { toast } = useUI();
  const save = async e => {
    e.preventDefault();
    if (file) { const err = checkFile(file); if (err) return toast(err, 'err'); }
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append('file', file);
    setProg(0);
    try { const d = await xhr('/files/' + x.id, 'PUT', fd, setProg); toast(`Saved: ${d.file.sku_count} SKU(s)`); close(true); }
    catch (e) { toast(e.message, 'err'); setProg(null); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="font-semibold text-lg mb-4">Edit file</h3>
        <Field label="File Name"><input className="inp" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="File Title"><input className="inp" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="File Type (Mode)"><select className="inp" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="general">General</option><option value="chatbot">Chatbot</option></select></Field>
        <Field label="Replace file (optional)"><input type="file" accept={EXT.join(',')} className="inp" onChange={e => setFile(e.target.files[0] || null)} /></Field>
        {prog !== null && file && <Progress p={prog} />}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className="btn" disabled={prog !== null}>{prog !== null ? <Spinner /> : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function SkuData() {
  const [rows, setRows] = useState(null), [q, setQ] = useState(''), { toast, confirm } = useUI();
  const load = () => api('/entries').then(d => setRows(d.entries)).catch(e => { toast(e.message, 'err'); setRows([]); });
  useEffect(() => { load(); }, []);
  const clear = async () => {
    if (!(await confirm('Are you sure you want to clear all SKU data?'))) return;
    try { await api('/entries', { method: 'DELETE' }); toast('SKU data cleared'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const s = q.trim().toLowerCase();
  const list = (rows || []).filter(r => !s || [r.sku_display, r.text, r.file_name].some(v => (v || '').toLowerCase().includes(s)));
  return (
    <Card title="SKU Data">
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="inp flex-1 min-w-[200px]" placeholder="Filter by SKU, details or file" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn bg-red-600 hover:bg-red-700" onClick={clear} disabled={!rows?.length}>Clear</button>
      </div>
      {rows === null ? <Spinner c="text-slate-500" /> : !list.length ? <p className="text-center text-slate-500 py-8">{rows.length ? 'No SKU matches this filter.' : 'No SKU data yet. Upload a file to extract SKUs.'}</p> : (
        <div className="overflow-x-auto">
          <p className="text-xs text-slate-500 mb-2">{list.length} entries</p>
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="text-left bg-slate-100">{['SKU', 'Details', 'Media', 'Source File', 'Mode'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id} className="border-t border-slate-200 align-top">
                <td className="p-2 font-medium whitespace-nowrap">{r.sku_display}</td>
                <td className="p-2"><div className="line-clamp-3 whitespace-pre-wrap max-w-md">{r.text || '—'}</div></td>
                <td className="p-2 text-xs whitespace-nowrap">{r.images.length} images, {r.videos.length} videos, {r.links.length} links</td>
                <td className="p-2">{r.file_name}</td>
                <td className="p-2 capitalize">{r.type}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Settings({ me, setMe, logout }) {
  const [f, setF] = useState({ username: me.username, email: me.email || '', currentPassword: '', newPassword: '', confirm: '' }), [busy, setBusy] = useState(false), { toast } = useUI();
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return toast('New passwords do not match', 'err');
    setBusy(true);
    try { const d = await api('/settings', { method: 'PUT', body: f }); setMe(d.user); setF({ ...f, currentPassword: '', newPassword: '', confirm: '' }); toast('Settings saved'); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="max-w-lg"><Card title="Settings">
      <Field label="Username"><input className="inp" required value={f.username} onChange={set('username')} /></Field>
      <Field label="Email (used for password reset)"><input type="email" className="inp" value={f.email} onChange={set('email')} /></Field>
      <Field label="New password"><input type="password" className="inp" value={f.newPassword} onChange={set('newPassword')} placeholder={me.must_change ? 'Required' : 'Leave blank to keep current'} /></Field>
      <Field label="Confirm new password"><input type="password" className="inp" value={f.confirm} onChange={set('confirm')} /></Field>
      <Field label="Current password"><input type="password" className="inp" required value={f.currentPassword} onChange={set('currentPassword')} /></Field>
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? <Spinner /> : 'Save changes'}</button><button type="button" className="btn-ghost" onClick={logout}>Logout</button></div>
    </Card></form>
  );
}
