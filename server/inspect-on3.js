// On3 profile inspector — dumps the structure of __NEXT_DATA__ so we can map fields.
// Inspecteur de profil On3 — affiche la structure de __NEXT_DATA__ pour le mappage.
//
// Usage:  node server/inspect-on3.js "https://www.on3.com/db/<recruit-slug>/"
// Then paste the output back so the on3.js mapping can be finalized.
// Utilisation : node server/inspect-on3.js "<URL>"  puis collez la sortie.

const { extractNextData } = require('./sources/on3');

const UA = 'Mozilla/5.0 (compatible; liveStarsBot/0.1; +https://huskerboard.com)';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Provide an On3 profile URL. / Fournir une URL de profil On3.');
    process.exit(1);
  }

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  console.log('HTTP', res.status, res.headers.get('content-type'));
  if (!res.ok) { console.error('Fetch failed (Cloudflare?). Try from your own network.'); process.exit(1); }

  const html = await res.text();
  const data = extractNextData(html);
  if (!data) {
    console.error('__NEXT_DATA__ not found. Dumping any inline JSON <script> ids instead:');
    (html.match(/<script[^>]*id="([^"]+)"/g) || []).forEach(s => console.log('  ', s));
    process.exit(1);
  }

  const pp = (data.props && data.props.pageProps) || {};
  console.log('\n=== pageProps top-level keys ===');
  console.log(Object.keys(pp));

  console.log('\n=== rating-like objects found (verify field names) ===');
  findRatings(pp).slice(0, 12).forEach(o => console.log(JSON.stringify(o)));

  console.log('\n=== candidate player object keys ===');
  const player = pp.player || pp.recruit || pp.data || {};
  console.log(Object.keys(player));
}

// Walk JSON for objects that mention a site/organization plus a star/rating/rank.
// Parcourt le JSON pour les objets mentionnant un site + une note/un classement.
function findRatings(root) {
  const out = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    const site = node.organization || node.site || node.source || node.outlet;
    const hasRating = node.stars != null || node.rating != null || node.rank != null || node.ranking != null;
    if (site && hasRating) out.push(node);
    for (const k in node) if (typeof node[k] === 'object') walk(node[k]);
  })(root);
  return out;
}

main().catch(e => { console.error(e); process.exit(1); });
