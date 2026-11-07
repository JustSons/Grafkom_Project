/* libs.js - helper matematika, shader, dan generator geometri (WebGL murni) */

const Mat4 = {
  identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  // kolom-mayor: out = a * b
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  },
  chain(...ms) { return ms.reduce((acc, m) => Mat4.mul(acc, m)); },
  translation(x, y, z) { const m = Mat4.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
  scaling(x, y, z) { const m = Mat4.identity(); m[0] = x; m[5] = y; m[10] = z; return m; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) / (near - far); m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },
  lookAt(eye, target, up) {
    let z = Vec3.normalize(Vec3.sub(eye, target));
    let x = Vec3.normalize(Vec3.cross(up, z));
    let y = Vec3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -Vec3.dot(x, eye), -Vec3.dot(y, eye), -Vec3.dot(z, eye), 1
    ]);
  },
  // inverse-transpose 3x3 (untuk normal) lewat matriks kofaktor
  normalMatrix(m) {
    const a00 = m[0], a10 = m[1], a20 = m[2];
    const a01 = m[4], a11 = m[5], a21 = m[6];
    const a02 = m[8], a12 = m[9], a22 = m[10];
    const C00 = a11 * a22 - a12 * a21, C01 = -(a10 * a22 - a12 * a20), C02 = a10 * a21 - a11 * a20;
    const C10 = -(a01 * a22 - a02 * a21), C11 = a00 * a22 - a02 * a20, C12 = -(a00 * a21 - a01 * a20);
    const C20 = a01 * a12 - a02 * a11, C21 = -(a00 * a12 - a02 * a10), C22 = a00 * a11 - a01 * a10;
    const det = a00 * C00 + a01 * C01 + a02 * C02 || 1;
    return new Float32Array([
      C00 / det, C10 / det, C20 / det,
      C01 / det, C11 / det, C21 / det,
      C02 / det, C12 / det, C22 / det
    ]);
  }
};

const Vec3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  normalize(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};

/* ---------- Shader ---------- */
function createProgram(gl, vsSrc, fsSrc) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function createMesh(gl, geo) {
  const mk = (target, data) => {
    const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
  };
  return {
    pos: mk(gl.ARRAY_BUFFER, new Float32Array(geo.positions)),
    nrm: mk(gl.ARRAY_BUFFER, new Float32Array(geo.normals)),
    idx: mk(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.indices)),
    count: geo.indices.length
  };
}

