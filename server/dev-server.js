// Minimal local dev server (no dependencies) to test the full widget → proxy → On3 flow.
// Serveur de dev local minimal (sans dépendances) pour tester le flux complet.
//
// Usage:  CFBD_API_KEY=xxx node server/dev-server.js   (key optional for link mode)
// Then open http://localhost:8787/  (serves web/ + sample/ and /api/recruit)
// Puis ouvrez http://localhost:8787/

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const handler = require('./api/recruit');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8787;

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // API route → call the serverless-style handler with a small Express-like shim.
  // Route API → appelle le handler avec un adaptateur de type Express.
  if (parsed.pathname === '/api/recruit') {
    req.query = parsed.query;
    shim(res);
    return handler(req, res);
  }

  // Static files from the project root (web/, sample/). Default to web/index.html.
  // Fichiers statiques depuis la racine.
  let rel = parsed.pathname === '/' ? '/web/index.html' : parsed.pathname;
  const filePath = path.join(ROOT, decodeURIComponent(rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// Add Express-like status()/json() helpers used by the handler.
// Ajoute des aides status()/json() de type Express.
function shim(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
}

server.listen(PORT, () => {
  console.log(`liveStars dev server → http://localhost:${PORT}/`);
  console.log('Try: /api/recruit?on3=<On3 profile URL>   or   /api/recruit?name=Bryce%20Williams&year=2027');
});
