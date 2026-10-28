require('dotenv').config();
const express = require('express'), cors = require('cors'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const multer = require('multer'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), nodemailer = require('nodemailer');
const db = require('./db'), { extract, FILES_DIR, MEDIA_DIR } = require('./extract');

const SECRET = process.env.JWT_SECRET || 'change-this-secret', APP_URL = process.env.APP_URL || 'http://localhost:5173';
const EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.cdr'];
const app = express();
app.use(cors()); app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const h = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(e); res.status(500).json({ error: e.message || 'Server error' }); });
const fail = (res, code, error) => res.status(code).json({ error });
const rm = p => fs.rm(p, { force: true }, () => {});
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/* ---------- Auth ---------- */
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), SECRET); next(); } catch { fail(res, 401, 'Unauthorized'); } };
const getUser = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const userOut = u => ({ id: u.id, username: u.username, email: u.email, must_change: u.must_change });
const mailer = process.env.SMTP_HOST && nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587, secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

app.post('/api/auth/login', (req, res) => {
  const { username = '', password = '' } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim());
  if (!u || !bcrypt.compareSync(String(password), u.password)) return fail(res, 401, 'Invalid username or password');
  res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' }), mustChange: !!u.must_change });
});

app.post('/api/auth/forgot', h(async (req, res) => {
  const v = String(req.body.username || '').trim();
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(v, v);
  if (u?.email) {
    const t = crypto.randomBytes(32).toString('hex'), link = `${APP_URL}/reset?token=${t}`;
    db.prepare('UPDATE users SET reset_token=?, reset_exp=? WHERE id=?').run(sha(t), Date.now() + 3600e3, u.id);
    if (mailer) await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: u.email, subject: 'Reset your password',
      html: `<p>Use this link to reset your Price & Details Checker password (valid for 1 hour):</p><p><a href="${link}">${link}</a></p>` });
    else console.log('[SMTP not configured] Reset link:', link);
  }
  res.json({ message: 'If the account has an email address, a reset link has been sent.' });
}));