/* ---------- Geometri ---------- */
const Geo = {
  // OBJEK 1: Ellipsoid satuan (skala lewat matriks model)
  ellipsoid(stacks = 28, slices = 36) {
    const positions = [], normals = [], indices = [];
    for (let i = 0; i <= stacks; i++) {
      const th = (i * Math.PI) / stacks;
      for (let j = 0; j <= slices; j++) {
        const ph = (j * 2 * Math.PI) / slices;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        positions.push(x, y, z); normals.push(x, y, z);
      }
    }
    for (let i = 0; i < stacks; i++)
      for (let j = 0; j < slices; j++) {
        const a = i * (slices + 1) + j, b = a + slices + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { positions, normals, indices };
  },

  // OBJEK 1b: ellipsoid satuan dengan "kantong mulut": lekukan cekung berbentuk persegi membulat di depan-bawah.
  // Seluruh kepala tetap SATU permukaan utuh (tanpa sambungan); tepi mulut membulat seperti bibir.
  carvedEllipsoid(stacks = 150, slices = 220, m = [0, -0.566, 0.824], a = 0.5, b = 0.317, depth = 0.45) {
    const mm = Vec3.normalize(m), e1 = [1, 0, 0], e2 = Vec3.normalize(Vec3.cross(mm, e1));
    const sstep = (e0, e1_, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1_ - e0))); return t * t * (3 - 2 * t); };
    const W = slices + 1, N = (stacks + 1) * W;
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), indices = [];
    for (let i = 0; i <= stacks; i++) {
      const th = (i * Math.PI) / stacks;
      for (let j = 0; j <= slices; j++) {
        const ph = (j * 2 * Math.PI) / slices;
        const p = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        const u = Vec3.dot(p, e1) / a, v = Vec3.dot(p, e2) / b;
        const s = Math.pow(Math.pow(Math.abs(u), 3) + Math.pow(Math.abs(v), 3), 1 / 3);   // superellipse (persegi membulat)
        const w = (1 - sstep(0.86, 1.0, s)) * sstep(0.1, 0.4, Vec3.dot(p, mm));
        const k = 1 - depth * w, o = (i * W + j) * 3;
        pos[o] = p[0] * k; pos[o + 1] = p[1] * k; pos[o + 2] = p[2] * k;
      }
    }
    for (let i = 0; i < stacks; i++)
      for (let j = 0; j < slices; j++) {
        const p0 = i * W + j, p1 = p0 + W, p2 = p0 + 1, p3 = p1 + 1;
        indices.push(p0, p1, p2, p1, p3, p2);
        for (const [x, y, z] of [[p0, p1, p2], [p1, p3, p2]]) {           // normal = akumulasi normal segitiga (mulus)
          const A = [pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]], B = [pos[y * 3], pos[y * 3 + 1], pos[y * 3 + 2]], C = [pos[z * 3], pos[z * 3 + 1], pos[z * 3 + 2]];
          const n = Vec3.cross(Vec3.sub(C, A), Vec3.sub(B, A));
          for (const q of [x, y, z]) { nor[q * 3] += n[0]; nor[q * 3 + 1] += n[1]; nor[q * 3 + 2] += n[2]; }
        }
      }
    const merge = (list) => {                                              // satukan normal di jahitan & kutub
      let sx = 0, sy = 0, sz = 0;
      for (const q of list) { sx += nor[q * 3]; sy += nor[q * 3 + 1]; sz += nor[q * 3 + 2]; }
      for (const q of list) { nor[q * 3] = sx; nor[q * 3 + 1] = sy; nor[q * 3 + 2] = sz; }
    };
    for (let i = 1; i < stacks; i++) merge([i * W, i * W + slices]);
    merge(Array.from({ length: W }, (_, j) => j));
    merge(Array.from({ length: W }, (_, j) => stacks * W + j));
    for (let q = 0; q < N; q++) {
      const l = Math.hypot(nor[q * 3], nor[q * 3 + 1], nor[q * 3 + 2]) || 1;
      nor[q * 3] /= l; nor[q * 3 + 1] /= l; nor[q * 3 + 2] /= l;
    }
    return { positions: Array.from(pos), normals: Array.from(nor), indices };
  },

  // OBJEK 2: Elliptic cone / frustum kerucut (quadric, BUKAN ellipsoid/cylinder).
  // Alas di y=0 (radius 1), puncak/atas di y=1 (radius topR; topR=0 -> kerucut penuh)
  cone(slices = 32, topR = 0) {
    const positions = [], normals = [], indices = [];
    for (let j = 0; j <= slices; j++) {
      const ph = (j * 2 * Math.PI) / slices, c = Math.cos(ph), s = Math.sin(ph);
      const n = Vec3.normalize([c, 1 - topR, s]);
      positions.push(c, 0, s, topR * c, 1, topR * s);
      normals.push(...n, ...n);
    }
    for (let j = 0; j < slices; j++) { const a = j * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    // tutup alas
    let base = positions.length / 3;
    positions.push(0, 0, 0); normals.push(0, -1, 0);
    for (let j = 0; j <= slices; j++) {
      const ph = (j * 2 * Math.PI) / slices;
      positions.push(Math.cos(ph), 0, Math.sin(ph)); normals.push(0, -1, 0);
    }
    for (let j = 0; j < slices; j++) indices.push(base, base + 2 + j, base + 1 + j);
    // tutup atas (hanya untuk frustum)
    if (topR > 0) {
      base = positions.length / 3;
      positions.push(0, 1, 0); normals.push(0, 1, 0);
      for (let j = 0; j <= slices; j++) {
        const ph = (j * 2 * Math.PI) / slices;
        positions.push(topR * Math.cos(ph), 1, topR * Math.sin(ph)); normals.push(0, 1, 0);
      }
      for (let j = 0; j < slices; j++) indices.push(base, base + 1 + j, base + 2 + j);
    }
    return { positions, normals, indices };
  },

  // Potongan permukaan ellipsoid satuan berupa kap dengan sumbu miring 'axis':
  // psi = sudut dari sumbu, chi = azimut (0 = arah 'front'). Tepinya mengikuti garis grid sehingga rapi.
  ellipsoidPatch(axis, front, psi0, psi1, chi0, chi1, nPsi = 20, nChi = 24) {
    const a = Vec3.normalize(axis), d = Vec3.dot(front, a);
    const u = Vec3.normalize([front[0] - d * a[0], front[1] - d * a[1], front[2] - d * a[2]]);
    const v = Vec3.cross(a, u);
    const positions = [], normals = [], indices = [];
    for (let i = 0; i <= nPsi; i++) {
      const psi = psi0 + ((psi1 - psi0) * i) / nPsi, cp = Math.cos(psi), sp = Math.sin(psi);
      for (let j = 0; j <= nChi; j++) {
        const chi = chi0 + ((chi1 - chi0) * j) / nChi, cc = Math.cos(chi), sc = Math.sin(chi);
        const x = cp * a[0] + sp * (cc * u[0] + sc * v[0]);
        const y = cp * a[1] + sp * (cc * u[1] + sc * v[1]);
        const z = cp * a[2] + sp * (cc * u[2] + sc * v[2]);
        positions.push(x, y, z); normals.push(x, y, z);
      }
    }
    for (let i = 0; i < nPsi; i++)
      for (let j = 0; j < nChi; j++) {
        const p = i * (nChi + 1) + j, q = p + nChi + 1;
        indices.push(p, q, p + 1, q, q + 1, p + 1);
      }
    return { positions, normals, indices };
  },

  // OBJEK 3: Tabung mengikuti KURVA Bezier kubik (dipakai untuk ekor & kaki)
  bezierTube(P, radiusFn, segs = 24, sides = 16) {
    const bez = t => {
      const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      return [0, 1, 2].map(k => a * P[0][k] + b * P[1][k] + c * P[2][k] + d * P[3][k]);
    };
    const der = t => {
      const u = 1 - t;
      return [0, 1, 2].map(k =>
        3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]));
    };
    const positions = [], normals = [], indices = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = bez(t), T = Vec3.normalize(der(t));
      let ref = Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const N = Vec3.normalize(Vec3.cross(ref, T)), B = Vec3.cross(T, N), r = radiusFn(t);
      for (let j = 0; j <= sides; j++) {
        const ph = (j * 2 * Math.PI) / sides, c = Math.cos(ph), s = Math.sin(ph);
        const nx = c * N[0] + s * B[0], ny = c * N[1] + s * B[1], nz = c * N[2] + s * B[2];
        positions.push(p[0] + r * nx, p[1] + r * ny, p[2] + r * nz);
        normals.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { positions, normals, indices };
  }
};