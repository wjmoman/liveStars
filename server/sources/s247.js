// 247Sports profile source — server-side fetch + parse of the rankings sections.
// Source de profil 247Sports — récupération et analyse côté serveur.
//
// 247 server-renders two <section class="rankings-section"> blocks:
//   • "247Sports"            → individual 247 rating (0–100 scale)
//   • "247Sports Composite®" → the Composite (0–1 scale) with National/Pos/State ranks
// Each has a .stars-block (count .icon-starsolid.yellow), a .rank-block (rating),
// and a .ranks-list of <li><b>LABEL</b>…<strong>NUM</strong></li>.
// 247 affiche deux sections de classement, analysées ci-dessous.
//
// Verified against a live 247 profile (2026). / Vérifié sur un profil 247 réel.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// US state abbreviations — used to tell a state rank label (FL) from a position (CB).
// Abréviations d'États US — pour distinguer un classement d'État (FL) d'une position (CB).
const US_STATES = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO ' +
  'MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));

async function fetchRecruit({ profileUrl }) {
  if (!profileUrl) return null;
  const res = await fetch(profileUrl, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (!res.ok) throw new Error('247 fetch failed: ' + res.status);
  return parseProfile(await res.text(), profileUrl);
}

// Parse the rankings sections + basic bio from a 247 profile HTML string.
// Analyse les sections de classement + bio depuis le HTML du profil 247.
function parseProfile(html, profileUrl) {
  const ratings = [];
  const sectionRe = /<section class="rankings-section">([\s\S]*?)<\/section>/g;
  let m;
  while ((m = sectionRe.exec(html))) {
    const sec = m[1];
    const titleRaw = (sec.match(/<h3 class="title">([\s\S]*?)<\/h3>/) || [])[1] || '';
    const title = titleRaw.replace(/&reg;/gi, '').replace(/<[^>]+>/g, '').trim();

    const starsBlock = (sec.match(/<div class="stars-block">([\s\S]*?)<\/div>/) || [])[1] || '';
    const stars = (starsBlock.match(/icon-starsolid\s+yellow/g) || []).length || null;

    const ratingRaw = (sec.match(/<div class="rank-block">\s*([\d.]+)\s*<\/div>/) || [])[1];
    const rating = ratingRaw != null ? Number(ratingRaw) : null;

    let natRank = null, posRank = null, stateRank = null;
    const liRe = /<li>\s*<b>([\s\S]*?)<\/b>([\s\S]*?)<\/li>/g;
    let li;
    while ((li = liRe.exec(sec))) {
      const label = li[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '').trim();
      const numM = li[2].match(/<strong>\s*(\d+)\s*<\/strong>/);
      const num = numM ? Number(numM[1]) : null;
      if (/natl/i.test(label)) natRank = num;
      else if (US_STATES.has(label.toUpperCase())) stateRank = num; // e.g. FL
      else posRank = num;                                           // position, e.g. CB
    }

    const isComposite = /composite/i.test(title);
    ratings.push({
      site: isComposite ? '247 Composite' : '247Sports',
      stars, rating, natRank, posRank, stateRank,
      link: profileUrl
    });
  }

  const bio = parseBio(html);
  return {
    name: bio.name || null,
    position: bio.position || null,
    height: bio.height || null,
    weight: bio.weight || null,
    ratings,
    source: '247Sports',
    updatedAt: new Date().toISOString()
  };
}

// Pull name/height/weight from the Person ld+json block. / Bio depuis ld+json.
function parseBio(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      if (j['@type'] === 'Person') {
        return {
          name: j.name || null,
          position: null,
          height: Array.isArray(j.height) && j.height[0] ? j.height[0].value : null,
          weight: Array.isArray(j.weight) && j.weight[0] ? Number(j.weight[0].value) : null
        };
      }
    } catch (e) { /* skip malformed block */ }
  }
  return {};
}

module.exports = { fetchRecruit, parseProfile };
