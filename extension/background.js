// liveStars background — fetches recruiting-site profiles cross-origin (allowed by
// host_permissions) and returns normalized recruit data. Replaces the proxy server.
// Arrière-plan liveStars — récupère les profils en cross-origin et renvoie les données.

const api = (typeof browser !== 'undefined') ? browser : chrome;

// ---- On3 parser (also handles Rivals links, which redirect to On3) ----
const SITE_LABELS = { 'Industry': 'On3 Industry', 'On3': 'On3', '247': '247Sports', 'Espn': 'ESPN', 'Rivals': 'Rivals' };

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function on3Map(nextData) {
  const pp = (nextData.props && nextData.props.pageProps) || {};
  const player = pp.player || {};
  let list = null;
  try { list = pp.rankingsAll.list[0].ratings; } catch (e) { list = null; }
  const ratings = (Array.isArray(list) ? list : [])
    .filter(r => SITE_LABELS[r.type])
    .map(r => ({
      site: SITE_LABELS[r.type],
      stars: r.stars != null ? r.stars : null,
      rating: r.rating != null ? r.rating : null,
      natRank: r.overallRank != null ? r.overallRank : null,
      posRank: r.positionRank != null ? r.positionRank : null,
      stateRank: r.stateRank != null ? r.stateRank : null,
      link: r.link || null
    }));
  const ps = player.playerStatus;
  const commit = (ps && ps.type === 'Committed' && ps.committedOrganization)
    ? { school: ps.committedOrganization.name || ps.committedOrganization.fullName || null, date: ps.date || null }
    : null;
  return {
    name: player.name || null,
    position: player.positionAbbreviation || player.primaryPosition || null,
    classYear: player.classYear || null,
    height: player.height || null,
    weight: player.weight || null,
    hometown: player.hometownName || null,
    highSchool: player.highSchoolName || player.highSchool || null,
    commit, ratings, source: 'On3', updatedAt: new Date().toISOString()
  };
}

async function fetchOn3(url) {
  const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
  if (!res.ok) throw new Error('On3 fetch ' + res.status);
  const data = extractNextData(await res.text());
  if (!data) throw new Error('On3 __NEXT_DATA__ missing');
  return on3Map(data);
}

// ---- 247 parser (247Sports + 247 Composite sections) ----
const US_STATES = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO ' +
  'MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));

function parse247(html, profileUrl) {
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
      else if (US_STATES.has(label.toUpperCase())) stateRank = num;
      else posRank = num;
    }
    ratings.push({
      site: /composite/i.test(title) ? '247 Composite' : '247Sports',
      stars, rating, natRank, posRank, stateRank, link: profileUrl
    });
  }
  return { ratings, source: '247Sports', updatedAt: new Date().toISOString() };
}

async function fetch247(url) {
  const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
  if (!res.ok) throw new Error('247 fetch ' + res.status);
  return parse247(await res.text(), url);
}

// ---- Dispatch + merge (247 site wins 247 rows; On3 fills the rest) ----
async function fromUrl(key, url) {
  if (!url) return null;
  if (key === 'on3' || key === 'rivals') return fetchOn3(url);
  if (key === 's247') return fetch247(url);
  return null; // espn covered by On3
}

async function aggregate(links) {
  const PRIORITY = ['s247', 'on3', 'rivals', 'espn'];
  const keys = Object.keys(links || {}).sort(
    (a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99)
  );
  const results = await Promise.allSettled(keys.map(k => fromUrl(k, links[k])));
  const merged = { name: null, position: null, classYear: null, height: null, weight: null,
    hometown: null, highSchool: null, commit: null, ratings: [], sources: [], updatedAt: new Date().toISOString() };
  const seen = new Set();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value) return;
    const v = r.value;
    merged.sources.push(keys[i]);
    ['name','position','classYear','height','weight','hometown','highSchool','commit']
      .forEach(f => { if (merged[f] == null && v[f] != null) merged[f] = v[f]; });
    (v.ratings || []).forEach(rt => {
      const sk = (rt.site || '').toLowerCase();
      if (!seen.has(sk)) { seen.add(sk); merged.ratings.push(rt); }
    });
  });
  return (merged.ratings.length || merged.name) ? merged : null;
}

// ---- Message handler from the content script ----
api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'liveStars:fetchRecruit') return false;
  // Returning a Promise responds asynchronously (Firefox MV3).
  return aggregate(msg.links || {}).then(data => ({ ok: true, data }))
    .catch(e => ({ ok: false, error: String(e.message || e) }));
});
