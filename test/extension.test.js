// Test the extension content script: stubbed background + verify number AND star updates.
// Teste le script de contenu : arrière-plan simulé + vérifie nombres ET étoiles.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const STAR = '<img class="smilie" alt="star" src="https://x/2b50.png"/>';
function stars(n) { return STAR.repeat(n); }

// Deliberately WRONG star counts to prove add/remove works.
const POST = `<div class="bbWrapper">
<b>Rivals Industry</b>: #197 Overall; #21 CB; 90.56; ${stars(3)}<br/>
<b>247 Composite</b>: #205 Overall; #21 CB; .9255; ${stars(5)}<br/>
<a href="https://n.rivals.com/content/athletes/example-recruit-000000?view=pv">Rivals</a>: #177 Overall; #16 CB; ${stars(4)}<br/>
<a href="https://247sports.com/Player/Example-Recruit-000000/">247</a>: #208 Overall; #25 CB; ${stars(2)}<br/>
ESPN: #244 Overall; #26 CB; ${stars(4)}<br/>
</div>`;

const FAKE = {
  name: 'Example Recruit', sources: ['s247', 'rivals'],
  ratings: [
    { site: '247Sports',     stars: 4, rating: 90,     natRank: null, posRank: 31, stateRank: 25 },
    { site: '247 Composite', stars: 4, rating: 0.9037, natRank: 315,  posRank: 36, stateRank: 27 },
    { site: 'On3 Industry',  stars: 4, rating: 89.642, natRank: 321,  posRank: 37, stateRank: 29 },
    { site: 'ESPN',          stars: 3, rating: 79,     natRank: null, posRank: 34, stateRank: 36 },
    { site: 'Rivals',        stars: null, rating: null, natRank: null, posRank: null, stateRank: null }
  ]
};

const dom = new JSDOM('<!DOCTYPE html><body>' + POST + '</body>', { url: 'https://huskerboard.com/threads/x/' });
const { window } = dom;

let sentMsg = null;
const browserStub = {
  runtime: {
    sendMessage: function (msg) { sentMsg = msg; return Promise.resolve({ ok: true, data: FAKE }); },
    onMessage: { addListener: function () {} }
  }
};

const code = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
new Function('window', 'document', 'NodeFilter', 'console', 'browser', 'URL', code)
  (window, window.document, window.NodeFilter, console, browserStub, window.URL);

setTimeout(function () {
  const html = window.document.querySelector('.bbWrapper').innerHTML;
  // Count star <img> per line by splitting on <br>.
  const counts = {};
  html.split(/<br\s*\/?>/i).forEach(seg => {
    const label = (seg.match(/(Rivals Industry|247 Composite|Rivals|247|ESPN)\s*<\/(?:b|a)>|^\s*(ESPN)\s*:/) || []);
    const name = (seg.match(/>(Rivals Industry|247 Composite|Rivals|247)<\/(?:b|a)>/) || [])[1]
              || (/ESPN:/.test(seg) ? 'ESPN' : null);
    if (name) counts[name] = (seg.match(/<img/g) || []).length;
  });
  console.log('star counts after update:', JSON.stringify(counts));
  const text = window.document.querySelector('.bbWrapper').textContent;
  console.log(text.split('\n').map(s => s.trim()).filter(s => /Overall/.test(s)).join('\n'));

  // Numbers
  assert(/Rivals Industry: #321 Overall; #37 CB; 89\.64;/.test(text), 'Rivals Industry numbers updated');
  assert(/247 Composite: #315 Overall; #36 CB; 0\.9037;/.test(text), '247 Composite numbers updated');
  assert(/Rivals: #177 Overall; #16 CB;/.test(text), 'Rivals kept');
  // Stars
  assert.strictEqual(counts['Rivals Industry'], 4, 'Rivals Industry stars 3→4');
  assert.strictEqual(counts['247 Composite'], 4, '247 Composite stars 5→4');
  assert.strictEqual(counts['Rivals'], 4, 'Rivals stars kept at 4 (no data)');
  assert.strictEqual(counts['247'], 4, '247 stars 2→4');
  assert.strictEqual(counts['ESPN'], 3, 'ESPN stars 4→3');
  console.log('\nEXTENSION (numbers + stars) ASSERTIONS PASSED');
}, 50);
