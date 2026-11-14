// Minimal reader for Roblox binary files (.rbxm / .rbxl): just enough to find rigs (Parts + Motor6D joints).
const zlib = require('zlib');

function lz4(src, usize) {
  const out = Buffer.alloc(usize); let i = 0, o = 0;
  while (i < src.length) {
    const t = src[i++]; let ll = t >> 4;
    if (ll === 15) { let b; do { b = src[i++]; ll += b; } while (b === 255); }
    src.copy(out, o, i, i + ll); i += ll; o += ll;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let ml = t & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); }
    ml += 4; for (let k = 0; k < ml; k++, o++) out[o] = out[o - off];
  }
  return out;
}

function chunks(d) {
  if (d.toString('latin1', 0, 8) !== '<roblox!') throw new Error('Not a binary Roblox file (.rbxm / .rbxl). XML files are not supported: save it as binary from Studio.');
  let p = 32; const out = [];
  while (p < d.length) {
    const name = d.toString('latin1', p, p + 4), cl = d.readUInt32LE(p + 4), ul = d.readUInt32LE(p + 8); p += 16;
    const len = cl === 0 ? ul : cl; const raw = d.subarray(p, p + len); p += len;
    const data = cl === 0 ? Buffer.from(raw) : (raw.readUInt32LE(0) === 0xFD2FB528 ? zlib.zstdDecompressSync(raw) : lz4(raw, ul));
    out.push({ name: name.replace(/\0/g, ''), data });
    if (name.startsWith('END')) break;
  }
  return out;
}

// ---- column readers (Roblox stores arrays "interleaved" : all first bytes, then all second bytes ...)
function u32s(b, o, n) { const r = new Array(n); for (let i = 0; i < n; i++) r[i] = ((b[o + i] << 24) | (b[o + n + i] << 16) | (b[o + 2 * n + i] << 8) | b[o + 3 * n + i]) >>> 0; return r; }
function i32s(b, o, n) { return u32s(b, o, n).map(u => (u >>> 1) ^ -(u & 1)); }
const fbuf = Buffer.alloc(4);
function f32of(u) { fbuf.writeUInt32LE(((u >>> 1) | (u << 31)) >>> 0); return fbuf.readFloatLE(0); }
function floats(b, o, n) { return u32s(b, o, n).map(f32of); }
function refs(b, o, n) { const v = i32s(b, o, n); let a = 0; return v.map(x => (a += x)); }

// orientation id -> rotation matrix (row-major, 9 numbers): id-1 = rightFace*6 + upFace, faces = +X +Y +Z -X -Y -Z
const FACE = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
function orient(id) {
  const k = id - 1, r = FACE[Math.floor(k / 6)], u = FACE[k % 6];
  if (!r || !u) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const b = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]]; // back = right x up
  return [r[0], u[0], b[0], r[1], u[1], b[1], r[2], u[2], b[2]];
}

