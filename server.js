// Roblox Animator : tiny server with ZERO dependencies (Node 18+).
//   GET  /               the animator page
//   POST /api/parse      raw .rbxm / .rbxl body -> rigs found in it (Models with Motor6D joints)
//   POST /api/publish    {apiKey, creatorType, creatorId, name, description, xml} -> uploads the animation with Open Cloud
// The API key is only forwarded to Roblox for that one request. It is never stored or logged.
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const { findRigs } = require('./rbxparse');

const PORT = process.env.PORT || 3000;
const ROBLOX = 'apis.roblox.com';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('File too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function robloxRequest(method, urlPath, apiKey, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: ROBLOX, path: urlPath, method, headers: Object.assign({ 'x-api-key': apiKey }, headers || {}) }, r => {
      const parts = []; r.on('data', c => parts.push(c));
      r.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8'); let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not json */ }
        resolve({ status: r.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Roblox did not answer in time')));
    if (body) req.write(body);
    req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function publish(p) {
  const apiKey = String(p.apiKey || '').trim(), id = String(p.creatorId || '').trim();
  if (!apiKey) throw new Error('Paste your Open Cloud API key first.');
  if (!/^\d+$/.test(id)) throw new Error('The User ID / Group ID must be a number.');
  if (typeof p.xml !== 'string' || p.xml.length < 50 || p.xml.length > 15 * 1024 * 1024) throw new Error('The animation is empty or too big.');
  const creator = p.creatorType === 'group' ? { groupId: id } : { userId: id };
  const request = { assetType: 'Animation', displayName: String(p.name || 'Animation').slice(0, 50), description: String(p.description || '').slice(0, 1000), creationContext: { creator } };
  const boundary = '----rbxanim' + Date.now().toString(16);
  const CRLF = '\r\n';
  const body = Buffer.concat([
    Buffer.from('--' + boundary + CRLF + 'Content-Disposition: form-data; name="request"' + CRLF + 'Content-Type: application/json' + CRLF + CRLF + JSON.stringify(request) + CRLF +
      '--' + boundary + CRLF + 'Content-Disposition: form-data; name="fileContent"; filename="animation.rbxmx"' + CRLF + 'Content-Type: model/x-rbxm' + CRLF + CRLF, 'utf8'),
    Buffer.from(p.xml, 'utf8'),
    Buffer.from(CRLF + '--' + boundary + '--' + CRLF, 'utf8')
  ]);
  const created = await robloxRequest('POST', '/assets/v1/assets', apiKey, { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }, body);
  if (created.status < 200 || created.status >= 300) {
    const msg = (created.json && (created.json.message || created.json.error)) || created.text.slice(0, 400);
    const e = new Error('Roblox refused the upload (HTTP ' + created.status + '): ' + msg + hint(created.status)); e.status = created.status; throw e;
  }
  const opPath = created.json && created.json.path;
  if (!opPath) throw new Error('Unexpected answer from Roblox: ' + created.text.slice(0, 300));
  // the upload is processed asynchronously : ask until it is done
  for (let i = 0; i < 40; i++) {
    await sleep(i < 5 ? 700 : 1500);
    const op = await robloxRequest('GET', '/assets/v1/' + opPath, apiKey);
    if (op.status !== 200 || !op.json) continue;
    if (op.json.done) {
      if (op.json.error) throw new Error('Roblox could not process the animation: ' + (op.json.error.message || JSON.stringify(op.json.error)));
      const assetId = op.json.response && (op.json.response.assetId || String(op.json.response.path || '').replace(/\D/g, ''));
      if (!assetId) throw new Error('Roblox finished but sent no asset ID: ' + op.text.slice(0, 300));
      return { assetId: String(assetId) };
    }
  }
  throw new Error('Roblox is still processing the upload. Check Creator Hub > Development items > Animations in a minute.');
}
function hint(status) {
  if (status === 401) return ' - the API key is wrong or expired.';
  if (status === 403) return ' - the key needs the "Assets" API system with Read + Write permission, and your IP/User must be allowed. For a group, the key owner must have permission in that group.';
  if (status === 429) return ' - too many uploads, wait a bit.';
  return '';
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && url === '/healthz') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url === '/api/parse') {
      const buf = await readBody(req, 60 * 1024 * 1024);
      const rigs = findRigs(buf);
      if (!rigs.length) return send(res, 200, { ok: false, error: 'No rig found. The file needs a Model with Motor6D joints (a character rig).' });
      return send(res, 200, { ok: true, rigs });
    }
    if (req.method === 'POST' && url === '/api/publish') {
      const body = JSON.parse((await readBody(req, 20 * 1024 * 1024)).toString('utf8'));
      const out = await publish(body);
      return send(res, 200, { ok: true, assetId: out.assetId });
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    send(res, 200, { ok: false, error: e.message || String(e) });
  }
});
server.listen(PORT, () => console.log('Animator on port ' + PORT));
