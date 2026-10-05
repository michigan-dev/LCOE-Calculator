# Energy Cost Explorer: LCOE Calculator

An interactive levelized-cost-of-electricity (LCOE) tool for comparing **next-gen geothermal, conventional geothermal, utility solar PV, onshore wind, natural gas combined cycle, and solar + 4-hour battery**. Pick a technology, move the sliders (capital cost, O&M, fuel, capacity factor, lifetime, WACC) and watch the LCOE, cost breakdown and ±20% sensitivity charts update live.

Plain HTML, CSS and vanilla JavaScript. No framework, no build step, no backend. The only dependency is Chart.js 4.4.1 (pinned, loaded from cdnjs with an SRI hash).

![Screenshot placeholder: replace with a capture of the running app](docs/screenshot.png)

## The formula

```
CRF  = r(1+r)^n / ((1+r)^n - 1)          (CRF = 1/n when r = 0)

LCOE = (Capital x CRF + Fixed O&M) / (8.76 x Capacity factor) + Variable O&M + Fuel
```

Capital and fixed O&M are in $/kW and $/kW-year, so one kW produces `8.76 x CF` MWh per year. Variable O&M and fuel are in $/MWh. It is a simplified, pre-tax, real-terms metric: no taxes, incentives, inflation, degradation, transmission, or value of firm vs. variable output.

## Sources for the defaults

Defaults in `data/defaults.js` are **approximate, rounded, illustrative values** chosen to sit within the ranges published in the public:

- [NREL Annual Technology Baseline (ATB)](https://atb.nrel.gov/)
- [Lazard Levelized Cost of Energy+](https://www.lazard.com/research-insights/levelized-cost-of-energyplus/)

They were set from general knowledge of those ranges, **not copied from a specific table or vintage**, so check them against the current publications before quoting any number. All technologies default to an 8% WACC. The "assumptions last reviewed" date lives in `data/defaults.js` (`META.reviewed`): update it when you revisit the numbers.

## Project layout

```
index.html          page markup, Open Graph tags, script order
styles.css          design tokens (light/dark), layout, responsive rules
app.js              UI wiring, Chart.js charts, share link, data tables
lib/lcoe.js         pure math: crf, lcoe, breakdown, sensitivity, validate (no DOM)
data/defaults.js    technology defaults, slider ranges, source metadata
tests/lcoe.test.js  unit tests (Node's built-in test runner)
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly also works, except that the share link and URL sync need an `http(s)` origin in some browsers.)

## Run the tests

Requires Node 18+; no dependencies to install.

```bash
node --test
```

## Share links

The URL query string always mirrors the current scenario, e.g.
`?t=ngcc&capex=1100&fom=15&vom=3&fuel=42&cf=55&life=30&wacc=9.5`.
Unknown technologies and out-of-range or non-numeric values are ignored or clamped on load.

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. **Settings > Pages > Build and deployment > Deploy from a branch**.
3. Choose branch `main` and folder `/ (root)`, then Save.

The empty `.nojekyll` file at the root tells Pages to serve the files as-is. All asset paths are relative, so project sites (`https://<user>.github.io/lcoe-explorer/`) work without changes.

After deploying, update the placeholders:

- `index.html`: `og:url`, `og:image` and `twitter:image` (`YOUR-USERNAME`), and the footer portfolio link.
- Replace `docs/screenshot.png` (create the `docs/` folder) with a real screenshot.
