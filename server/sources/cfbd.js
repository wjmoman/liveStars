// CFBD (CollegeFootballData.com) recruiting source.
// Source de données de recrutement CFBD.
//
// Provides the 247Sports Composite (stars, rating, national ranking) via a
// documented REST API. Requires a free API key (Bearer token), kept server-side.
// Fournit le composite 247Sports via une API REST. Nécessite une clé (côté serveur).

const CFBD_BASE = 'https://api.collegefootballdata.com';

/**
 * Fetch recruits for a class year and find the best match by name.
 * Récupère les recrues d'une promotion et trouve la meilleure correspondance par nom.
 *
 * @param {Object} opts
 * @param {string} opts.name        Recruit name to match / Nom de la recrue
 * @param {number} opts.year        Recruiting class year / Année de la promotion
 * @param {string} opts.apiKey      CFBD API key (server-side only) / Clé API (côté serveur)
 * @returns {Promise<Object|null>}  Normalized recruit or null / Recrue normalisée ou null
 */
async function fetchRecruit({ name, year, apiKey }) {
  if (!apiKey) throw new Error('Missing CFBD API key / Clé API CFBD manquante');
  if (!year) throw new Error('Missing class year / Année manquante');

  const url = `${CFBD_BASE}/recruiting/players?year=${encodeURIComponent(year)}&classification=HighSchool`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`CFBD request failed: ${res.status}`);

  const list = await res.json();
  const match = bestNameMatch(list, name);
  return match ? normalize(match) : null;
}

// Pick the closest name match (case-insensitive exact, else substring).
// Choisit la meilleure correspondance de nom (exacte, sinon sous-chaîne).
function bestNameMatch(list, name) {
  if (!Array.isArray(list) || !name) return null;
  const target = name.trim().toLowerCase();
  return (
    list.find(r => (r.name || '').toLowerCase() === target) ||
    list.find(r => (r.name || '').toLowerCase().includes(target)) ||
    null
  );
}

// Map a CFBD recruit record to the liveStars normalized model.
// Convertit un enregistrement CFBD vers le modèle normalisé liveStars.
function normalize(r) {
  const hometown = [r.city, r.stateProvince].filter(Boolean).join(', ');
  return {
    name: r.name,
    position: r.position || null,
    classYear: r.year || null,
    height: r.height ? inchesToFeet(r.height) : null,
    weight: r.weight || null,
    hometown: hometown || null,
    highSchool: r.school || null,
    commit: r.committedTo ? { school: r.committedTo, date: null } : null,
    ratings: [
      {
        site: '247 Composite',
        stars: r.stars ?? null,
        rating: r.rating ?? null,
        natRank: r.ranking ?? null,
        posRank: null,   // CFBD provides overall ranking only / classement national uniquement
        stateRank: null
      }
    ],
    source: 'CFBD',
    updatedAt: new Date().toISOString()
  };
}

// CFBD height is in inches; format as feet-inches (e.g., 74 -> "6-2").
// La taille CFBD est en pouces ; format pieds-pouces (74 -> "6-2").
function inchesToFeet(inches) {
  const n = Number(inches);
  if (!n) return null;
  return `${Math.floor(n / 12)}-${n % 12}`;
}

module.exports = { fetchRecruit };
