// On3 profile source — fetch a profile URL server-side and extract per-site ratings.
// Source de profil On3 — récupère une URL de profil et extrait les notes par site.
//
// On3 is a Next.js site; page data lives in <script id="__NEXT_DATA__">. An individual
// profile embeds the full industry comparison at:
//   props.pageProps.rankingsAll.list[0].ratings  → [{ type, link, rating, stars,
//     overallRank, positionRank, positionAbbr, stateRank, stateAbbr }, ...]
// with type ∈ {Industry, Consensus, On3, 247, Espn, Rivals}.
// On3 (Next.js) : les données sont dans __NEXT_DATA__ ; la comparaison par site est
// dans pageProps.rankingsAll.list[0].ratings.
//
// Verified against live profiles (2026). / Vérifié sur des profils réels (2026).

const UA = 'Mozilla/5.0 (compatible; liveStarsBot/0.1; +https://huskerboard.com)';

// Map On3's internal "type" labels to display site names.
// Associe les libellés "type" d'On3 aux noms de sites affichés.
const SITE_LABELS = {
  'Industry': 'On3 Industry',
  'On3': 'On3',
  '247': '247Sports',
  'Espn': 'ESPN',
  'Rivals': 'Rivals'
  // 'Consensus' intentionally omitted — duplicates Industry. / 'Consensus' omis (doublon).
};

async function fetchRecruit({ profileUrl }) {
  if (!profileUrl) return null;
  const res = await fetch(profileUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!res.ok) throw new Error('On3 fetch failed: ' + res.status);
  const html = await res.text();

  const data = extractNextData(html);
  if (!data) throw new Error('On3 __NEXT_DATA__ not found (page shape changed?)');

  return mapRecruit(data);
}

// Pull and parse the __NEXT_DATA__ JSON blob from the HTML.
// Extrait et analyse le blob JSON __NEXT_DATA__.
function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// Map On3's embedded JSON to the liveStars normalized model.
// Convertit le JSON On3 vers le modèle normalisé liveStars.
function mapRecruit(nextData) {
  const pp = (nextData.props && nextData.props.pageProps) || {};
  const player = pp.player || {};

  const ratings = extractRatings(pp);

  return {
    name: player.name || null,
    position: player.positionAbbreviation || player.primaryPosition || null,
    classYear: player.classYear || null,
    height: player.height || null,            // already formatted, e.g. "6-3" / déjà formaté
    weight: player.weight || null,
    hometown: player.hometownName || null,    // already "City, ST" / déjà "Ville, ST"
    highSchool: player.highSchoolName || player.highSchool || null,
    commit: extractCommit(pp),
    ratings,
    source: 'On3',
    profileUrl: pp.canonicalUrl || null,
    updatedAt: new Date().toISOString()
  };
}

// Read the per-site ratings array; fall back to a tree search if the path moves.
// Lit le tableau des notes par site ; repli par recherche si le chemin change.
function extractRatings(pp) {
  let list = null;
  try { list = pp.rankingsAll.list[0].ratings; } catch (e) { list = null; }
  if (!Array.isArray(list)) list = findRatingsArray(pp);
  if (!Array.isArray(list)) return [];

  return list
    .filter(r => SITE_LABELS[r.type])               // keep known sites / sites connus
    .map(r => ({
      site: SITE_LABELS[r.type],
      stars: r.stars ?? null,
      rating: r.rating ?? null,
      natRank: r.overallRank ?? null,
      posRank: r.positionRank ?? null,
      stateRank: r.stateRank ?? null,
      link: r.link || null
    }));
}

// Commit info from player.playerStatus (type "Committed"). / Engagement depuis playerStatus.
function extractCommit(pp) {
  const s = pp.player && pp.player.playerStatus;
  if (s && s.type === 'Committed' && s.committedOrganization) {
    return {
      school: s.committedOrganization.name || s.committedOrganization.fullName || null,
      date: s.date || null
    };
  }
  return null;
}

// Fallback: locate the ratings array anywhere in the tree (type ∈ known sites).
// Repli : localise le tableau des notes n'importe où dans l'arbre.
function findRatingsArray(root) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node) && node.some(x => x && SITE_LABELS[x.type] && (x.rating != null || x.stars != null))) {
      found = node; return;
    }
    for (const k in node) if (node[k] && typeof node[k] === 'object') walk(node[k]);
  })(root);
  return found;
}

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return null;
}

module.exports = { fetchRecruit, extractNextData, mapRecruit, extractRatings };