function parseFile(buf) {
  const cs = chunks(buf);
  const classes = {}; const inst = {}; // inst[referent] = {class, props}
  for (const { name, data } of cs) {
    if (name === 'INST') {
      const cid = data.readUInt32LE(0), l = data.readUInt32LE(4), cn = data.toString('utf8', 8, 8 + l);
      let p = 8 + l; const hasService = data[p]; p += 1; const n = data.readUInt32LE(p); p += 4;
      const ids = refs(data, p, n);
      classes[cid] = { name: cn, ids };
      ids.forEach(id => { inst[id] = { id, class: cn, props: {}, parent: -1, kids: [] }; });
    }
  }
  for (const { name, data } of cs) {
    if (name !== 'PROP') continue;
    const cid = data.readUInt32LE(0), l = data.readUInt32LE(4), pn = data.toString('utf8', 8, 8 + l);
    const cls = classes[cid]; if (!cls) continue;
    if (!['Name', 'Size', 'CFrame', 'C0', 'C1', 'Part0', 'Part1', 'Color3uint8', 'Transparency', 'Shape'].includes(pn)) continue;
    const type = data[8 + l], n = cls.ids.length; let o = 9 + l; const vals = new Array(n);
    try {
      if (type === 0x01) { for (let i = 0; i < n; i++) { const sl = data.readUInt32LE(o); o += 4; vals[i] = data.toString('utf8', o, o + sl); o += sl; } }
      else if (type === 0x04) { floats(data, o, n).forEach((v, i) => vals[i] = v); }
      else if (type === 0x13) { refs(data, o, n).forEach((v, i) => vals[i] = v); }
      else if (type === 0x1A) { for (let i = 0; i < n; i++) vals[i] = [data[o + i], data[o + n + i], data[o + 2 * n + i]]; }
      else if (type === 0x12) { u32s(data, o, n).forEach((v, i) => vals[i] = v); }
      else if (type === 0x0E) { const x = floats(data, o, n), y = floats(data, o + 4 * n, n), z = floats(data, o + 8 * n, n); for (let i = 0; i < n; i++) vals[i] = [x[i], y[i], z[i]]; }
      else if (type === 0x10) {
        const rot = new Array(n);
        for (let i = 0; i < n; i++) {
          const id = data[o++];
          if (id === 0) { const m = []; for (let k = 0; k < 9; k++) { m.push(data.readFloatLE(o)); o += 4; } rot[i] = m; } else rot[i] = orient(id);
        }
        const x = floats(data, o, n), y = floats(data, o + 4 * n, n), z = floats(data, o + 8 * n, n);
        for (let i = 0; i < n; i++) vals[i] = { r: rot[i], p: [x[i], y[i], z[i]] };
      } else continue;
    } catch (e) { continue; }
    cls.ids.forEach((id, i) => { if (vals[i] !== undefined) inst[id].props[pn] = vals[i]; });
  }
  const prnt = cs.find(c => c.name === 'PRNT');
  if (prnt) {
    const n = prnt.data.readUInt32LE(1);
    const ks = refs(prnt.data, 5, n), ps = refs(prnt.data, 5 + 4 * n, n);
    ks.forEach((k, i) => { if (inst[k]) { inst[k].parent = ps[i]; if (inst[ps[i]]) inst[ps[i]].kids.push(k); } });
  }
  return inst;
}

// every Model that holds Motor6D joints -> {name, parts, joints}
function findRigs(buf) {
  const inst = parseFile(buf);
  const all = Object.values(inst);
  const motors = all.filter(i => i.class === 'Motor6D' || i.class === 'Weld' && false);
  const rigs = new Map();
  for (const m of motors) {
    const p0 = inst[m.props.Part0], p1 = inst[m.props.Part1];
    if (!p0 || !p1) continue;
    // owner = nearest Model ancestor of Part1
    let a = inst[p1.parent]; while (a && a.class !== 'Model') a = inst[a.parent];
    const key = a ? a.id : -1;
    if (!rigs.has(key)) rigs.set(key, { name: a ? (a.props.Name || 'Model') : 'Rig', joints: [], partIds: new Set() });
    const r = rigs.get(key);
    r.joints.push({ name: m.props.Name || 'Motor6D', p0: p0.id, p1: p1.id, c0: m.props.C0, c1: m.props.C1 });
    r.partIds.add(p0.id); r.partIds.add(p1.id);
  }
  const out = [];
  for (const r of rigs.values()) {
    if (r.joints.length < 1) continue;
    const parts = [...r.partIds].map(id => {
      const p = inst[id].props;
      return { id, name: p.Name || 'Part', size: p.Size || [1, 1, 1], cf: p.CFrame || { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] }, color: p.Color3uint8 || [163, 162, 165], transparency: p.Transparency || 0 };
    });
    const idc = x => { const i = parts.findIndex(p => p.id === x); return i; };
    out.push({
      name: r.name,
      parts: parts.map(p => ({ name: p.name, size: p.size, color: p.color, transparency: p.transparency, cf: p.cf })),
      joints: r.joints.map(j => ({ name: j.name, part0: idc(j.p0), part1: idc(j.p1), c0: j.c0 || { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] }, c1: j.c1 || { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] } }))
    });
  }
  out.sort((a, b) => b.joints.length - a.joints.length);
  return out.slice(0, 40);
}

module.exports = { findRigs, parseFile };
