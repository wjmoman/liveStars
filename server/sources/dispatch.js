// Source dispatcher: route a recruiting-site profile URL to the right parser,
// fetch it server-side, and return per-site ratings. Then merge across sources.
// Répartiteur de sources : route une URL de profil vers le bon parseur.

const on3 = require('./on3');
const s247 = require('./s247');   // 247Sports profile parser (247Sports + 247 Composite)

// Fetch + parse one source URL. Returns a normalized recruit (with ratings) or null.
// Récupère + analyse une URL source.
async function fromUrl(key, url) {
  if (!url) return null;
  switch (key) {
    case 'on3':
    case 'rivals':
      // On3 profiles carry the full industry comparison (Industry / On3 / 247 / ESPN / Rivals).
      // Rivals links (n.rivals.com) now REDIRECT to On3, so the On3 parser handles both —
      // and On3's data already includes the ESPN rating, so no separate ESPN fetch is needed.
      // Les liens Rivals redirigent vers On3 ; le parseur On3 gère les deux (ESPN inclus).
      return on3.fetchRecruit({ profileUrl: url });
    case 's247':
      // 247 profile yields the authoritative 247Sports + 247 Composite ratings.
      // Le profil 247 fournit les notes 247Sports + 247 Composite.
      return s247.fetchRecruit({ profileUrl: url });
    case 'espn':
      // ESPN's own site isn't parsed directly; On3 already provides the ESPN rating.
      // If a page links ONLY ESPN (no On3/Rivals), add a dedicated parser here.
      // ESPN non analysé directement ; On3 fournit déjà la note ESPN.
      return null;
    default:
      return null;
  }
}

// Merge results from multiple sources into one normalized recruit.
// Fusionne les résultats de plusieurs sources en une recrue normalisée.
async function aggregate(links) {
  // Process in priority order so authoritative sources win the de-dupe:
  // 247 site owns the 247 rows; On3 owns Industry/Rivals/ESPN/On3.
  // Ordre de priorité : le site 247 prime pour les lignes 247 ; On3 pour le reste.
  const PRIORITY = ['s247', 'on3', 'rivals', 'espn'];
  const keys = Object.keys(links || {}).sort(
    (a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99)
  );
  const results = await Promise.allSettled(keys.map(k => fromUrl(k, links[k])));

  const merged = { name: null, position: null, classYear: null, height: null,
    weight: null, hometown: null, highSchool: null, commit: null,
    ratings: [], sources: [], updatedAt: new Date().toISOString() };

  const seenSites = new Set();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value) return;
    const v = r.value;
    merged.sources.push(keys[i]);
    // fill scalar fields from the first source that has them / champs scalaires
    ['name','position','classYear','height','weight','hometown','highSchool','commit']
      .forEach(f => { if (merged[f] == null && v[f] != null) merged[f] = v[f]; });
    // collect ratings, de-duping by site name / regrouper les notes par site
    (v.ratings || []).forEach(rt => {
      const key = (rt.site || '').toLowerCase();
      if (!seenSites.has(key)) { seenSites.add(key); merged.ratings.push(rt); }
    });
  });

  return merged.ratings.length || merged.name ? merged : null;
}

module.exports = { aggregate, fromUrl };
