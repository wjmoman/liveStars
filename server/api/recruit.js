// liveStars proxy endpoint — normalized recruit data with caching + CORS.
// Point d'accès proxy liveStars — données normalisées avec cache + CORS.
//
// Primary mode: the widget passes recruiting-site PROFILE URLs it read from the
// HuskerBoard page (e.g. ?on3=https://on3.com/db/...). We fetch + parse server-side.
// Mode principal : le widget transmet les URL de profil lues sur la page HuskerBoard.
//
// Fallback mode: ?name=...&year=... uses the CFBD API (247 Composite only).
// Mode de repli : ?name=...&year=... utilise l'API CFBD.

const dispatch = require('../sources/dispatch');
const cfbd = require('../sources/cfbd');

const CACHE = new Map();
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours / 6 heures
const SOURCE_KEYS = ['on3', 's247', 'rivals', 'espn'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const q = req.query || {};

    // Collect any source profile URLs the widget detected on the page.
    // Rassemble les URL de profil détectées par le widget.
    const links = {};
    SOURCE_KEYS.forEach(k => { if (q[k]) links[k] = q[k]; });

    const cacheKey = Object.keys(links).length
      ? 'links::' + JSON.stringify(links)
      : `cfbd::${q.year}::${String(q.name || '').toLowerCase().trim()}`;

    const hit = CACHE.get(cacheKey);
    if (hit && Date.now() - hit.t < TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(hit.data);
    }

    let data = null;

    if (Object.keys(links).length) {
      // Primary: aggregate per-site ratings from the provided profile links.
      // Principal : agréger les notes par site à partir des liens fournis.
      data = await dispatch.aggregate(links);
    } else if (q.name && q.year) {
      // Fallback: CFBD composite by name + class year.
      // Repli : composite CFBD par nom + année.
      data = await cfbd.fetchRecruit({ name: q.name, year: Number(q.year), apiKey: process.env.CFBD_API_KEY });
    } else {
      return res.status(400).json({
        error: 'Provide source links (on3/s247/rivals/espn) OR name+year / Fournir des liens OU name+year'
      });
    }

    if (!data) return res.status(404).json({ error: 'recruit not found / recrue introuvable' });

    CACHE.set(cacheKey, { t: Date.now(), data });
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};
