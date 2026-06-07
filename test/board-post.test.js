// Test updateBoardPost against the real board markup using jsdom (no browser).
// Teste updateBoardPost sur le balisage réel du forum via jsdom.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

// Real post body (rating lines) — mirrors the live HuskerBoard markup.
// Deliberately WRONG star counts to verify the star add/remove logic too.
const STAR = '<img class="smilie" alt="star" src="https://x/2b50.png"/>';
function stars(n) { return STAR.repeat(n); }
const POST = `<div class="bbWrapper">
<b>Rivals Industry</b>: #197 Overall; #21 CB; 90.56; ${stars(3)}<br/>
<b>247 Composite</b>: #205 Overall; #21 CB; .9255; ${stars(5)}<br/>
<a href="https://n.rivals.com/x">Rivals</a>: #177 Overall; #16 CB; ${stars(4)}<br/>
<a href="https://247sports.com/Player/x/">247</a>: #208 Overall; #25 CB; ${stars(2)}<br/>
ESPN: #244 Overall; #26 CB; ${stars(4)}<br/>
</div>`;

// Live-merged ratings (from verified proxy output for this recruit).
const recruit = {
  name: 'Example Recruit',
  ratings: [
    { site: '247Sports',     stars: 4, rating: 90,     natRank: null, posRank: 31, stateRank: 25 },
    { site: '247 Composite', stars: 4, rating: 0.9037, natRank: 315,  posRank: 36, stateRank: 27 },
    { site: 'On3 Industry',  stars: 4, rating: 89.64202898550725, natRank: 321, posRank: 37, stateRank: 29 },
    { site: 'On3',           stars: 4, rating: 90,     natRank: 248,  posRank: 32, stateRank: 25 },
    { site: 'ESPN',          stars: 3, rating: 79,     natRank: null, posRank: 34, stateRank: 36 },
    { site: 'Rivals',        stars: null, rating: null, natRank: null, posRank: null, stateRank: null }
  ],
  source: 'On3+247'
};

const dom = new JSDOM('<!DOCTYPE html><body>' + POST + '<div id="ls-changelog"></div></body>');
const { window } = dom;

// Load widget.js into this window context.
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'widget.js'), 'utf8');
const run = new Function('window', 'document', 'NodeFilter', 'console', code + '\nreturn window.liveStars;');
const liveStars = run(window, window.document, window.NodeFilter, console);

const changes = liveStars.updateBoardPost(recruit, { root: window.document, postSelector: '.bbWrapper', renderReport: false });

// Print resulting lines
const lines = window.document.querySelector('.bbWrapper').textContent
  .split('\n').map(s => s.trim()).filter(s => /Overall/.test(s));
console.log('=== resulting lines ===');
lines.forEach(l => console.log(l));

console.log('\n=== changes ===');
changes.forEach(c => console.log(`${c.site} ${c.field}: ${c.oldValue} -> ${c.newValue} ${c.changed ? '(changed)' : '(kept)'}`));

// Assertions / Vérifications
const text = window.document.querySelector('.bbWrapper').textContent;
assert(/Rivals Industry: #321 Overall; #37 CB; 89\.64;/.test(text), 'Rivals Industry should update to On3 Industry values');
assert(/247 Composite: #315 Overall; #36 CB; 0\.9037;/.test(text), '247 Composite should update from 247 site');
assert(/Rivals: #177 Overall; #16 CB;/.test(text), 'Rivals individual unchanged (no data)');
assert(/247: #208 Overall; #31 CB;/.test(text), '247 posRank updates, natRank kept (no 247-site national)');
assert(/ESPN: #244 Overall; #34 CB;/.test(text), 'ESPN posRank updates, natRank kept');

// Star counts (parity with the extension test) / Nombre d'étoiles (parité)
const html = window.document.querySelector('.bbWrapper').innerHTML;
const starCounts = {};
html.split(/<br\s*\/?>/i).forEach(seg => {
  const name = (seg.match(/>(Rivals Industry|247 Composite|Rivals|247)<\/(?:b|a)>/) || [])[1]
            || (/ESPN:/.test(seg) ? 'ESPN' : null);
  if (name) starCounts[name] = (seg.match(/<img/g) || []).length;
});
console.log('\n=== star counts ===', JSON.stringify(starCounts));
assert.strictEqual(starCounts['Rivals Industry'], 4, 'Rivals Industry stars 3→4');
assert.strictEqual(starCounts['247 Composite'], 4, '247 Composite stars 5→4');
assert.strictEqual(starCounts['Rivals'], 4, 'Rivals stars kept at 4 (no data)');
assert.strictEqual(starCounts['247'], 4, '247 stars 2→4');
assert.strictEqual(starCounts['ESPN'], 3, 'ESPN stars 4→3');

console.log('\nALL ASSERTIONS PASSED');
