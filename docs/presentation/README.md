# ca-web presentation

Short Slidev deck (~10 slides, 5-10 min) introducing ca-web to APS beamline
scientists and ops.

## Run

```bash
cd docs/presentation
npm install
npm run dev          # opens http://localhost:3030
```

Press `f` for fullscreen, `o` for overview, arrow keys to navigate.

## Export

```bash
npm run export       # PDF (slides-export.pdf)
npm run build        # static HTML site in dist/
```

PDF export uses `playwright-chromium`, which is installed as a dev dep.

## Files

- `slides.md` &mdash; Slidev source (one file, slide-separated by `---`)
- `assets/` &mdash; screenshots captured from `npm run dev` at the repo root
  - `01-picker.png` &mdash; deployment picker
  - `02-example-home.png` &mdash; example deployment, Home tab
  - `03-example-full.png` &mdash; full-page version of the same
  - `04-example-test.png` &mdash; widget-test panels

To refresh screenshots: start the main app (`npm run dev` from the repo
root), navigate to the page, and overwrite the PNG in `assets/`.
