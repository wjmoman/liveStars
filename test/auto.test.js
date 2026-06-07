// Test autoInit: with a recruit post + source links on the page and a stubbed
// network, the widget should overwrite the ratings automatically.
// Teste autoInit : avec un message + liens et un réseau simulé, remplacement auto.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const POST = `<div class="bbWrapper">
<b>Rivals Industry</b>: #197 Overall; #21 CB; 90.56; <img class="smilie"/><br/>
<b>247 Composite</b>: #205 Overall; #21 CB; .9255; <img class="smilie"/><br/>
<a href="https://n.rivals.com/content/athletes/example-recruit-000000?view=pv">Rivals</a>: #177 Overall; #16 CB; <img class="smilie"/><br/>
<a href="https://247sports.com/Player/Example-Recruit-000000/">247</a>: #208 Overall; #25 CB; <img class="smilie"/><br/>
ESPN: #244 Overall; #26 CB; <img class="smilie"/><br/>
</div>`;

const FAKE_RESPONSE = {
  name: 'Example Recruit',
  ratings: [
    { site: '247Sports',     stars: 4, rating: 90,     natRank: null, posRank: 31, stateRank: 25 },
    { site: '247 Composite', stars: 4, rating: 0.9037, natRank: 315,  posRank: 36, stateRank: 27 },
    { site: 'On3 Industry',  stars: 4, rating: 89.642, natRank: 321,  posRank: 37, stateRank: 29 },
    { site: 'ESPN',          stars: 3, rating: 79,     natRank: null, posRank: 34, stateRank: 36 },
    { site: 'Rivals',        stars: null, rating: null, natRank: null, posRank: null, stateRank: null }
  ],
  source: 'On3+247'
};

const dom = new JSDOM('<!DOCTYPE html><body>' + POST + '<div id="ls-changelog"></div></body>', { url: 'https://huskerboard.com/threads/x/' });
const { window } = dom;

// Stub fetch + flags BEFORE loading the widget so auto-run triggers.
let fetchedUrl = null;
window.fetch = function (url) {
  fetchedUrl = url;
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(FAKE_RESPONSE); } });
};
window.LIVESTARS_API = '/api/recruit';
window.LIVESTARS_AUTO = true;
window.LIVESTARS_REPORT = false;

const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'widget.js'), 'utf8');
new Function('window', 'document', 'NodeFilter', 'console', 'fetch', code)
  (window, window.document, window.NodeFilter, console, window.fetch);

// autoInit returns a promise chain; give microtasks a tick to resolve.
setTimeout(function () {
  const text = window.document.querySelector('.bbWrapper').textContent;
  console.log('fetched URL:', fetchedUrl);
  console.log(text.split('\n').map(s => s.trim()).filter(s => /Overall/.test(s)).join('\n'));

  assert(fetchedUrl && /rivals=.*247sports|s247=/.test(decodeURIComponent(fetchedUrl)) || /rivals=/.test(fetchedUrl), 'should call proxy with detected links');
  assert(/Rivals Industry: #321 Overall; #37 CB; 89\.64;/.test(text), 'auto: Rivals Industry updated');
  assert(/247 Composite: #315 Overall; #36 CB; 0\.9037;/.test(text), 'auto: 247 Composite updated');
  assert(/247: #208 Overall; #31 CB;/.test(text), 'auto: 247 posRank updated, natl kept');
  assert(/Rivals: #177 Overall; #16 CB;/.test(text), 'auto: Rivals kept (no data)');
  console.log('\nAUTO-INIT ASSERTIONS PASSED');
}, 50);
