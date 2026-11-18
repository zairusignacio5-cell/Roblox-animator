/* Combat animation pack for R6 rigs: archer (idle / shoot / reload) and swordsman (idle / swing).
   Shared by the server (builds the .rbxm) and the page (preview).
   Poses are written as "where does this limb point in the WORLD" (character faces -Z, +X is its right side, +Y is up),
   and converted to the R6 Motor6D rotations when the file is built.                                                       */
(function (root) {
"use strict";

const PARTS = [  // [pose name used in the file, parent pose name]
  ["HumanoidRootPart", null], ["Torso", "HumanoidRootPart"], ["Head", "Torso"],
  ["Left Arm", "Torso"], ["Right Arm", "Torso"], ["Left Leg", "Torso"], ["Right Leg", "Torso"],
];
const KEY = { Torso: "Torso", Head: "Head", "Left Arm": "LA", "Right Arm": "RA", "Left Leg": "LL", "Right Leg": "RL" };
const CUBIC = [3, 2], OUT = [3, 1];
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

/* ---------- small matrix helpers (Roblox CFrame.Angles(rx,ry,rz) = Rx * Ry * Rz) ---------- */
function mul(A, B) { const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j]; return R; }
const T = A => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
const apply = (M, v) => [0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
function rotMat(rx, ry, rz) {
  const cx = Math.cos(rad(rx)), sx = Math.sin(rad(rx)), cy = Math.cos(rad(ry)), sy = Math.sin(rad(ry)), cz = Math.cos(rad(rz)), sz = Math.sin(rad(rz));
  return mul(mul([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]), [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]);
}
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/* the rotation part of each R6 joint's C0 (and C1): the joints are turned 90 degrees, so rotations must be converted */
const C_FLIP = [[-1, 0, 0], [0, 0, 1], [0, 1, 0]];          // Root joint and Neck
const C_RIGHT = rotMat(0, 90, 0), C_LEFT = rotMat(0, -90, 0); // Right/Left Shoulder and Hip
const CROT = { Torso: C_FLIP, Head: C_FLIP, "Right Arm": C_RIGHT, "Right Leg": C_RIGHT, "Left Arm": C_LEFT, "Left Leg": C_LEFT };

/* ---------- pose builder ---------- */
/* limb direction (world) -> [rx,ry,rz] that points a hanging limb that way, given the torso's own rotation */
function limb(dirWorld, tp, tw) {
  const inv = mul(rotMat(0, -tw, 0), rotMat(tp, 0, 0));        // undo the torso's lean (forward = negative rx) and twist
  const v = norm(apply(inv, dirWorld));
  const rho = Math.asin(Math.max(-1, Math.min(1, v[0]))), th = Math.atan2(-v[2], -v[1]);
  return [deg(th), 0, deg(rho)];
}
/* o: tw = torso twist (negative = turns right), pitch = lean forward, dip = lower the body, look = head turn (world)  */
function pose(o) {
  const tw = o.tw || 0, tp = o.pitch || 0;
  return {
    Torso: [-tp, tw, 0, 0, o.dip || 0, o.fwd || 0],
    Head: [o.nod || 0, (o.look || 0) - tw, 0],
    LA: limb(o.L, tp, tw), RA: limb(o.R, tp, tw), LL: limb(o.LL || [-0.04, -1, -0.12], tp, tw), RL: limb(o.RL || [0.04, -1, 0.1], tp, tw),
  };
}
const idle2 = (p, d) => { const q = JSON.parse(JSON.stringify(p)); q.Torso[0] += d; q.Torso[4] += 0.05; q.LA[0] += 2; q.RA[0] += 2; return q; };

/* ---------- ARCHER ---------- */
const A_READY = pose({ tw: -18, look: 4, L: [0.0, -0.62, -0.78], R: [0.12, -0.95, -0.28], LL: [-0.1, -1, -0.2], RL: [0.12, -1, 0.14] });
const A_NOCK = pose({ tw: -30, look: 0, L: [0, -0.1, -1], R: [-0.34, -0.2, -0.92], LL: [-0.12, -1, -0.28], RL: [0.14, -1, 0.2] });
const A_DRAW = pose({ tw: -46, look: 0, pitch: 0, L: [0, 0.02, -1], R: [0.9, 0.12, 0.42], LL: [-0.14, -1, -0.3], RL: [0.16, -1, 0.22] });
const A_RELEASE = pose({ tw: -42, look: 0, L: [0, 0.03, -1], R: [0.97, 0.06, 0.55], LL: [-0.14, -1, -0.3], RL: [0.16, -1, 0.22] });
const A_QUIVER = pose({ tw: -12, look: 6, nod: -6, L: [0, -0.62, -0.78], R: [0.2, 0.96, 0.32], LL: [-0.1, -1, -0.2], RL: [0.12, -1, 0.14] });
const A_PULL = pose({ tw: -14, look: 8, nod: -8, pitch: -3, L: [0, -0.62, -0.78], R: [0.3, 0.72, 0.5], LL: [-0.1, -1, -0.2], RL: [0.12, -1, 0.14] });

/* ---------- SWORDSMAN ---------- */
const S_READY = pose({ tw: -14, look: 10, dip: -0.12, R: [0.1, -0.42, -0.9], L: [-0.38, -0.68, -0.62], LL: [-0.12, -0.93, -0.36], RL: [0.14, -0.96, 0.28] });
const S_WIND = pose({ tw: -42, look: 4, pitch: -6, dip: -0.14, R: [0.28, 0.95, 0.22], L: [-0.6, -0.5, -0.62], LL: [-0.1, -0.95, -0.3], RL: [0.2, -0.95, 0.3] });
const S_SLASH = pose({ tw: 34, look: -12, pitch: 14, dip: -0.28, fwd: 0, R: [-0.42, -0.55, -0.72], L: [-0.85, -0.2, -0.48], LL: [-0.08, -0.72, -0.69], RL: [0.2, -0.86, 0.46] });
const S_FOLLOW = pose({ tw: 48, look: -16, pitch: 18, dip: -0.3, R: [-0.78, -0.4, -0.48], L: [-0.88, -0.2, -0.42], LL: [-0.08, -0.7, -0.71], RL: [0.2, -0.85, 0.48] });

const ANIMS = {
  ArcherIdle:   { loop: true,  priority: 1, length: 2.4, desc: "Archer holding the bow, breathing",
    keys: [[0, A_READY, CUBIC], [1.2, idle2(A_READY, -2), CUBIC], [2.4, A_READY, CUBIC]] },
  ArcherShoot:  { loop: false, priority: 3, length: 1.1, desc: "Nock, draw, aim, release (marker: Release)",
    keys: [[0, A_READY, CUBIC], [0.18, A_NOCK, CUBIC], [0.5, A_DRAW, CUBIC], [0.66, A_DRAW, CUBIC], [0.72, A_RELEASE, OUT, "Release"], [1.1, A_READY, CUBIC]] },
  ArcherReload: { loop: false, priority: 3, length: 1.9, desc: "Grab an arrow from the quiver and nock it",
    keys: [[0, A_READY, CUBIC], [0.45, A_QUIVER, CUBIC], [0.8, A_PULL, CUBIC], [1.4, A_NOCK, CUBIC], [1.9, A_READY, CUBIC]] },
  SwordIdle:    { loop: true,  priority: 1, length: 2.0, desc: "Swordsman guard stance, breathing",
    keys: [[0, S_READY, CUBIC], [1.0, idle2(S_READY, -1.5), CUBIC], [2.0, S_READY, CUBIC]] },
  SwordSwing:   { loop: false, priority: 3, length: 0.85, desc: "Wind-up and diagonal slash (marker: Hit)",
    keys: [[0, S_READY, CUBIC], [0.22, S_WIND, CUBIC], [0.36, S_SLASH, OUT, "Hit"], [0.5, S_FOLLOW, OUT], [0.85, S_READY, CUBIC]] },
};

/* ---------- conversions ---------- */
/* what the pose means in the torso frame (W) and the Motor6D Transform to store in the file (conjugated by C0) */
function worldRot(spec, part) {
  const s = (spec && spec[KEY[part]]) || [0, 0, 0, 0, 0, 0];
  return { W: rotMat(s[0] || 0, s[1] || 0, s[2] || 0), p: [s[3] || 0, s[4] || 0, s[5] || 0] };
}
function poseOf(spec, part) {
  if (part === "HumanoidRootPart") return { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] };
  const { W, p } = worldRot(spec, part), C = CROT[part];
  return { m: mul(T(C), mul(W, C)), p: apply(T(C), p) };
}

/* ---------- forward kinematics for the preview (R6 proportions) ---------- */
function skeleton(spec) {
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], s = (spec && spec.Torso) || [0, 0, 0, 0, 0, 0];
  const tm = rotMat(s[0], s[1], 0), tc = [s[3] || 0, 3 + (s[4] || 0), s[5] || 0];
  const at = (m, off) => { const v = apply(m, off); return [tc[0] + v[0], tc[1] + v[1], tc[2] + v[2]]; };
  const limbEnd = (part, off, len) => {
    const { W } = worldRot(spec, part), a = at(tm, off), d = apply(mul(tm, W), [0, -len, 0]);
    return { a, b: [a[0] + d[0], a[1] + d[1], a[2] + d[2]] };
  };
  const hd = (spec && spec.Head) || [0, 0, 0], hm = mul(tm, rotMat(hd[0] || 0, hd[1] || 0, 0));
  const neck = at(tm, [0, 1, 0]), hv = apply(hm, [0, 1.0, 0]);
  return {
    hips: at(tm, [0, -1, 0]), neck, head: [neck[0] + hv[0], neck[1] + hv[1], neck[2] + hv[2]],
    LA: limbEnd("Left Arm", [-1, 0.5, 0], 1.5), RA: limbEnd("Right Arm", [1, 0.5, 0], 1.5),
    LL: limbEnd("Left Leg", [-0.5, -1, 0], 2), RL: limbEnd("Right Leg", [0.5, -1, 0], 2),
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
function blend(a, b, t) {
  const r = {};
  for (const k of ["Torso", "Head", "LA", "RA", "LL", "RL"]) {
    const x = a[k] || [0, 0, 0, 0, 0, 0], y = b[k] || [0, 0, 0, 0, 0, 0];
    r[k] = [0, 1, 2, 3, 4, 5].map(i => lerp(x[i] || 0, y[i] || 0, t));
  }
  return r;
}
function sample(anim, time) {
  const k = anim.keys, t = Math.max(0, Math.min(anim.length, time));
  for (let i = 0; i < k.length - 1; i++) if (t >= k[i][0] && t <= k[i + 1][0]) {
    const u = (t - k[i][0]) / Math.max(1e-6, k[i + 1][0] - k[i][0]);
    return blend(k[i][1], k[i + 1][1], u * u * (3 - 2 * u));
  }
  return k[k.length - 1][1];
}

/* ---------- .rbxm (binary) writer: KeyframeSequence > Keyframe > Pose (+ KeyframeMarker) ---------- */
function f32le(v) { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; }
function strBuf(s) { const d = Buffer.from(s, "utf8"), b = Buffer.alloc(4 + d.length); b.writeUInt32LE(d.length, 0); d.copy(b, 4); return b; }
function interleave(words) {
  const n = words.length, b = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { const w = words[i] >>> 0; b[i] = w >>> 24; b[n + i] = (w >>> 16) & 255; b[2 * n + i] = (w >>> 8) & 255; b[3 * n + i] = w & 255; }
  return b;
}
const zig = v => ((v << 1) ^ (v >> 31)) >>> 0;
function floatsBuf(arr) {
  return interleave(arr.map(v => { const b = f32le(v).readUInt32LE(0); return ((b << 1) | (b >>> 31)) >>> 0; }));
}
function chunk(name, data) {
  const h = Buffer.alloc(16); h.write(name.padEnd(4, "\0"), 0, "latin1"); h.writeUInt32LE(0, 4); h.writeUInt32LE(data.length, 8);
  return Buffer.concat([h, data]);
}
function buildRbxm(name) {
  const A = ANIMS[name]; if (!A) throw new Error("Unknown animation " + name);
  const inst = [{ cls: "KeyframeSequence", name, loop: A.loop, priority: A.priority, parent: -1 }], poseId = {};
  for (const [t, spec, ease, marker] of A.keys) {
    inst.push({ cls: "Keyframe", name: "Keyframe", time: t, parent: 0 }); const kfIdx = inst.length - 1;
    for (const [pn, parent] of PARTS) {
      inst.push({ cls: "Pose", name: pn, pose: poseOf(spec, pn), ease: ease || CUBIC, parent: parent ? poseId[parent] : kfIdx });
      poseId[pn] = inst.length - 1;
    }
    if (marker) inst.push({ cls: "KeyframeMarker", name: marker, value: "", parent: kfIdx });
  }
  const classes = ["KeyframeSequence", "Keyframe", "Pose", "KeyframeMarker"].filter(c => inst.some(i => i.cls === c));
  const header = Buffer.alloc(32);
  Buffer.from([0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).copy(header, 0);
  header.writeInt32LE(classes.length, 16); header.writeInt32LE(inst.length, 20);
  const chunks = [];
  classes.forEach((cls, ci) => {
    const idxs = []; inst.forEach((x, i) => { if (x.cls === cls) idxs.push(i); });
    const cnt = Buffer.alloc(4); cnt.writeUInt32LE(idxs.length, 0);
    const id = Buffer.alloc(4); id.writeUInt32LE(ci, 0);
    chunks.push(chunk("INST", Buffer.concat([id, strBuf(cls), Buffer.from([0]), cnt, interleave(idxs.map((v, k) => zig((v - (k ? idxs[k - 1] : 0)) | 0)))])));
    const prop = (pname, type, body) => chunks.push(chunk("PROP", Buffer.concat([id, strBuf(pname), Buffer.from([type]), body])));
    const of = idxs.map(i => inst[i]);
    prop("Name", 0x01, Buffer.concat(of.map(x => strBuf(x.name))));
    if (cls === "KeyframeSequence") {
      prop("Loop", 0x02, Buffer.from(of.map(x => x.loop ? 1 : 0)));
      prop("Priority", 0x12, interleave(of.map(x => x.priority)));
    } else if (cls === "Keyframe") {
      prop("Time", 0x04, floatsBuf(of.map(x => x.time)));
    } else if (cls === "Pose") {
      const parts = [];
      for (const x of of) { const m = x.pose.m; parts.push(Buffer.concat([Buffer.from([0]), ...[m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]].map(f32le)])); }
      parts.push(floatsBuf(of.map(x => x.pose.p[0])), floatsBuf(of.map(x => x.pose.p[1])), floatsBuf(of.map(x => x.pose.p[2])));
      prop("CFrame", 0x10, Buffer.concat(parts));
      prop("EasingDirection", 0x12, interleave(of.map(x => x.ease[1])));
      prop("EasingStyle", 0x12, interleave(of.map(x => x.ease[0])));
      prop("Weight", 0x04, floatsBuf(of.map(() => 1)));
    } else if (cls === "KeyframeMarker") {
      prop("Value", 0x01, Buffer.concat(of.map(x => strBuf(x.value))));
    }
  });
  const n = inst.length, kids = inst.map((_, i) => i), pars = inst.map(x => x.parent);
  const d = a => a.map((v, k) => zig((v - (k ? a[k - 1] : 0)) | 0));
  const nb = Buffer.alloc(4); nb.writeUInt32LE(n, 0);
  chunks.push(chunk("PRNT", Buffer.concat([Buffer.from([0]), nb, interleave(d(kids)), interleave(d(pars))])));
  chunks.push(chunk("END", Buffer.from("</roblox>")));
  return Buffer.concat([header, ...chunks]);
}

const API = { PARTS, ANIMS, skeleton, sample, poseOf, buildRbxm };
root.CombatAnims = API;
if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
