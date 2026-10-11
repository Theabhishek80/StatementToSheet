# Statement → Excel

Convert bank statement PDFs to Excel (.xlsx) or CSV. Everything runs in the browser, so statements are never uploaded to a server.

## Features
- Multiple PDFs at once, password-protected PDFs supported
- Auto-detects Date, Description, Debit, Credit, Balance
- Editable preview before download
- Excel output with real dates, number formats, filters and a Summary sheet
- Dark mode, mobile friendly

## Run locally
Open `index.html` through any static server (opening the file directly may block the PDF worker):

    python3 -m http.server 8000
    # visit http://localhost:8000

## Deploy on GitHub Pages
1. Create a new GitHub repository and push these files to the `main` branch.
2. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) deploys on every push.
4. Your site appears at `https://<your-username>.github.io/<repo-name>/`.

Alternative: set Source to **Deploy from a branch**, choose `main` and `/ (root)`. You can delete the workflow in that case.

Other hosts (Netlify, Vercel, Cloudflare Pages) also work: no build command, publish directory `.`.

## Files
- `index.html`: page
- `style.css`: styles
- `parser.js`: turns PDF text positions into transaction rows (edit here to support a specific bank)
- `app.js`: upload, preview, Excel/CSV export
- Libraries load from cdnjs: pdf.js 3.11.174, SheetJS 0.18.5

## Limits
- Works on text-based PDFs only. Scanned statements need OCR first.
- Layouts differ per bank. If a bank parses badly, adjust `DATE_RE`, `AMT_RE` or header keywords in `parser.js`.
- Always verify totals against the original statement.

## Before you publish: set your site URL
The SEO files contain a placeholder URL. After you know your final address (for example `https://converter.yourdomain.com/`), run once:

    python3 set-domain.py https://converter.yourdomain.com/

Or search and replace `https://your-username.github.io/statement-to-excel/` in `index.html`, `sitemap.xml` and `robots.txt`.

## Get found on Google
1. Open Google Search Console and add your site (URL prefix).
2. Verify ownership (HTML tag method: paste the tag in `<head>` of `index.html`).
3. Submit `https://your-site/sitemap.xml` under Sitemaps, then use URL Inspection and click Request indexing.
4. Do the same in Bing Webmaster Tools.
5. Share the link on a few places (GitHub README, social media) so search engines discover it faster.

## Customise
- `assets/logo.png`: header logo (square, 256x256). Same file name.
- `assets/favicon.png`: browser tab icon (square, 180x180). Same file name.
- `assets/og-image.png`: preview image for WhatsApp, Twitter and LinkedIn (1200x630).
- `index.html`: UPI number (`9301708816`), site name, footer credit ("Your Name", GitHub link).
