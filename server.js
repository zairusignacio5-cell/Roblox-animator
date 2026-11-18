// Combat animation pack (R6): builds the animations and uploads them with your Open Cloud API key.
// No dependencies: just Node 18+.
const http = require("http"), fs = require("fs"), path = require("path");
const { ANIMS, buildRbxm } = require("./anims.js");
const PORT = process.env.PORT || 3000;
const send = (res, code, body, type) => { res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function upload(name, key, type, id) {
  const A = ANIMS[name];
  const fd = new FormData();
  fd.append("request", JSON.stringify({
    assetType: "Animation", displayName: name, description: A.desc + " (R6)",
    creationContext: { creator: type === "group" ? { groupId: String(id) } : { userId: String(id) } },
  }));
  fd.append("fileContent", new Blob([buildRbxm(name)], { type: "model/x-rbxm" }), name + ".rbxm");
  const r = await fetch("https://apis.roblox.com/assets/v1/assets", { method: "POST", headers: { "x-api-key": key }, body: fd });
  const t = await r.text(); let d = {}; try { d = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error("Roblox said " + r.status + ": " + (d.message || t.slice(0, 300)));
  const opId = (d.path || "").split("/").pop();
  if (d.done && d.response && d.response.assetId) return d.response.assetId;
  if (!opId) throw new Error("Unexpected answer from Roblox: " + t.slice(0, 300));
  for (let i = 0; i < 40; i++) {
    await wait(1500);
    const pr = await fetch("https://apis.roblox.com/assets/v1/operations/" + opId, { headers: { "x-api-key": key } });
    const pt = await pr.text(); let pd = {}; try { pd = JSON.parse(pt); } catch {}
    if (!pr.ok) throw new Error("Roblox said " + pr.status + " while checking the upload: " + (pd.message || pt.slice(0, 200)));
    if (pd.done) {
      if (pd.error) throw new Error("Upload refused: " + (pd.error.message || JSON.stringify(pd.error)));
      if (pd.response && pd.response.assetId) return pd.response.assetId;
      throw new Error("Upload finished but no asset id came back: " + pt.slice(0, 300));
    }
  }
  throw new Error("Roblox is still processing it. Check Creator Hub > Development Items > Animations in a minute.");
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/") return send(res, 200, fs.readFileSync(path.join(__dirname, "index.html")), "text/html; charset=utf-8");
    if (u.pathname === "/anims.js") return send(res, 200, fs.readFileSync(path.join(__dirname, "anims.js")), "application/javascript; charset=utf-8");
    if (u.pathname === "/api/rbxm") {
      const n = u.searchParams.get("name"); if (!ANIMS[n]) return send(res, 404, { error: "Unknown animation" });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="' + n + '.rbxm"' });
      return res.end(buildRbxm(n));
    }
    if (u.pathname === "/api/publish" && req.method === "POST") {
      const n = u.searchParams.get("name"), key = (req.headers["x-api-key"] || "").trim(), type = req.headers["x-creator-type"] === "group" ? "group" : "user", id = (req.headers["x-creator-id"] || "").trim();
      if (!ANIMS[n]) return send(res, 404, { error: "Unknown animation" });
      if (!key) return send(res, 400, { error: "Paste your Open Cloud API key first." });
      if (!/^\d+$/.test(id)) return send(res, 400, { error: "Enter your numeric User ID (or Group ID)." });
      const assetId = await upload(n, key, type, id);
      return send(res, 200, { assetId });
    }
    send(res, 404, { error: "Not found" });
  } catch (e) { send(res, 500, { error: e.message || String(e) }); }
}).listen(PORT, () => console.log("Animation pack on port " + PORT));
