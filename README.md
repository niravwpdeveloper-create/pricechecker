# Price & Details Checker

React + Tailwind frontend, Node.js + Express + SQLite backend.

## Requirements
- Node.js 18+ (20 LTS recommended)
- Optional: **Inkscape 1.x** on PATH (or set `INKSCAPE_PATH`) for `.cdr` uploads
- Internet on first OCR run (Tesseract.js downloads English language data)

## Setup & run (development)
```bash
# 1. Backend
cd backend
cp .env.example .env        # set JWT_SECRET, SMTP_* for reset emails
npm install
npm start                   # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api and /uploads)
```

## Production
```bash
cd frontend && npm run build
cd ../backend && npm start   # serves the built site + API on PORT (default 5000)
```
Set `APP_URL` in `.env` to the public site URL so reset links are correct.

## Default login
`admin` / `admin123` — you must change the password on first login.
Add an email in **Settings** to enable "Forgot password". If SMTP is not configured, the reset link is printed in the backend console.

## Pages
- `/` and `/check-price` – public SKU search (`/check-price?sku=ABC123` opens a result directly; this is what "Copy Share Link" produces)
- `/multi` – Add Multiple SKU (15 boxes + Add More SKU + Search All)
- `/login`, `/admin/upload`, `/admin/data`, `/admin/settings`

## How SKUs are extracted
A SKU block = the text beside the SKU plus everything below it until the next SKU.
- Text-based files (PDF, TXT, OCR from JPG/PNG, CDR→PDF): a SKU is detected by labels such as `SKU: AB-123`, `Item Code`, `Product Code`, `Model No.` (code must contain a digit). If a file has no labels, lines that start with a code (e.g. `AB123 …`) are used. Override with `SKU_REGEX` in `.env` (capture group 1 = SKU).
- Word (.docx): original formatting, tables and embedded images are kept per SKU.
- Excel / CSV: if a header column is named `SKU` / `Item Code` / `Product Code` / `Code`, each row becomes that SKU's block (rows with an empty SKU cell continue the previous SKU). Otherwise rows are read as text lines.
- URLs inside a block are stored as images, videos (YouTube/Vimeo/mp4) or links.
- PDF results link to the exact source page.

Search is case-insensitive and trims spaces. "General" files appear in search results; "Chatbot" files are used by the chatbot.

## Notes
- Word support is `.docx` (save old `.doc` files as `.docx`).
- Speech voices depend on the browser/OS; install Gujarati/Hindi voices for best results (Chrome/Edge on Windows/Android include them).
- Results are kept in memory only: refreshing the page clears them.
