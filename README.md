# Siteboard

Siteboard is a local-first content editor for small static websites. It runs
entirely in the browser, saves the working document to `localStorage`, and
exports a standalone `index.html` file with no React or Siteboard runtime.

The included demo is a neutral three-page bicycle workshop site. It is sample
content, not WHAGO content.

## What it does

- Add, reorder, hide, edit, and delete pages and sections.
- Edit headings, body copy, navigation labels, and real link URLs.
- Adjust background, surface, text, muted, and accent color tokens.
- Choose system sans, serif, or monospace typography and a radius token.
- Edit SEO title/description and Open Graph social-card fields.
- Preview the current document immediately at desktop or mobile width.
- Validate page structure, slugs, links, colors, contrast, and metadata.
- Undo or redo up to 100 document changes with `Cmd/Ctrl+Z`.
- Autosave the document locally after each change.
- Import and export the versioned Siteboard JSON format.
- Export one portable static HTML file containing every visible page.
- Install as a PWA and reopen the cached editor shell offline.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

The development server prints its local URL. Production checks:

```bash
npm test
npm run lint
npm run build
npm run preview
```

## Deployment paths

Vite, the web app manifest, and the service worker use `/siteboard/` as their
base and scope. The same build therefore supports:

- `https://whago.net/siteboard/`
- `https://rad1092.github.io/siteboard/`

Do not mount this build at `/` without changing `base` in `vite.config.ts` and
the `/siteboard/` values in `public/manifest.webmanifest`.

The workflow in `.github/workflows/deploy-pages.yml` tests, builds, and deploys
`dist/` when this directory is used as the root of the `rad1092/siteboard`
repository. Enable GitHub Pages with **GitHub Actions** as its source.

For the WHAGO host, publish the contents of `dist/` at the `/siteboard/` route.
The server must serve `index.html` for `/siteboard/`; no other SPA fallback is
required because Siteboard has no client-side routes.

## Data and privacy

The current document is stored under `siteboard.document.v1` in the browser's
local storage. Siteboard has no account, analytics, server database, or network
sync. Clearing site data removes the autosaved copy, so export JSON for backup
or transfer.

Imported JSON must match `schemaVersion: 1`. Text is escaped before it enters
the preview or exported HTML, and links are limited to HTTP(S), `mailto:`,
`tel:`, anchors, and relative URLs. Siteboard does not accept raw HTML.

## Static HTML export

`Export HTML` is enabled when validation has no errors. The generated file:

- contains inline responsive CSS and semantic page/section markup;
- includes search and Open Graph metadata;
- includes visible pages and visible sections only;
- escapes all authored text and rejects unsafe link protocols;
- does not bundle remote images referenced in social metadata;
- does not include a form backend, CMS, analytics, or asset pipeline.

The export is deliberately a single long-form HTML document. Navigation links
use page anchors such as `#page-services`.

## PWA notes

The service worker precaches the editor shell and caches built assets after
their first successful request. The user's document remains in `localStorage`;
it is not placed in the cache. A first online visit is required before offline
launch works.

## License

[MIT](./LICENSE)
