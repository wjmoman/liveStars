// liveStars content script — runs on huskerboard.com. Detects a recruit post,
// asks the background for live ratings, and overwrites the numbers in place.
// Script de contenu liveStars — détecte un message de recrue et remplace les notes.
(function () {
  'use strict';
  const api = (typeof browser !== 'undefined') ? browser : chrome;

  const SOURCE_HOSTS = { 'on3.com': 'on3', '247sports.com': 's247', 'rivals.com': 'rivals', 'espn.com': 'espn' };

  function findSourceLinks(root) {
    const out = {};
    const anchors = (root || document).querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i++) {
      try {
        const host = new URL(anchors[i].href).hostname.replace(/^www\./, '');
        for (const domain in SOURCE_HOSTS) {
          if (host === domain || host.endsWith('.' + domain)) {
            const key = SOURCE_HOSTS[domain];
            if (!out[key]) out[key] = anchors[i].href;
          }
        }
      } catch (e) { /* ignore */ }
    }
    return out;
  }

  function normSite(s) { return String(s || '').toLowerCase().replace(/sports|\.com|\s|_/g, ''); }
  function indexBySite(ratings) { const m = {}; (ratings || []).forEach(r => { m[normSite(r.site)] = r; }); return m; }
  function matchSite(map, site) {
    const n = normSite(site);
    if (map[n]) return map[n];
    const aliases = { 'rivalsindustry': 'on3industry', 'industry': 'on3industry', '247sports': '247', 'composite': '247composite', '247composite': '247composite' };
    return map[aliases[n]] || null;
  }
  function formatRating(value) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    const s = num < 1 ? num.toFixed(4) : num.toFixed(2);
    return s.replace(/\.?0+$/, '');
  }

  // Overwrite the rating numbers inside a XenForo post body. Stars left for later.
  function updateBoardPost(recruit, postEl) {
    const bySite = indexBySite(recruit.ratings);
    const changes = [];
    const statsRe = /#(\d+)\s*Overall;\s*#(\d+)\s*([A-Za-z]{1,5});(?:\s*([\d.]+)\s*;)?/;
    const walker = document.createTreeWalker(postEl, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach(node => {
      const text = node.nodeValue;
      if (!statsRe.test(text)) return;
      let label = null;
      const bare = text.match(/^\s*([A-Za-z0-9 ]+?)\s*:/);
      if (bare && /[A-Za-z]/.test(bare[1])) label = bare[1].trim();
      else {
        let p = node.previousSibling;
        while (p && p.nodeType === 3 && !(p.nodeValue || '').trim()) p = p.previousSibling;
        if (p && p.nodeType === 1) label = (p.textContent || '').trim();
      }
      if (!label) return;
      const rating = matchSite(bySite, label);
      if (!rating) return;

      const newText = text.replace(statsRe, (m, oldNat, oldPos, pos, oldRating) => {
        const natOut = rating.natRank != null ? String(rating.natRank) : oldNat;
        const posOut = rating.posRank != null ? String(rating.posRank) : oldPos;
        changes.push({ site: label, field: 'natRank', oldValue: '#' + oldNat, newValue: '#' + natOut, changed: rating.natRank != null && oldNat !== natOut });
        changes.push({ site: label, field: 'posRank', oldValue: '#' + oldPos, newValue: '#' + posOut, changed: rating.posRank != null && oldPos !== posOut });
        let out = '#' + natOut + ' Overall; #' + posOut + ' ' + pos + ';';
        if (oldRating !== undefined) {
          const rOut = rating.rating != null ? formatRating(rating.rating) : oldRating;
          out += ' ' + rOut + ';';
          changes.push({ site: label, field: 'rating', oldValue: oldRating, newValue: rOut, changed: rating.rating != null && oldRating !== rOut });
        }
        return out;
      });
      if (newText !== text) node.nodeValue = newText;

      // Update the star images on this line to match rating.stars.
      // Met à jour les images d'étoiles pour correspondre à rating.stars.
      if (rating.stars != null) {
        const starImgs = [];
        let sib = node.nextSibling;
        while (sib && !(sib.nodeType === 1 && sib.tagName === 'BR')) {
          if (sib.nodeType === 1 && sib.tagName === 'IMG') starImgs.push(sib);
          sib = sib.nextSibling;
        }
        const oldStars = starImgs.length;
        if (oldStars > 0) {
          if (rating.stars < oldStars) {
            for (let k = rating.stars; k < oldStars; k++) starImgs[k].remove();
          } else if (rating.stars > oldStars) {
            let last = starImgs[oldStars - 1];
            for (let k = oldStars; k < rating.stars; k++) {
              const clone = last.cloneNode(true);
              last.parentNode.insertBefore(clone, last.nextSibling);
              last = clone;
            }
          }
          changes.push({ site: label, field: 'stars', oldValue: oldStars + '★', newValue: rating.stars + '★', changed: oldStars !== rating.stars });
        }
      }
    });
    return changes;
  }

  function renderChangelog(changes, recruit) {
    let host = document.getElementById('ls-changelog');
    if (!host) { host = document.createElement('div'); host.id = 'ls-changelog'; document.body.appendChild(host); }
    const updated = changes.filter(c => c.changed).length;
    const rows = changes.map(c =>
      '<tr class="' + (c.changed ? 'ls-row-changed' : 'ls-row-same') + '">' +
      '<td>' + c.site + '</td><td>' + c.field + '</td>' +
      '<td class="ls-old">' + (c.oldValue || '—') + '</td>' +
      '<td>' + (c.changed ? '→' : '=') + '</td>' +
      '<td class="ls-new">' + c.newValue + '</td></tr>').join('');
    host.innerHTML =
      '<div class="ls-changelog"><div class="ls-cl-head">liveStars updated ' + updated + ' of ' + changes.length +
      ' field(s) · source: ' + (recruit.sources ? recruit.sources.join('+') : (recruit.source || '—')) + '</div>' +
      '<table class="ls-cl-table"><thead><tr><th>Site</th><th>Field</th><th>Old</th><th></th><th>New</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // Find the recruit post, request data, overwrite. / Trouve le message, récupère, remplace.
  function run() {
    const wraps = document.querySelectorAll('.bbWrapper');
    let post = null;
    for (let i = 0; i < wraps.length; i++) {
      if (/#\d+\s*Overall/.test(wraps[i].textContent || '')) { post = wraps[i]; break; }
    }
    if (!post) return; // not a recruit ratings page

    const links = findSourceLinks(post);
    if (!Object.keys(links).length) return;

    api.runtime.sendMessage({ type: 'liveStars:fetchRecruit', links: links })
      .then(resp => {
        if (!resp || !resp.ok || !resp.data) {
          console.warn('liveStars:', resp && resp.error ? resp.error : 'no data');
          return;
        }
        const changes = updateBoardPost(resp.data, post);
        renderChangelog(changes, resp.data);
      })
      .catch(e => console.warn('liveStars message failed:', e.message || e));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
