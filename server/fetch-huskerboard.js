// One-off: dump the RAW HTML of the ratings lines so we can see star encoding.
// Ponctuel : affiche le HTML BRUT des lignes de notes pour voir l'encodage des étoiles.
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

(async () => {
  const url = process.argv[2] || 'https://www.huskerboard.com/threads/example-recruit-commit.000000/';
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
  console.log('HTTP', res.status);
  const html = await res.text();

  const m = html.match(/<div class="bbWrapper">([\s\S]*?)<\/div>\s*<\/article>/) ||
            html.match(/<div class="bbWrapper">([\s\S]*?)<\/div>\s*<\/div>/);
  const body = m ? m[1] : html;

  // Save full first-post HTML to a fixture for offline parser development.
  fs.writeFileSync(__dirname + '/fixtures/huskerboard-post.html', body, 'utf8');
  console.log('saved fixture: server/fixtures/huskerboard-post.html (', body.length, 'chars )');

  // Show raw HTML around the first rating line.
  const idx = body.indexOf('Industry');
  console.log('\n=== raw HTML around ratings ===\n');
  console.log(body.slice(Math.max(0, idx - 40), idx + 900));
})().catch(e => { console.error(e.message); process.exit(1); });