app.post('/api/auth/reset', (req, res) => {
  const { token = '', password = '' } = req.body;
  if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters');
  const u = db.prepare('SELECT * FROM users WHERE reset_token=? AND reset_exp>?').get(sha(token), Date.now());
  if (!u) return fail(res, 400, 'Reset link is invalid or has expired');
  db.prepare('UPDATE users SET password=?, reset_token=NULL, reset_exp=NULL, must_change=0 WHERE id=?').run(bcrypt.hashSync(password, 10), u.id);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => { const u = getUser(req.user.id); u ? res.json(userOut(u)) : fail(res, 401, 'Unauthorized'); });

app.put('/api/settings', auth, (req, res) => {
  const u = getUser(req.user.id), { username = '', email = '', currentPassword = '', newPassword = '' } = req.body;
  if (!bcrypt.compareSync(String(currentPassword), u.password)) return fail(res, 400, 'Current password is incorrect');
  if (!username.trim()) return fail(res, 400, 'Username is required');
  if (db.prepare('SELECT 1 FROM users WHERE username=? AND id<>?').get(username.trim(), u.id)) return fail(res, 400, 'Username is already taken');
  if (u.must_change && !newPassword) return fail(res, 400, 'Set a new password to continue');
  if (newPassword && (newPassword.length < 6 || newPassword === currentPassword)) return fail(res, 400, 'New password must be at least 6 characters and different from the current one');
  db.prepare('UPDATE users SET username=?, email=?, password=?, must_change=? WHERE id=?')
    .run(username.trim(), email.trim() || null, newPassword ? bcrypt.hashSync(newPassword, 10) : u.password, newPassword ? 0 : u.must_change, u.id);
  res.json({ user: userOut(getUser(u.id)) });
});

/* ---------- Files ---------- */
const upload = multer({
  storage: multer.diskStorage({ destination: FILES_DIR, filename: (r, f, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (r, f, cb) => (EXTS.includes(path.extname(f.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Unsupported file type. Allowed: ' + EXTS.join(', '))))
});
const up = (req, res, next) => upload.single('file')(req, res, e => (e ? fail(res, 400, e.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 20 MB' : e.message) : next()));

function magicOk(file, ext) { // server-side content check (not just extension)
  const b = Buffer.alloc(8), fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd);
  const x = b.toString('hex');
  switch (ext) {
    case '.pdf': return x.startsWith('25504446');
    case '.docx': case '.xlsx': return x.startsWith('504b');
    case '.xls': return x.startsWith('d0cf11e0');
    case '.png': return x.startsWith('89504e47');
    case '.jpg': case '.jpeg': return x.startsWith('ffd8ff');
    case '.cdr': return x.startsWith('52494646') || x.startsWith('504b');
    default: return !fs.readFileSync(file).subarray(0, 8192).includes(0); // txt / csv
  }
}
const checkUpload = (req, res) => {
  const f = req.file;
  if (!f) return fail(res, 400, 'Please choose a file'), false;
  if (!magicOk(f.path, path.extname(f.filename))) { rm(f.path); return fail(res, 400, 'File content does not match its extension'), false; }
  return true;
};
const getFile = id => db.prepare('SELECT * FROM files WHERE id=?').get(id);
const clearMedia = test => fs.readdirSync(MEDIA_DIR).filter(test).forEach(n => rm(path.join(MEDIA_DIR, n)));
const rmStored = s => { rm(path.join(FILES_DIR, s)); rm(path.join(FILES_DIR, s + '.pdf')); };

async function index(id, stored) {
  const prefix = `${id}_${Date.now()}_`;
  let blocks;
  try { blocks = await extract(path.join(FILES_DIR, stored), path.extname(stored), prefix); }
  catch (e) { clearMedia(n => n.startsWith(prefix)); throw e; }
  const ins = db.prepare('INSERT INTO entries(file_id,sku,sku_display,text,html,images,videos,links,page) VALUES(?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.prepare('DELETE FROM entries WHERE file_id=?').run(id);
    blocks.forEach(b => ins.run(id, b.sku.trim().toUpperCase(), b.sku.trim(), b.text, b.html || null, JSON.stringify(b.images), JSON.stringify(b.videos), JSON.stringify(b.links), b.page || null));
    db.prepare('UPDATE files SET sku_count=? WHERE id=?').run(new Set(blocks.map(b => b.sku.trim().toUpperCase())).size, id);
  })();
  clearMedia(n => n.startsWith(id + '_') && !n.startsWith(prefix));
}

app.get('/api/files', auth, (req, res) => res.json({ files: db.prepare('SELECT * FROM files ORDER BY id DESC').all() }));

app.post('/api/files', auth, up, h(async (req, res) => {
  if (!checkUpload(req, res)) return;
  const f = req.file, { name = '', title = '', type } = req.body;
  const id = db.prepare('INSERT INTO files(name,title,type,original,stored,size,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(name.trim() || f.originalname, title.trim(), type === 'chatbot' ? 'chatbot' : 'general', f.originalname, f.filename, f.size, new Date().toISOString()).lastInsertRowid;
  try { await index(id, f.filename); }
  catch (e) { db.prepare('DELETE FROM files WHERE id=?').run(id); rmStored(f.filename); return fail(res, 422, 'Could not process file: ' + e.message); }
  res.json({ file: getFile(id) });
}));

app.put('/api/files/:id', auth, up, h(async (req, res) => {
  const x = getFile(req.params.id), f = req.file;
  if (!x) { f && rm(f.path); return fail(res, 404, 'File not found'); }
  if (f && !checkUpload(req, res)) return;
  if (f) {
    try { await index(x.id, f.filename); } catch (e) { rmStored(f.filename); return fail(res, 422, 'Could not process file: ' + e.message); }
    rmStored(x.stored);
  }
  const { name = x.name, title = x.title, type } = req.body;
  db.prepare('UPDATE files SET name=?, title=?, type=?, original=?, stored=?, size=? WHERE id=?')
    .run(name.trim() || x.name, title.trim(), ['general', 'chatbot'].includes(type) ? type : x.type, f ? f.originalname : x.original, f ? f.filename : x.stored, f ? f.size : x.size, x.id);
  res.json({ file: getFile(x.id) });
}));

app.delete('/api/files/:id', auth, (req, res) => {
  const x = getFile(req.params.id); if (!x) return fail(res, 404, 'File not found');
  db.prepare('DELETE FROM entries WHERE file_id=?').run(x.id); db.prepare('DELETE FROM files WHERE id=?').run(x.id);
  clearMedia(n => n.startsWith(x.id + '_')); rmStored(x.stored);
  res.json({ ok: true });
});

/* ---------- Entries & public search ---------- */
const Q = 'SELECT e.*, f.name file_name, f.title file_title, f.type, f.stored FROM entries e JOIN files f ON f.id=e.file_id';
const fmt = r => ({ ...r, images: JSON.parse(r.images || '[]'), videos: JSON.parse(r.videos || '[]'), links: JSON.parse(r.links || '[]'),
  source_url: '/uploads/files/' + (r.stored.endsWith('.cdr') ? r.stored + '.pdf' : r.stored) + (r.page ? '#page=' + r.page : '') });

app.get('/api/entries', auth, (req, res) => res.json({ entries: db.prepare(Q + ' ORDER BY e.sku').all().map(fmt) }));
app.delete('/api/entries', auth, (req, res) => { db.exec('DELETE FROM entries; UPDATE files SET sku_count=0;'); res.json({ ok: true }); });
app.get('/api/search', (req, res) => {
  const sku = String(req.query.sku || '').trim().toUpperCase();
  if (!sku) return res.json({ results: [] });
  res.json({ results: db.prepare(Q + ' WHERE e.sku=? AND f.type=? ORDER BY e.id').all(sku, req.query.type === 'chatbot' ? 'chatbot' : 'general').map(fmt) });
});

/* ---------- Serve built frontend (production) ---------- */
const dist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(dist, 'index.html'))); }

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
