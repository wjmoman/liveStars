/* liveStars widget — fetches live recruit ratings and renders a card.
   Widget liveStars — récupère les notes en direct et affiche une carte. */
(function (global) {
  'use strict';

  // Point this at your deployed proxy. For the offline demo it falls back to the sample.
  // Pointez ceci vers votre proxy déployé. La démo hors-ligne utilise l'échantillon.
  const LIVESTARS_API = global.LIVESTARS_API || ''; // e.g. 'https://your-proxy.vercel.app/api/recruit'

  // --- Data ---------------------------------------------------------------

  // Recruiting-site hostnames we know how to read. / Sites de recrutement reconnus.
  var SOURCE_HOSTS = {
    'on3.com': 'on3',
    '247sports.com': 's247',
    'rivals.com': 'rivals',
    'espn.com': 'espn'
  };

  // Scan a page (or any root element) for links to recruiting-site profiles.
  // Analyse la page pour trouver les liens vers les profils des sites de recrutement.
  // Returns e.g. { on3: 'https://on3.com/db/...', s247: '...' }
  function findSourceLinks(root) {
    var scope = root || document;
    var out = {};
    var anchors = scope.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].href;
      try {
        var host = new URL(href).hostname.replace(/^www\./, '');
        for (var domain in SOURCE_HOSTS) {
          if (host === domain || host.endsWith('.' + domain)) {
            var key = SOURCE_HOSTS[domain];
            if (!out[key]) out[key] = href; // keep first match per site / garder le 1er lien
          }
        }
      } catch (e) { /* ignore malformed href / ignorer href invalide */ }
    }
    return out;
  }

  // Fetch normalized recruit data from the proxy using detected source links.
  // Récupère les données via le proxy à partir des liens détectés.
  async function getRecruit(opts) {
    opts = opts || {};
    if (LIVESTARS_API && opts.links && Object.keys(opts.links).length) {
      var qs = Object.keys(opts.links)
        .map(function (k) { return k + '=' + encodeURIComponent(opts.links[k]); })
        .join('&');
      var res = await fetch(LIVESTARS_API + '?' + qs);
      if (!res.ok) throw new Error('liveStars API ' + res.status);
      return res.json();
    }
    // Offline demo fallback / Repli pour la démo hors-ligne
    var sres = await fetch(opts.sampleUrl || '../sample/recruit-sample.json');
    if (!sres.ok) throw new Error('sample load failed / échec du chargement');
    return sres.json();
  }

  // --- Render -------------------------------------------------------------

  function stars(n) {
    if (n == null) return '<span class="ls-empty">—</span>';
    const full = '★'.repeat(n);
    const empty = '<span class="ls-empty">' + '★'.repeat(Math.max(0, 5 - n)) + '</span>';
    return full + empty;
  }

  function fmtRank(v) { return v == null ? '—' : '#' + v; }
  function fmtRating(v) { return v == null ? '—' : v; }

  // Build the widget DOM from a normalized recruit object.
  // Construit le DOM du widget à partir de l'objet recrue normalisé.
  function render(recruit, el) {
    const r = recruit;
    const updated = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '';
    const rows = (r.ratings || []).map(function (s) {
      return (
        '<tr>' +
        '<td>' + s.site + '</td>' +
        '<td class="ls-stars">' + stars(s.stars) + '</td>' +
        '<td>' + fmtRating(s.rating) + '</td>' +
        '<td>' + fmtRank(s.natRank) + '</td>' +
        '<td>' + fmtRank(s.posRank) + '</td>' +
        '<td>' + fmtRank(s.stateRank) + '</td>' +
        '</tr>'
      );
    }).join('');

    el.innerHTML =
      '<div class="ls-widget">' +
        '<div class="ls-head">' +
          '<p class="ls-name">' + (r.name || 'Recruit') +
            (r.position ? ' <span class="ls-badge">' + r.position + '</span>' : '') + '</p>' +
          '<div class="ls-sub">' +
            [r.classYear, r.commit && r.commit.school ? (r.commit.school + ' commit') : null]
              .filter(Boolean).join(' · ') +
          '</div>' +
        '</div>' +
        '<div class="ls-meta">' +
          (r.height ? '<span><b>Ht</b> ' + r.height + '</span>' : '') +
          (r.weight ? '<span><b>Wt</b> ' + r.weight + '</span>' : '') +
          (r.hometown ? '<span><b>Home</b> ' + r.hometown + '</span>' : '') +
          (r.highSchool ? '<span><b>HS</b> ' + r.highSchool + '</span>' : '') +
        '</div>' +
        '<table class="ls-table">' +
          '<thead><tr><th>Site</th><th>Stars</th><th>Rating</th><th>Nat</th><th>Pos</th><th>State</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<div class="ls-foot">' +
          '<span>Source: ' + (r.source || '—') + (updated ? ' · updated ' + updated : '') + '</span>' +
        '</div>' +
      '</div>';
  }

  // --- In-place overwrite ------------------------------------------------

  // Normalize a site label for loose matching (strip spaces/case/punctuation).
  // Normalise un libellé de site pour une correspondance souple.
  function normSite(s) {
    return String(s || '').toLowerCase().replace(/sports|\.com|\s|_/g, '');
  }

  // Index ratings by normalized site name. / Indexe les notes par nom de site.
  function indexBySite(ratings) {
    var map = {};
    (ratings || []).forEach(function (r) { map[normSite(r.site)] = r; });
    return map;
  }

  // Match a page-declared site to a rating (exact, then aliases).
  // Associe un site déclaré sur la page à une note (exact, puis alias).
  function matchSite(map, site) {
    var n = normSite(site);
    if (map[n]) return map[n];
    // Board labels → our normalized rating keys. / Libellés du forum → clés normalisées.
    var aliases = {
      'rivalsindustry': 'on3industry', // board "Rivals Industry" = On3 industry ranking
      'industry': 'on3industry',
      '247sports': '247',              // "247Sports" normalizes to "247"
      'composite': '247composite',
      '247composite': '247composite'
    };
    return map[aliases[n]] || null;
  }

  // Format a rating field for display. / Formate un champ de note pour l'affichage.
  function formatField(field, value, fmt) {
    if (value == null) return null;
    if (fmt === 'raw') return String(value);
    if (field === 'natRank' || field === 'posRank' || field === 'stateRank') return '#' + value;
    if (field === 'rating') return formatRating(value);
    return String(value); // stars and anything else as plain number/text
  }

  // Round ratings sensibly: 0–100 scale → 2 dp; 0–1 composite scale → 4 dp.
  // Trailing zeros stripped. / Arrondit : échelle 0–100 → 2 déc., 0–1 → 4 déc.
  function formatRating(value) {
    var num = Number(value);
    if (isNaN(num)) return String(value);
    var s = num < 1 ? num.toFixed(4) : num.toFixed(2);
    return s.replace(/\.?0+$/, ''); // 98.6231→"98.62", 93.00→"93", 0.9255→"0.9255"
  }

  // Overwrite stale values that are tagged with data-ls-site + data-ls-field.
  // Remplace les valeurs périmées balisées par data-ls-site + data-ls-field.
  // Returns a changelog: [{ site, field, oldValue, newValue, changed }].
  function updateInPlace(recruit, opts) {
    opts = opts || {};
    var root = opts.root || document;
    var bySite = indexBySite(recruit.ratings);
    var changes = [];

    var nodes = root.querySelectorAll('[data-ls-site][data-ls-field]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var site = node.getAttribute('data-ls-site');
      var field = node.getAttribute('data-ls-field');
      var fmt = node.getAttribute('data-ls-format');
      var rating = matchSite(bySite, site);
      if (!rating) { continue; }

      var newVal = formatField(field, rating[field], fmt);
      if (newVal == null) { continue; } // no fresh value — leave stale untouched
      var oldVal = (node.textContent || '').trim();

      var changed = String(oldVal) !== String(newVal);
      if (changed) {
        node.textContent = newVal;
        node.classList.add('ls-updated');
        node.setAttribute('title', 'liveStars: was "' + oldVal + '"');
      }
      changes.push({ site: site, field: field, oldValue: oldVal, newValue: newVal, changed: changed });
    }

    if (opts.renderReport !== false) renderChangelog(changes, recruit, opts);
    if (global.console && console.table) {
      console.table(changes.map(function (c) {
        return { site: c.site, field: c.field, old: c.oldValue, 'new': c.newValue, changed: c.changed };
      }));
    }
    return changes;
  }

  // Render a visible "what changed" panel. / Affiche un panneau "ce qui a changé".
  function renderChangelog(changes, recruit, opts) {
    var host = (opts && opts.reportEl) || document.getElementById('ls-changelog');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ls-changelog';
      document.body.appendChild(host);
    }
    var updated = changes.filter(function (c) { return c.changed; });
    var rows = changes.map(function (c) {
      return '<tr class="' + (c.changed ? 'ls-row-changed' : 'ls-row-same') + '">' +
        '<td>' + c.site + '</td><td>' + c.field + '</td>' +
        '<td class="ls-old">' + (c.oldValue || '—') + '</td>' +
        '<td>' + (c.changed ? '→' : '=') + '</td>' +
        '<td class="ls-new">' + c.newValue + '</td></tr>';
    }).join('');
    host.innerHTML =
      '<div class="ls-changelog">' +
        '<div class="ls-cl-head">liveStars updated ' + updated.length + ' of ' + changes.length +
          ' field(s) · source: ' + (recruit.source || '—') + '</div>' +
        '<table class="ls-cl-table"><thead><tr>' +
          '<th>Site</th><th>Field</th><th>Old</th><th></th><th>New</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>';
  }

  // --- In-place overwrite (XenForo post text) ----------------------------

  // Overwrite rating numbers inside a XenForo post body (.bbWrapper), where each
  // rating is a text line like:  <b>Rivals Industry</b>: #197 Overall; #21 CB; 90.56; ★★★★
  // Label may be <b>, <a>, or bare text. Stars (emoji <img>) are left for later.
  // Remplace les numéros de note dans le corps du message XenForo. Étoiles : plus tard.
  //
  // Returns a changelog: [{ site, field, oldValue, newValue, changed }].
  function updateBoardPost(recruit, opts) {
    opts = opts || {};
    var root = opts.root || document;
    var body = opts.postSelector ? root.querySelector(opts.postSelector)
                                  : (root.querySelector('.bbWrapper') || root);
    if (!body) return [];

    var bySite = indexBySite(recruit.ratings);
    var changes = [];
    // #<natRank> Overall; #<posRank> <POS>; [<rating>;]
    var statsRe = /#(\d+)\s*Overall;\s*#(\d+)\s*([A-Za-z]{1,5});(?:\s*([\d.]+)\s*;)?/;

    // Collect text nodes (snapshot first; we mutate as we go).
    // Rassemble les nœuds texte.
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach(function (node) {
      var text = node.nodeValue;
      if (!statsRe.test(text)) return;

      // Determine the site label for this line.
      // Détermine le libellé du site pour cette ligne.
      var label = null;
      var bare = text.match(/^\s*([A-Za-z0-9 ]+?)\s*:/); // e.g. "ESPN: #..."
      if (bare && /[A-Za-z]/.test(bare[1])) {
        label = bare[1].trim();
      } else {
        // Label sits in the preceding <b>/<a> element.
        var p = node.previousSibling;
        while (p && p.nodeType === 3 && !(p.nodeValue || '').trim()) p = p.previousSibling;
        if (p && p.nodeType === 1) label = (p.textContent || '').trim();
      }
      if (!label) return;

      var rating = matchSite(bySite, label);
      if (!rating) return;

      var newText = text.replace(statsRe, function (m, oldNat, oldPos, pos, oldRating) {
        var natOut = rating.natRank != null ? String(rating.natRank) : oldNat;
        var posOut = rating.posRank != null ? String(rating.posRank) : oldPos;

        logChange(changes, label, 'natRank', '#' + oldNat, '#' + natOut, rating.natRank != null && oldNat !== natOut);
        logChange(changes, label, 'posRank', '#' + oldPos, '#' + posOut, rating.posRank != null && oldPos !== posOut);

        var out = '#' + natOut + ' Overall; #' + posOut + ' ' + pos + ';';
        if (oldRating !== undefined) { // line had a rating segment — keep the shape
          var rOut = rating.rating != null ? formatRating(rating.rating) : oldRating;
          out += ' ' + rOut + ';';
          logChange(changes, label, 'rating', oldRating, rOut, rating.rating != null && oldRating !== rOut);
        }
        return out;
      });

      if (newText !== text) node.nodeValue = newText;

      // Update the star images on this line to match rating.stars.
      // Met à jour les images d'étoiles pour correspondre à rating.stars.
      if (rating.stars != null) {
        var starImgs = [];
        var sib = node.nextSibling;
        while (sib && !(sib.nodeType === 1 && sib.tagName === 'BR')) {
          if (sib.nodeType === 1 && sib.tagName === 'IMG') starImgs.push(sib);
          sib = sib.nextSibling;
        }
        var oldStars = starImgs.length;
        if (oldStars > 0) {
          if (rating.stars < oldStars) {
            for (var k = rating.stars; k < oldStars; k++) starImgs[k].remove();
          } else if (rating.stars > oldStars) {
            var last = starImgs[oldStars - 1];
            for (var k2 = oldStars; k2 < rating.stars; k2++) {
              var clone = last.cloneNode(true);
              last.parentNode.insertBefore(clone, last.nextSibling);
              last = clone;
            }
          }
          logChange(changes, label, 'stars', oldStars + '\u2605', rating.stars + '\u2605', oldStars !== rating.stars);
        }
      }
    });

    if (opts.renderReport !== false) renderChangelog(changes, recruit, opts);
    if (global.console && console.table) {
      console.table(changes.map(function (c) {
        return { site: c.site, field: c.field, old: c.oldValue, 'new': c.newValue, changed: c.changed };
      }));
    }
    return changes;
  }

  function logChange(arr, site, field, oldValue, newValue, changed) {
    arr.push({ site: site, field: field, oldValue: oldValue, newValue: newValue, changed: !!changed });
  }

  // --- Auto-run ----------------------------------------------------------

  // Find recruit post bodies, detect their source links, fetch, and overwrite.
  // Trouve les messages de recrue, détecte les liens, récupère et remplace.
  function autoInit(opts) {
    opts = opts || {};
    var sel = opts.postSelector || '.bbWrapper';
    var all = document.querySelectorAll(sel);
    var posts = [];
    for (var i = 0; i < all.length; i++) {
      // Only posts that actually contain a "#N Overall" rating line.
      // Uniquement les messages contenant une ligne "#N Overall".
      if (/#\d+\s*Overall/.test(all[i].textContent || '')) posts.push(all[i]);
    }
    if (opts.firstOnly !== false) posts = posts.slice(0, 1); // default: just the profile post

    return Promise.all(posts.map(function (post) {
      var links = findSourceLinks(post);
      if (!Object.keys(links).length) return null;
      return getRecruit({ links: links })
        .then(function (recruit) {
          return updateBoardPost(recruit, {
            root: post,
            renderReport: opts.renderReport
          });
        })
        .catch(function (e) {
          if (global.console) console.warn('liveStars auto-run failed:', e.message || e);
          return null;
        });
    }));
  }

  // --- Public API ---------------------------------------------------------

  // Mount the widget into a container element.
  // Monte le widget dans un élément conteneur.
  async function mount(el, opts) {
    opts = opts || {};
    // Auto-detect source links from the page unless explicitly provided.
    // Détecte automatiquement les liens depuis la page si non fournis.
    if (!opts.links && LIVESTARS_API) opts.links = findSourceLinks(opts.root || document);
    el.innerHTML = '<div class="ls-loading">Loading live ratings… / Chargement…</div>';
    try {
      var recruit = await getRecruit(opts);
      render(recruit, el);
    } catch (e) {
      el.innerHTML = '<div class="ls-error">Could not load ratings: ' + (e.message || e) + '</div>';
    }
  }

  global.liveStars = { mount: mount, render: render, getRecruit: getRecruit, findSourceLinks: findSourceLinks, updateInPlace: updateInPlace, updateBoardPost: updateBoardPost, autoInit: autoInit };

  // Auto-run on load when enabled. Set on the page BEFORE this script:
  //   window.LIVESTARS_API = 'https://your-proxy/api/recruit';
  //   window.LIVESTARS_AUTO = true;          // opt in to automatic overwrite
  //   window.LIVESTARS_REPORT = false;       // (optional) hide the changelog panel
  // Exécution automatique au chargement si activée.
  if (global.LIVESTARS_AUTO && global.LIVESTARS_API) {
    var go = function () {
      autoInit({ renderReport: global.LIVESTARS_REPORT !== false });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', go);
    } else {
      go();
    }
  }
})(window);
