# Landing display fonts (self-hosted, DISPLAY-FONT slice)

Used **only** for landing display headings (hero headline + marketing section
titles) via the `.font-display` / `.font-display-hero` utilities in
`globals.css`. Body/UI type stays Geist + IBM Plex Sans Arabic.

| File | Family | Weight | Subset | Script |
|---|---|---|---|---|
| `anton-latin-400.woff2` | Anton | 400 | latin | EN/FR display headings |
| `alexandria-arabic-800.woff2` | Alexandria | 800 (ExtraBold) | arabic | AR display headings |

Both are licensed under the **SIL Open Font License 1.1** (OFL) — freely
embeddable/redistributable in this app. Source: Google Fonts, fetched as woff2
subsets via the fontsource CDN (`cdn.jsdelivr.net/fontsource`). No CDN link is
used at runtime — the files are same-origin, wired through `next/font/local` in
`src/app/[locale]/layout.tsx` (prod CSP is strict; fonts must be same-origin).
