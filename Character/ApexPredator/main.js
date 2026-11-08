/* main.js - Karakter Apex Predator (R.E.P.O.) dengan WebGL: ellipsoid + paraboloid + cone + cylinder + kurva Bezier 3D
   Gaya kode SAMA dengan Elsa: mesh dibuat sekali, lalu digambar lewat draw(mesh, M, color) dengan chain(...) transformasi.
   Bentuk model (generator geometri, ukuran, posisi, pose, animasi, transisi mode monster) tidak diubah dari versi SceneNode.
   Tidak butuh LIBS / SceneNode lagi. Memakai Mat4 milik Elsa bila ada (kalau tidak ada, dipakai versi kecil di file ini). */
(function () {
  'use strict';
  const PI = Math.PI;
  let gl = null, M4 = null, T, S, rotX, rotY, rotZ, chain;

  /* ---- Mat4: pakai milik proyek bila sudah dimuat, kalau belum pakai cadangan (kolom-mayor, sama konvensinya) ---- */
  function makeMat4() {
    const id = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o };
    const nz = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] };
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return {
      identity: id, mul, chain: (...m) => m.reduce(mul),
      translation: (x, y, z) => { const m = id(); m[12] = x; m[13] = y; m[14] = z; return m },
      scaling: (x, y, z) => { const m = id(); m[0] = x; m[5] = y; m[10] = z; return m },
      rotX: a => { const m = id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m },
      rotY: a => { const m = id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m },
      rotZ: a => { const m = id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m },
      perspective: (f, a, n, r) => { const t = 1 / Math.tan(f / 2), m = new Float32Array(16); m[0] = t / a; m[5] = t; m[10] = (r + n) / (n - r); m[11] = -1; m[14] = 2 * r * n / (n - r); return m },
      lookAt: (e, c, up) => {
        const f = nz([c[0] - e[0], c[1] - e[1], c[2] - e[2]]), s = nz(cr(f, up)), u = cr(s, f), m = id();
        m[0] = s[0]; m[4] = s[1]; m[8] = s[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
        m[12] = -(s[0] * e[0] + s[1] * e[1] + s[2] * e[2]); m[13] = -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]); m[14] = f[0] * e[0] + f[1] * e[1] + f[2] * e[2];
        return m;
      }
    };
  }
  function useMat4() {
    if (M4) return;
    M4 = typeof Mat4 !== 'undefined' ? Mat4 : makeMat4();
    ({ translation: T, scaling: S, rotX, rotY, rotZ, chain } = M4);
  }
  // rotasi mengelilingi sumbu sembarang (Rodrigues; sumbu dinormalisasi, radian, kolom-mayor)
  const rotAxis = (x, y, z, a) => {
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
    return new Float32Array([c + x * x * k, y * x * k + z * s, z * x * k - y * s, 0, x * y * k - z * s, c + y * y * k, z * y * k + x * s, 0,
                             x * z * k + y * s, y * z * k - x * s, c + z * z * k, 0, 0, 0, 0, 1]);
  };
  // pivot transform (sama dengan LIBS.makePivotTransform / ...Axis): putar & skala di titik engsel (px,py,pz), lalu geser (tx,ty,tz)
  const pivot = (px, py, pz, rx, ry, rz, sx, sy, sz, tx, ty, tz) =>
    chain(T(tx, ty, tz), T(px, py, pz), rotZ(rz), rotY(ry), rotX(rx), S(sx, sy, sz), T(-px, -py, -pz));
  const pivotAxis = (px, py, pz, ax, ay, az, ang, sx, sy, sz, tx, ty, tz) =>
    chain(T(tx, ty, tz), T(px, py, pz), rotAxis(ax, ay, az, ang), S(sx, sy, sz), T(-px, -py, -pz));

  /* ================= GEOMETRI (rumus asli): {positions, normals, indices} datar ================= */
  const unitN = n => {
    for (let k = 0; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]);
      if (l > 1e-6) { n[k] /= l; n[k + 1] /= l; n[k + 2] /= l } else { n[k] = 0; n[k + 1] = 1; n[k + 2] = 0 }
    }
    return n;
  };
  const gridIdx = (rows, cols) => {
    const i = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a0 = r * cols + c, a1 = a0 + 1, b0 = a0 + cols, b1 = b0 + 1; i.push(a0, a1, b1, a0, b1, b0) }
    return i;
  };
  const bezier = (P, t) => {   // Bezier kubik 3D
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [0, 1, 2].map(k => a * P[0][k] + b * P[1][k] + c * P[2][k] + d * P[3][k]);
  };

  // ELLIPSOID (badan, kepala, mata, telapak, jari); taperTop/taperBottom = bentuk organik
  function generateEllipsoid(a, b, c, stacks, slices, taperTop = 0, taperBottom = 0) {
    const p = [], n = [];
    for (let i = 0; i <= stacks; i++) {
      const u = i / stacks * PI - PI / 2, cosU = Math.cos(u), sinU = Math.sin(u);
      const k = sinU > 0 && taperTop !== 0 ? 1 - taperTop * sinU : sinU < 0 && taperBottom !== 0 ? 1 - taperBottom * -sinU : 1;
      for (let j = 0; j <= slices; j++) {
        const v = j / slices * 2 * PI - PI, cosV = Math.cos(v), sinV = Math.sin(v), ea = a * k, ec = c * k;
        p.push(ea * cosV * cosU, b * sinU, ec * sinV * cosU);
        n.push(cosV * cosU / Math.max(ea, 1e-4), sinU / b, sinV * cosU / Math.max(ec, 1e-4));
      }
    }
    return { positions: p, normals: unitN(n), indices: gridIdx(stacks + 1, slices + 1) };
  }

  // ELLIPTIC PARABOLOID (paruh, rahang, sayap): x = r cos a, y = r^2, z = r sin b, ujung (r = 0) di titik asal
  function generateEllipticParaboloid(a, b, rMax, rings, segments) {
    const p = [], n = [];
    for (let i = 0; i <= rings; i++) {
      const r = i / rings * rMax;
      for (let j = 0; j <= segments; j++) {
        const th = j / segments * 2 * PI, c = Math.cos(th), s = Math.sin(th);
        p.push(r * c * a, r * r, r * s * b);
        if (r < 1e-5) n.push(0, -1, 0); else n.push(2 * c / a, -2 * r, 2 * s / b);
      }
    }
    const idx = gridIdx(rings + 1, segments + 1), ci = p.length / 3, last = rings * (segments + 1);
    p.push(0, rMax * rMax, 0); n.push(0, 1, 0);   // penutup pangkal
    for (let j = 0; j < segments; j++) idx.push(ci, last + j, last + j + 1);
    return { positions: p, normals: unitN(n), indices: idx };
  }

  // CONE (taring): pangkal di y = 0, puncak di y = height
  function generateCone(radius, height, segments) {
    const p = [0, height, 0, 0, 0, 0], n = [0, 1, 0, 0, -1, 0], idx = [], slope = radius / Math.max(height, 1e-4);
    for (let j = 0; j <= segments; j++) { const th = j / segments * 2 * PI, c = Math.cos(th), s = Math.sin(th); p.push(radius * c, 0, radius * s); n.push(c, slope, s) }
    for (let j = 0; j < segments; j++) idx.push(0, 2 + j, 3 + j, 1, 3 + j, 2 + j);
    return { positions: p, normals: unitN(n), indices: idx };
  }

  // CYLINDER (kaki): y = 0 sampai y = height
  function generateCylinder(radius, height, segments) {
    const p = [0, 0, 0], n = [0, -1, 0], idx = [], bot = 1, topC = segments + 2, top = topC + 1;
    for (let j = 0; j <= segments; j++) { const th = j / segments * 2 * PI, c = Math.cos(th), s = Math.sin(th); p.push(radius * c, 0, radius * s); n.push(c, 0, s) }
    p.push(0, height, 0); n.push(0, 1, 0);
    for (let j = 0; j <= segments; j++) { const th = j / segments * 2 * PI, c = Math.cos(th), s = Math.sin(th); p.push(radius * c, height, radius * s); n.push(c, 0, s) }
    for (let j = 0; j < segments; j++) idx.push(0, bot + j + 1, bot + j, topC, top + j, top + j + 1, bot + j, bot + j + 1, top + j + 1, bot + j, top + j + 1, top + j);
    return { positions: p, normals: unitN(n), indices: idx };
  }

  // normal halus dari selisih tetangga grid; flip = arah normal dibalik (dipakai kepala, seperti kode asli)
  function gridMesh(grid, flip) {
    const R = grid.length - 1, C = grid[0].length - 1, p = [], n = [];
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      const a = grid[Math.max(0, i - 1)][j], b = grid[Math.min(R, i + 1)][j], c = grid[i][(j - 1 + C) % C], d = grid[i][(j + 1) % C];
      const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dv = [d[0] - c[0], d[1] - c[1], d[2] - c[2]], f = flip ? -1 : 1;
      p.push(...grid[i][j]);
      n.push(f * (du[1] * dv[2] - du[2] * dv[1]), f * (du[2] * dv[0] - du[0] * dv[2]), f * (du[0] * dv[1] - du[1] * dv[0]));
    }
    return { positions: p, normals: n, indices: gridIdx(R + 1, C + 1) };
  }

  // KEPALA: ellipsoid, bagian belakang (cosT < 0) ditarik jadi punuk lewat Bezier kubik 1D
  function generateDuckHeadWithBezierBack(a, b, c, stacks, slices, backBump, bumpY) {
    const grid = [];
    for (let i = 0; i <= stacks; i++) {
      const phi = i / stacks * PI - PI / 2, sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), row = [];
      for (let j = 0; j <= slices; j++) {
        const th = j / slices * 2 * PI - PI, cosT = Math.cos(th), sinT = Math.sin(th);
        let x = a * sinT * cosPhi, y = b * sinPhi, z = c * cosT * cosPhi;
        if (cosT < 0) {
          const t = -cosT, mt = 1 - t, bumpFactor = 3 * mt * mt * t * .20 + 3 * mt * t * t * .85 + t * t * t;
          const vertMask = Math.pow(Math.max(0, 1 - Math.abs(sinPhi) * 1.4), .55);
          z -= backBump * bumpFactor * vertMask; y += bumpY * bumpFactor * vertMask;
        }
        row.push([x, y, z]);
      }
      grid.push(row);
    }
    const g = gridMesh(grid, true); unitN(g.normals); return g;
  }

  // EKOR: dua kurva Bezier 3D (dorsal & ventral) disapu jadi ekor bebek bervolume + penutup pangkal & ujung
  function generateBezierDuckTail(Top, Bot, baseWidth, tipWidth, segments, slices) {
    const grid = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, pt = bezier(Top, t), pb = bezier(Bot, t), row = [];
      const mx = (pt[0] + pb[0]) / 2, my = (pt[1] + pb[1]) / 2, mz = (pt[2] + pb[2]) / 2;
      const hy = (pt[1] - pb[1]) / 2, hz = (pt[2] - pb[2]) / 2, w = baseWidth * Math.pow(1 - t, .55) + tipWidth * t;
      for (let j = 0; j <= slices; j++) { const th = j / slices * 2 * PI, c = Math.cos(th), s = Math.sin(th); row.push([mx + w * c, my + hy * s, mz + hz * s]) }
      grid.push(row);
    }
    const g = gridMesh(grid, false);
    const cap = (c, nrm, ring0, rev) => {
      const ci = g.positions.length / 3; g.positions.push(...c); g.normals.push(...nrm);
      for (let j = 0; j < slices; j++) g.indices.push(ci, ring0 + (rev ? j + 1 : j), ring0 + (rev ? j : j + 1));
    };
    cap([(Top[0][0] + Bot[0][0]) / 2, (Top[0][1] + Bot[0][1]) / 2, (Top[0][2] + Bot[0][2]) / 2], [0, 0, 1], 0, true);
    cap([(Top[3][0] + Bot[3][0]) / 2, (Top[3][1] + Bot[3][1]) / 2, (Top[3][2] + Bot[3][2]) / 2 - .02], [0, .55, -.83], segments * (slices + 1), false);
    unitN(g.normals); return g;
  }

  // tempatkan sebuah geometri dengan matriks m (kolom-mayor) dan gabungkan beberapa jadi satu (taring per rahang = 1 mesh)
  const place = (g, m) => {
    const p = [], n = [];
    for (let k = 0; k < g.positions.length; k += 3) {
      const x = g.positions[k], y = g.positions[k + 1], z = g.positions[k + 2], a = g.normals[k], b = g.normals[k + 1], c = g.normals[k + 2];
      p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      n.push(m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c);
    }
    return { positions: p, normals: n, indices: g.indices };
  };
  const merge = list => {
    const p = [], n = [], idx = [];
    for (const g of list) { const o = p.length / 3; g.positions.forEach(x => p.push(x)); g.normals.forEach(x => n.push(x)); g.indices.forEach(i => idx.push(i + o)) }
    return { positions: p, normals: n, indices: idx };
  };

  /* ================= SHADER =================
     Pencahayaan = persis yang dulu "dipanggang" ke warna vertex (ambient .64 + diffuse .36 + fill), dihitung di ruang lokal mesh.
     uTint dipakai adegan untuk meredupkan sesuai lampu lorong (standalone: putih). */
  const VS = `
    attribute vec3 aPos; attribute vec3 aNorm;
    uniform mat4 uModel, uViewProj;
    varying vec3 vN;
    void main(){ vN = aNorm; gl_Position = uViewProj * uModel * vec4(aPos, 1.0); }`;
  const FS = `
    precision mediump float;
    varying vec3 vN;
    uniform vec3 uColor, uTint;
    void main(){
      vec3 n = normalize(vN), L = normalize(vec3(0.45, 0.75, 0.50));
      float diff = max(dot(n, L), 0.0);
      float fill = max(0.0, -n.x * 0.25 - n.y * 0.35 - n.z * 0.45) * 0.18;
      gl_FragColor = vec4(min(uColor * (0.64 + 0.36 * diff + fill), vec3(1.0)) * uTint, 1.0);
    }`;
  function makeProgram() {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    return p;
  }
  function makeMesh(g) {
    const m = { pos: gl.createBuffer(), nrm: gl.createBuffer(), idx: gl.createBuffer(), count: g.indices.length };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.indices), gl.STATIC_DRAW);
    return m;
  }

  /* ================= MESH & WARNA ================= */
  const C = {
    body: [0.98, 0.82, 0.12], belly: [1.00, 0.88, 0.24], crest: [0.98, 0.80, 0.10], eye: [0.02, 0.02, 0.02],
    beak: [0.96, 0.78, 0.50], jaw: [0.80, 0.16, 0.24], mouth: [0.45, 0.12, 0.12], fang: [0.98, 0.98, 0.90],
    arm: [0.98, 0.82, 0.12], leg: [0.94, 0.58, 0.12], foot: [0.94, 0.60, 0.14], toe: [0.92, 0.56, 0.12], tail: [0.98, 0.82, 0.12]
  };
  const JAW_OPEN_UP = 0.30, JAW_OPEN_DOWN = 0.40;          // rad, bukaan rahang predator
  const D_UP = 2.15, D_DOWN = 1.98;                        // panjang rahang atas / bawah (ke depan, +Z)

  // rahang buaya: cangkang paraboloid panjang + deretan taring kerucut (sudah digabung jadi 1 mesh)
  function buildJaw(isUpper) {
    const D = isUpper ? D_UP : D_DOWN, rMax = Math.sqrt(D), a = (isUpper ? 0.62 : 0.54) / rMax, b = (isUpper ? 0.30 : 0.22) / rMax, dirY = isUpper ? -1 : 1;
    const teeth = [];
    const addTooth = (x, y, z, len, rad, side) => {
      const m = isUpper ? chain(T(x, y, z), rotX(PI), rotZ(side * 0.12)) : chain(T(x, y, z), rotZ(-side * 0.12));   // atas: ujung ke bawah
      teeth.push(place(generateCone(rad, len, 8), m));
    };
    const addRow = (th, len, rad, zStart, zEnd, n) => {
      for (let k = 0; k < n; k++) {
        const f = n > 1 ? k / (n - 1) : 0, z = zStart + (zEnd - zStart) * f, r = Math.sqrt(Math.max(D - z, 0.01));
        const l = len * (0.82 + 0.38 * Math.sin(PI * (0.12 + 0.76 * f)));
        for (let s = -1; s <= 1; s += 2) addTooth(s * a * r * Math.cos(th), dirY * b * r * Math.sin(th) - dirY * 0.035, z, l, rad, s);
      }
    };
    const zA = 0.28, zB = D - 0.15, n = Math.max(4, Math.round((zB - zA) / 0.16) + 1), half = (zB - zA) / (n - 1) * 0.5;
    addRow(0.28, isUpper ? 0.36 : 0.30, isUpper ? 0.060 : 0.052, zA, zB, n);
    addRow(0.88, isUpper ? 0.22 : 0.18, isUpper ? 0.040 : 0.034, zA + half, zB - half, n - 1);
    const rf = Math.sqrt(0.10), fx = a * rf * 0.65, fy = dirY * b * rf - dirY * 0.035;
    addTooth(-fx, fy, D - 0.10, isUpper ? 0.32 : 0.26, 0.058, -1);
    addTooth(fx, fy, D - 0.10, isUpper ? 0.32 : 0.26, 0.058, 1);
    return { shell: makeMesh(generateEllipticParaboloid(a, b, rMax, 24, 40)), teeth: makeMesh(merge(teeth)) };
  }

  let prog, aPos, aNorm, uModel, uVP, uColor, uTint, G;
  function initApex(_gl) {
    if (prog) return;
    gl = _gl; useMat4();
    prog = makeProgram();
    aPos = gl.getAttribLocation(prog, 'aPos'); aNorm = gl.getAttribLocation(prog, 'aNorm');
    uModel = gl.getUniformLocation(prog, 'uModel'); uVP = gl.getUniformLocation(prog, 'uViewProj');
    uColor = gl.getUniformLocation(prog, 'uColor'); uTint = gl.getUniformLocation(prog, 'uTint');
    G = {
      body: makeMesh(generateEllipsoid(0.96, 1.04, 0.90, 28, 40, 0.16, -0.10)),
      belly: makeMesh(generateEllipsoid(0.74, 0.80, 0.52, 22, 32)),
      head: makeMesh(generateDuckHeadWithBezierBack(1.05, 1.02, 1.00, 32, 44, 0.38, 0.10)),
      beakUpper: makeMesh(generateEllipticParaboloid(0.72, 0.22, 0.76, 16, 32)),
      beakLower: makeMesh(generateEllipticParaboloid(0.62, 0.16, 0.76, 14, 28)),
      mouth: makeMesh(generateEllipsoid(0.46, 0.36, 0.14, 16, 24)),
      jawUpper: buildJaw(true), jawLower: buildJaw(false),
      eye: makeMesh(generateEllipsoid(0.40, 0.44, 0.36, 24, 32)),
      wing: makeMesh(generateEllipticParaboloid(0.32, 0.20, 0.75, 14, 28)),
      leg: makeMesh(generateCylinder(0.16, 0.75, 16)),
      foot: makeMesh(generateEllipsoid(0.28, 0.08, 0.40, 10, 18)),
      toeSide: makeMesh(generateEllipsoid(0.09, 0.07, 0.24, 8, 12)),
      toeMid: makeMesh(generateEllipsoid(0.10, 0.07, 0.28, 8, 12)),
      tail: makeMesh(generateBezierDuckTail(
        [[0, 0.62, -0.62], [0, 0.40, -1.15], [0, 0.45, -1.48], [0, 0.62, -1.68]],      // kurva punggung (dorsal)
        [[0, -0.84, -0.42], [0, -0.75, -1.05], [0, -0.20, -1.48], [0, 0.54, -1.68]],   // kurva bawah pantat (ventral)
        0.94, 0.08, 32, 28))
    };
  }

  function draw(mesh, M, color) {
    gl.uniformMatrix4fv(uModel, false, M);
    gl.uniform3fv(uColor, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  /* ================= GAMBAR + ANIMASI =================
     root = matriks induk. p: tau (fase langkah), wb (bobot jalan 0..1), g (penguat langkah), pred (0 = paruh bebek, 1 = monster),
     roar / atk (0..1, dipakai adegan), lean (condong maju), life (napas saat diam, 0 = mati), t (waktu). */
  function renderApexBody(root, p) {
    const { tau, wb, g, pred, roar, atk, lean, life, t } = p;
    const a = wb * g, sn = Math.sin(tau), cs = Math.cos(tau), show = pred > 0.05;

    // BADAN: bobbing, goyang panggul (waddle), pelvis twist; skala tetap 1
    const bobY = -0.045 * Math.cos(2 * tau) * a + 0.012 * Math.sin(2 * t) * (1 - wb) * life;
    const waddleZ = 0.055 * sn * a, twistY = 0.030 * cs * wb;
    const body = chain(root, T(0, 0.15, 0), pivot(0, 0, 0, lean + 0.30 * atk, twistY, waddleZ, 1, 1, 1, 0.018 * roar * Math.sin(45 * t), bobY, 0));
    draw(G.body, body, C.body);
    draw(G.belly, chain(body, T(0, -0.15, 0.44)), C.belly);

    // KEPALA: pivot di leher; mengangguk, head bobbing, menengadah saat meraung
    const headBobZ = 0.045 * (1 - Math.cos(2 * tau)) * a, headNodX = 0.050 * Math.sin(2 * tau) * a - 0.35 * roar + 0.45 * atk;
    const head = chain(body, T(0, 1.42, 0), pivot(0, -0.5, 0, headNodX, 0, -0.45 * waddleZ, 1, 1, 1, 0, 0, headBobZ));
    draw(G.head, head, C.body);
    draw(G.eye, chain(head, T(-0.54, 0.08, 0.70), rotY(-0.22)), C.eye);
    draw(G.eye, chain(head, T(0.54, 0.08, 0.70), rotY(0.22)), C.eye);

    // PARUH BEBEK (mode biasa): mengorbit pusat kepala naik/turun dan membenam saat pred 0 -> 1
    const BEAK_TILT = -PI * 0.48;
    const orbit = (y0, z0, ang, sink) => {
      const c = Math.cos(ang), s = Math.sin(ang), y = y0 * c + z0 * s, z = -y0 * s + z0 * c, k = 1 - sink / Math.hypot(y, z);
      return chain(T(0, y * k, z * k), rotX(BEAK_TILT - ang));
    };
    draw(G.beakUpper, chain(head, orbit(-0.22, 1.44, 0.50 * pred, 0.10 * pred)), C.beak);
    draw(G.beakLower, chain(head, orbit(-0.36, 1.38, -0.45 * pred, 0.10 * pred)), C.beak);

    // RAHANG PREDATOR (mode monster): engsel di sudut mulut, membuka sesuai pred (+ menganga saat meraung)
    if (show) {
      const up = chain(head, T(0, -0.16, 0.75), rotX(-(JAW_OPEN_UP * pred + 0.30 * roar * pred)));
      const dn = chain(head, T(0, -0.50, 0.75), rotX(JAW_OPEN_DOWN * pred + 0.25 * roar * pred));
      draw(G.jawUpper.shell, chain(up, T(0, 0, D_UP), rotX(-PI / 2)), C.jaw);     // sumbu paraboloid (+y) -> -z, ujung di depan
      draw(G.jawUpper.teeth, up, C.fang);
      draw(G.jawLower.shell, chain(dn, T(0, 0, D_DOWN), rotX(-PI / 2)), C.jaw);
      draw(G.jawLower.teeth, dn, C.fang);
      draw(G.mouth, chain(head, T(0, -0.33, 0.90)), C.mouth);
    }

    // SAYAP: paraboloid, rotasi sumbu sembarang (±0.75, 0.30, 0.58) dengan pivot di dasar rim (0, 0.5625, 0)
    const wingFlap = 0.26 * cs * a;
    draw(G.wing, chain(body, T(-1.46, 0.02, 0), rotZ(-PI / 2), rotY(-0.20), rotX(0.12),
                       pivotAxis(0, 0.5625, 0, 0.75, 0.30, 0.58, wingFlap + 0.55 * roar - 0.8 * atk, 1, 1, 1, 0, 0, 0)), C.arm);
    draw(G.wing, chain(body, T(1.46, 0.02, 0), rotZ(PI / 2), rotY(0.20), rotX(0.12),
                       pivotAxis(0, 0.5625, 0, -0.75, 0.30, 0.58, -wingFlap - 0.55 * roar + 0.8 * atk, 1, 1, 1, 0, 0, 0)), C.arm);

    // EKOR (kurva Bezier 3D): rotasi sumbu sembarang (0.35, 1, 0.40), pivot di pangkal kurva
    draw(G.tail, chain(body, pivotAxis(0, -0.11, -0.52, 0.35, 1.0, 0.40, 0.22 * sn * a + 0.12 * Math.sin(9 * t) * roar, 1, 1, 1, 0, 0, 0)), C.tail);

    // KAKI (pivot di pinggul) + TELAPAK & JARI (scaling: gepeng & melebar saat menapak)
    const swing = 0.36 * sn * a, splay = 0.02 * sn * wb;
    const contactL = Math.max(0, -sn) * wb, contactR = Math.max(0, sn) * wb;
    const squashL = 1 - 0.45 * contactL, spreadL = 1 + 0.25 * contactL, squashR = 1 - 0.45 * contactR, spreadR = 1 + 0.25 * contactR;
    // [x, ayun kaki, splay, ayun ankle, squash Y, melebar XZ] untuk kiri lalu kanan (kanan berlawanan fase)
    for (const [x, sw, sp, ank, sq, spr] of [[-0.34, swing, -splay, -0.55 * swing, squashL, spreadL], [0.34, -swing, splay, 0.55 * swing, squashR, spreadR]]) {
      const leg = chain(body, T(x, -1.52, 0.05), pivot(0, 0.75, 0, sw, 0, sp, 1, 1, 1, 0, 0, 0));
      draw(G.leg, leg, C.leg);
      const foot = chain(leg, T(0, -0.04, 0.16), pivot(0, -0.08, 0, ank, 0, 0, spr, sq, spr, 0, 0, 0));
      draw(G.foot, foot, C.foot);
      draw(G.toeSide, chain(foot, T(-0.18, 0, 0.30), rotY(-0.22)), C.toe);
      draw(G.toeMid, chain(foot, T(0, 0, 0.35)), C.toe);
      draw(G.toeSide, chain(foot, T(0.18, 0, 0.30), rotY(0.22)), C.toe);
    }
    return { footSquash: Math.min(squashL, squashR), footSpread: Math.max(spreadL, spreadR) };
  }

  /* ================= EXPORT UNTUK MASTER SCENE =================
     drawApex(gfx, root, pose, t, o)   pose: 'idle' | 'roar' | 'run' | 'swat'
       o.ph fase langkah (rad)  o.k amplitudo jalan 0..1  o.run langkah lebih besar  o.pred 0..1 mode monster
       o.roar / o.atk 0..1  o.lit kecerahan lorong 0..1 (opsional, meredupkan saat lampu padam)
     root = posisi + yaw + skala dari scene (menghadap +Z, lantai y = 0). Mengembalikan false bila belum bisa menggambar. */
  const APEX_SCALE = 0.6; // ubah nilai ini untuk memperbesar atau memperkecil seluruh karakter
  const S0 = 0.365, GROUND = 1.49;   // model ±4.1 satuan -> tinggi 1.5 di adegan; telapak kaki model di y = -1.49
  window.drawApex = function (gfx, root, pose, t, o) {
    const _gl = window.gl || (gfx && gfx.gl);
    if (!_gl || !window.getV || !window.getPr) return false;
    initApex(_gl); o = o || {};
    const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) };
    const pred = o.pred !== undefined ? o.pred : sm(15.8, 17.6, t);          // cadangan bila adegan tidak mengirim o.pred
    const wb = o.k !== undefined ? o.k : (pose === 'run' ? 1 : 0), run = !!o.run || pose === 'run';
    gl.useProgram(prog);
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNorm);
    gl.uniformMatrix4fv(uVP, false, M4.mul(window.getPr(), window.getV()));
    const lit = o.lit;
    gl.uniform3fv(uTint, lit === undefined ? [1, 1, 1] : [0.78 * lit, 0.68 * lit, 0.54 * lit]);
    const modelScale = S0 * APEX_SCALE;
    renderApexBody(chain(root, S(modelScale, modelScale, modelScale), T(0, GROUND, 0)), {
      tau: o.ph || 0, wb, g: run ? 1.6 : 1, pred, roar: o.roar || 0, atk: o.atk || 0, lean: run ? 0.10 * wb : 0, life: 1, t
    });
    if (window.pg) gl.useProgram(window.pg);
  };

  /* ================= VIEWER STANDALONE (dilewati di master scene) ================= */
  const canvas = document.getElementById('mycanvas');
  if (!canvas || window.MASTER_SCENE || typeof Environment !== 'undefined') return;
  function start() {
    gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) { alert('WebGL tidak didukung'); return; }
    initApex(gl);
    gl.useProgram(prog); gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNorm);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(0.08, 0.08, 0.12, 1);

    let theta = -0.65, phi = -0.06, dist = 7.0, dTheta = 0, dPhi = 0, drag = false, xp = 0, yp = 0;
    const FRICTION = 0.88, TARGET_Y = 0.5, touches = {};
    const clampPhi = () => (phi = Math.max(-1.4, Math.min(1.4, phi)));
    canvas.addEventListener('mousedown', e => { drag = true; xp = e.clientX; yp = e.clientY; });
    window.addEventListener('mouseup', () => (drag = false));
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      dTheta = (e.clientX - xp) * 0.005; dPhi = (e.clientY - yp) * 0.005; theta += dTheta; phi += dPhi; clampPhi(); xp = e.clientX; yp = e.clientY;
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(2.5, Math.min(20, dist + e.deltaY * 0.01)); }, { passive: false });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY }; }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.changedTouches[0], q = touches[t.identifier]; if (!q) return;
        dTheta = (t.clientX - q.x) * 0.005; dPhi = (t.clientY - q.y) * 0.005; theta += dTheta; phi += dPhi; clampPhi();
        touches[t.identifier] = { x: t.clientX, y: t.clientY };
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (touches._pd) dist = Math.max(2.5, Math.min(20, dist - (d - touches._pd) * 0.02));
        touches._pd = d;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) delete touches[t.identifier]; if (e.touches.length < 2) delete touches._pd; });

    let predatorOn = false, predAmt = 0, walking = true, walkBlend = 1, walkTime = 0, last = 0;
    const setText = (id, txt, on) => { const el = document.getElementById(id); if (el) { el.textContent = txt; el.className = on ? 'badge active' : 'badge inactive' } };
    function updateUI() {
      setText('walk-status', walking ? 'AKTIF' : 'NONAKTIF', walking);
      setText('pred-status', predatorOn ? 'PREDATOR' : 'NORMAL', predatorOn);
    }
    window.toggleWalk = () => { walking = !walking; updateUI(); };
    window.togglePredator = () => { predatorOn = !predatorOn; updateUI(); };
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') { window.togglePredator(); e.preventDefault(); }
      else if (e.code === 'KeyW') { window.toggleWalk(); e.preventDefault(); }
    });
    updateUI();

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; gl.viewport(0, 0, canvas.width, canvas.height); }
    window.addEventListener('resize', resize); resize();

    function frame(now) {
      let dt = (now - last) * 0.001; if (last === 0 || dt > 0.1) dt = 0.016; last = now;
      if (!drag) { dTheta *= FRICTION; dPhi *= FRICTION; theta += dTheta; phi += dPhi; clampPhi(); }
      const predTarget = predatorOn ? 1 : 0;
      if (predAmt !== predTarget) { predAmt += (predTarget - predAmt) * 0.12; if (Math.abs(predTarget - predAmt) < 0.003) predAmt = predTarget; }
      walkBlend += ((walking ? 1 : 0) - walkBlend) * 0.08; if (Math.abs((walking ? 1 : 0) - walkBlend) < 0.002) walkBlend = walking ? 1 : 0;
      if (walkBlend > 0.001) walkTime += dt * 4.6;

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const eye = [dist * Math.sin(theta) * Math.cos(phi), dist * Math.sin(phi) + TARGET_Y, dist * Math.cos(theta) * Math.cos(phi)];
      gl.uniformMatrix4fv(uVP, false, M4.mul(M4.perspective(42 * PI / 180, canvas.width / canvas.height, 0.1, 100), M4.lookAt(eye, [0, TARGET_Y, 0], [0, 1, 0])));
      gl.uniform3fv(uTint, [1, 1, 1]);
      const info = renderApexBody(chain(M4.identity(), S(APEX_SCALE, APEX_SCALE, APEX_SCALE)), { tau: walkTime, wb: walkBlend, g: 1, pred: predAmt, roar: 0, atk: 0, lean: 0, life: 0, t: now * 0.001 });

      const el = document.getElementById('live-scale-val');
      if (el) el.textContent = info.footSquash < 0.95
        ? 'Menapak: GEPENG (Tinggi Sy: ' + info.footSquash.toFixed(2) + 'x, Lebar: ' + info.footSpread.toFixed(2) + 'x)'
        : 'Di Udara: NORMAL (Sy: 1.00x, Sx: 1.00x)';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();