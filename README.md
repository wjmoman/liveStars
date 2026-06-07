# liveStars

A browser widget for **huskerboard.com** that replaces **stale, hardcoded recruit ratings** with **live** star ratings and rankings pulled from a recruiting data source.

## The problem it solves
HuskerBoard recruit pages show ratings that were typed in once and go out of date. liveStars fetches current data and updates the page dynamically.

## Why a backend is required
A browser-only widget **cannot** securely/reliably get this data:
- 247Sports / Rivals / On3 / ESPN have **no public API** and are **Cloudflare-protected** → direct browser `fetch()` fails (CORS + bot protection).
- An API key must **never** be shipped in browser JS.

So liveStars uses a **small serverless proxy** that fetches + normalizes + caches data server-side, and the widget calls that proxy.

## Data sources (pick per your needs / compliance)
| Source | What you get | Tradeoffs |
|--------|--------------|-----------|
| **CollegeFootballData.com (CFBD)** — *recommended start* | 247Sports **Composite** stars, rating, national rank (clean JSON, free key) | No per-site breakdown; updates can lag |
| **Per-site scrape (On3 industry profile, etc.)** | 247 / Rivals / On3 / ESPN broken out | **May violate site ToS**; brittle; needs anti-bot handling |
| **Paid scraper (e.g., Apify actor)** | All sites broken out | Costs money; offloads scraping/maintenance |

> ⚠️ **Compliance:** Scraping 247/On3/Rivals/ESPN may breach their Terms of Service. Prefer the CFBD API (or a licensed feed). If you display third-party ratings, attribute the source. Check the sites' ToS before scraping.

## Architecture
```
HuskerBoard recruit page (stale ratings + LINKS to 247/Rivals/On3/ESPN profiles)
        │  widget scans the page for those profile links
        ▼
liveStars widget (web/widget.js)  ──HTTP──►  liveStars proxy (server/)
   findSourceLinks() detects links            │ fetches each profile server-side,
        ▲                                       │ parses ratings, merges, caches
        │  normalized JSON (all sites)          ▼
        └────────────────────────  On3 profile (all 4 sites) / 247 / Rivals / ESPN
        │
        ▼
  widget renders a fresh ratings card / overwrites stale numbers
```
**Key insight:** the recruit page already links out to each site's profile, so the widget
just harvests those URLs (`findSourceLinks`) and hands them to the proxy — no name search.
An **On3 profile carries 247/Rivals/On3/ESPN together**, so one link can fill the whole table.

## Project structure
```
liveStars/
├─ README.md
├─ server/
│  ├─ api/recruit.js      # Serverless handler: links → normalized JSON (CORS, cache)
│  └─ sources/
│     ├─ dispatch.js      # Routes a profile URL to its parser; merges across sites
│     ├─ on3.js           # On3 profile parser (extracts __NEXT_DATA__ JSON — all 4 sites)
│     └─ cfbd.js          # CFBD API fallback (247 Composite, by name+year)
├─ web/
│  ├─ index.html          # Demo harness (open in browser)
│  ├─ widget.js           # Fetches from proxy, renders, replaces stale ratings
│  └─ styles.css
└─ sample/
   └─ recruit-sample.json # Sample normalized data (offline demo)
```

## Normalized data model
```json
{
  "name": "Bryce Williams",
  "position": "CB",
  "classYear": 2027,
  "height": "6-2", "weight": 175,
  "hometown": "Fort Lauderdale, FL",
  "highSchool": "Western",
  "commit": { "school": "Nebraska", "date": "2026-06-06" },
  "ratings": [
    { "site": "247 Composite", "stars": 4, "rating": 0.9123, "natRank": 321, "posRank": 37, "stateRank": 40 }
  ],
  "source": "CFBD",
  "updatedAt": "2026-06-06T00:00:00Z"
}
```

## Quick start
1. **Demo (offline):** open `web/index.html` — it loads `sample/recruit-sample.json`.
2. **Live data:** get a free CFBD key (https://collegefootballdata.com/key), deploy `server/api/recruit.js` to Vercel/Cloudflare/Netlify with the key as an env var, then set `LIVESTARS_API` in `web/widget.js` to your endpoint.
3. **Local end-to-end:** `npm run dev`, then open `http://localhost:8787/web/demo-board-text.html` (manual) or `…/web/demo-auto.html` (automatic).

## Automatic mode (production)
Add this to the HuskerBoard recruit page/template **before** loading the widget — it runs on
load with no button: finds the recruit post, reads its 247/Rivals/ESPN links, fetches live data
through your proxy, and overwrites the rank/rating numbers in place.

```html
<script>
  window.LIVESTARS_API   = 'https://your-proxy.example.com/api/recruit';
  window.LIVESTARS_AUTO  = true;    // run automatically on load
  window.LIVESTARS_REPORT = false;  // hide the changelog panel for normal visitors
</script>
<script src="https://your-host/widget.js"></script>
```
- Only posts containing a `#N Overall` rating line are touched; other forum pages are ignored.
- Lines with no live data (e.g., legacy standalone **Rivals**) are **kept**, never blanked.
- Star icons (⭐ emoji images) are updated too — added/removed to match the live star count.

## Tests
`npm test` — jsdom tests for the board-post overwrite and the auto-run (no browser needed).

## Firefox extension (no proxy needed)
`extension/` is a Manifest V3 WebExtension. Because it declares `host_permissions`, its
background script fetches On3/247 **directly cross-origin**, so the server proxy is NOT
required for the extension.

```
extension/
├─ manifest.json   # MV3, content script on huskerboard.com, host perms for On3/247/Rivals/ESPN
├─ background.js   # cross-origin fetch + On3/247 parsers + merge (replaces the proxy)
├─ content.js      # detects the recruit post, requests data, overwrites in place + changelog
└─ content.css     # highlight + changelog styles
```

**Load it in Firefox (temporary, for testing):**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `extension/manifest.json`
4. Visit a HuskerBoard recruit thread — ratings update automatically on load.

**Flow:** content script finds the recruit post → reads its On3/247/Rivals/ESPN links →
asks the background to fetch+parse them → overwrites the rank/rating numbers AND star icons
in place, and shows the changelog.

> Permanent install requires signing the add-on via Mozilla (AMO or self-distribution).

## Status
🟢 **On3 source working & verified against live profiles.** The widget reads the recruit's
On3 profile link from the page, the proxy fetches it server-side, and the parser extracts
per-site ratings (On3 Industry, On3, 247Sports, ESPN, Rivals) from `__NEXT_DATA__`
(`pageProps.rankingsAll.list[0].ratings`), plus name/position/height/weight/hometown/commit.
CFBD remains as a name+year fallback.

### Verified example
`GET /api/recruit?on3=https://www.on3.com/db/<slug>/` returns:
```json
{ "name":"…","position":"…","height":"6-3","commit":{"school":"…"},
  "ratings":[{"site":"On3 Industry",...},{"site":"247Sports",...,"link":"https://247sports.com/..."}, ...] }
```
