/**
 * main.js - Apex Predator (R.E.P.O.) WebGL Model & Viewer
 * 
 * Menggabungkan seluruh komponen model karakter:
 * 1. Generator Geometri (Quadric Objects & Kurva 3D Bezier)
 * 2. Scene Graph (SceneNode untuk hierarki transformasi)
 * 3. Definisi Model Apex Predator (R.E.P.O.)
 * 4. WebGL Pipeline, Orbit Camera, dan Interaksi
 *
 * Kontrol:
 *   - Mouse drag: Orbit kamera
 *   - Scroll: Zoom in / out
 *   - Space: Buka paruh & toggle taring (fangs)
 */

// =========================================================================

// 1. GEOMETRY GENERATORS (QUADRICS & BEZIER 3D CURVES)

// =========================================================================

/**
 * geometry.js
 * Kumpulan fungsi generator geometry untuk model Apex Predator (R.E.P.O.)
 * Setiap fungsi mengembalikan { vertices: Float32Array, indices: Uint16Array }
 * Format vertex: [x, y, z, r, g, b] per vertex (stride = 6 floats)
 * 
 * Dilengkapi kalkulasi normal analitik untuk directional shading halus,
 * menghasilkan efek 3D bervolume yang realistis dan mendalam.
 */

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Buat vertex buffer terinterleave [x,y,z,r,g,b, ...]
 * dengan directional shading halus berdasarkan vektor normal.
 * @param {number[][]} positions Array of [x,y,z]
 * @param {number[]}   color     [r,g,b] (0..1)
 * @param {number[][]} [normals] Array of [nx,ny,nz] (opsional)
 */
function buildVertices(positions, color, normals) {
    var arr = [];
    // Key light dari arah atas-kanan-depan
    var lx = 0.45, ly = 0.75, lz = 0.50;
    var llen = Math.sqrt(lx*lx + ly*ly + lz*lz);
    lx /= llen; ly /= llen; lz /= llen;

    for (var i = 0; i < positions.length; i++) {
        var r = color[0], g = color[1], b = color[2];

        // Hitung pencahayaan hanya jika normal tersedia dan warna bukan hitam pekat
        if (normals && normals[i] && (r > 0.05 || g > 0.05 || b > 0.05)) {
            var n = normals[i];
            var nlen = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
            if (nlen > 1e-6) {
                var nx = n[0]/nlen, ny = n[1]/nlen, nz = n[2]/nlen;
                var dot = nx*lx + ny*ly + nz*lz;
                var diff = Math.max(0.0, dot);
                // Fill light halus dari bawah-belakang-kiri agar bayangan tidak gelap gulita
                var fill = Math.max(0.0, -nx*0.25 - ny*0.35 - nz*0.45) * 0.18;
                // Ambient + Diffuse + Fill
                var factor = 0.64 + 0.36 * diff + fill;
                r = Math.min(1.0, r * factor);
                g = Math.min(1.0, g * factor);
                b = Math.min(1.0, b * factor);
            }
        }

        arr.push(positions[i][0], positions[i][1], positions[i][2], r, g, b);
    }
    return arr;
}

// ─────────────────────────────────────────────────────────
// 1. ELLIPSOID  (badan, kepala, mata, sayap, telapak)
//    x = a*cos(v)*cos(u), y = b*sin(u), z = c*sin(v)*cos(u)
//    u ∈ [-π/2, π/2]  (stack),  v ∈ [-π, π] (slice)
//    Mendukung parameter opsional taperTop & taperBottom untuk
//    menghasilkan bentuk kepala/badan anak ayam yang mulus organik.
// ─────────────────────────────────────────────────────────
function generateEllipsoid(a, b, c, stacks, slices, color, taperTop, taperBottom) {
    var positions = [];
    var normals   = [];
    var indices   = [];
    taperTop    = taperTop    || 0;
    taperBottom = taperBottom || 0;

    for (var i = 0; i <= stacks; i++) {
        var u = i / stacks * Math.PI - Math.PI / 2;
        var cosU = Math.cos(u);
        var sinU = Math.sin(u);

        // Faktor taper: mengecil di atas (dome chick crown) & mengembang di pipi bawah
        var scaleXZ = 1.0;
        if (sinU > 0 && taperTop !== 0) {
            scaleXZ = 1.0 - taperTop * sinU;
        } else if (sinU < 0 && taperBottom !== 0) {
            scaleXZ = 1.0 - taperBottom * (-sinU);
        }

        for (var j = 0; j <= slices; j++) {
            var v = j / slices * 2 * Math.PI - Math.PI;
            var cosV = Math.cos(v);
            var sinV = Math.sin(v);

            var effA = a * scaleXZ;
            var effC = c * scaleXZ;

            var x = effA * cosV * cosU;
            var y = b * sinU;
            var z = effC * sinV * cosU;

            positions.push([x, y, z]);
            // Normal analitik ellipsoid
            normals.push([cosV * cosU / Math.max(effA, 1e-4), sinU / b, sinV * cosU / Math.max(effC, 1e-4)]);
        }
    }

    for (var i = 0; i < stacks; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 2. ELLIPTIC PARABOLOID  (paruh bebek)
//    y = (x/a)^2 + (z/b)^2, diselesaikan secara parametrik:
//    x = r*cos(θ)*a,  z = r*sin(θ)*b,  y = r^2
//    r ∈ [0, rMax],  θ ∈ [0, 2π]
// ─────────────────────────────────────────────────────────
function generateEllipticParaboloid(a, b, rMax, rings, segments, color) {
    var positions = [];
    var normals   = [];
    var indices   = [];

    for (var i = 0; i <= rings; i++) {
        var r = (i / rings) * rMax;
        for (var j = 0; j <= segments; j++) {
            var theta = (j / segments) * 2 * Math.PI;
            var cosT = Math.cos(theta);
            var sinT = Math.sin(theta);

            var x = r * cosT * a;
            var y = r * r;
            var z = r * sinT * b;

            positions.push([x, y, z]);

            // Normal analitik: gradien dari y - (x/a)^2 - (z/b)^2 = 0
            // Normal ke arah luar: (-2x/a^2, 1, -2z/b^2) atau sebaliknya
            if (r < 1e-5) {
                normals.push([0, -1, 0]);
            } else {
                normals.push([2 * cosT / a, -2 * r, 2 * sinT / b]);
            }
        }
    }

    for (var i = 0; i < rings; i++) {
        for (var j = 0; j < segments; j++) {
            var a0 = i * (segments + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (segments + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    // Penutup pangkal paraboloid di r = rMax (supaya mesh tertutup rapi)
    var centerIndex = positions.length;
    positions.push([0, rMax * rMax, 0]);
    normals.push([0, 1, 0]);

    var lastRingStart = rings * (segments + 1);
    for (var j = 0; j < segments; j++) {
        indices.push(centerIndex, lastRingStart + j, lastRingStart + j + 1);
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 3. CONE  (taring & jambul belakang kepala)
//    Kerucut meruncing ke satu titik di atas (tip di y=height)
//    baseRadius → 0 dari y=0 ke y=height
// ─────────────────────────────────────────────────────────
function generateCone(baseRadius, height, segments, color) {
    var positions = [];
    var normals   = [];
    var indices   = [];

    // Kemiringan normal selimut kerucut
    var slope = baseRadius / Math.max(height, 1e-4);

    // Titik puncak (tip)
    var tipIndex = 0;
    positions.push([0, height, 0]);
    normals.push([0, 1, 0]);

    // Titik pusat dasar
    var centerIndex = 1;
    positions.push([0, 0, 0]);
    normals.push([0, -1, 0]);

    // Lingkaran dasar
    var baseStart = 2;
    for (var j = 0; j <= segments; j++) {
        var theta = (j / segments) * 2 * Math.PI;
        var cosT = Math.cos(theta);
        var sinT = Math.sin(theta);

        positions.push([baseRadius * cosT, 0, baseRadius * sinT]);
        normals.push([cosT, slope, sinT]);
    }

    // Sisi kerucut (tip → lingkaran dasar)
    for (var j = 0; j < segments; j++) {
        indices.push(tipIndex, baseStart + j, baseStart + j + 1);
    }

    // Penutup dasar
    for (var j = 0; j < segments; j++) {
        indices.push(centerIndex, baseStart + j + 1, baseStart + j);
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 4. CYLINDER  (kaki)
//    Tabung dari y=0 ke y=height, radius uniform
// ─────────────────────────────────────────────────────────
function generateCylinder(radius, height, segments, color) {
    var positions = [];
    var normals   = [];
    var indices   = [];

    // Lingkaran bawah (y=0) + tutup bawah
    var botCenter = 0;
    positions.push([0, 0, 0]);
    normals.push([0, -1, 0]);

    var botRingStart = 1;
    for (var j = 0; j <= segments; j++) {
        var theta = (j / segments) * 2 * Math.PI;
        var cosT = Math.cos(theta);
        var sinT = Math.sin(theta);
        positions.push([radius * cosT, 0, radius * sinT]);
        normals.push([cosT, 0, sinT]);
    }

    // Lingkaran atas (y=height) + tutup atas
    var topCenter = botRingStart + segments + 1;
    positions.push([0, height, 0]);
    normals.push([0, 1, 0]);

    var topRingStart = topCenter + 1;
    for (var j = 0; j <= segments; j++) {
        var theta = (j / segments) * 2 * Math.PI;
        var cosT = Math.cos(theta);
        var sinT = Math.sin(theta);
        positions.push([radius * cosT, height, radius * sinT]);
        normals.push([cosT, 0, sinT]);
    }

    // Tutup bawah
    for (var j = 0; j < segments; j++) {
        indices.push(botCenter, botRingStart + j + 1, botRingStart + j);
    }

    // Tutup atas
    for (var j = 0; j < segments; j++) {
        indices.push(topCenter, topRingStart + j, topRingStart + j + 1);
    }

    // Sisi tabung
    for (var j = 0; j < segments; j++) {
        var b0 = botRingStart + j;
        var b1 = botRingStart + j + 1;
        var t0 = topRingStart + j;
        var t1 = topRingStart + j + 1;
        indices.push(b0, b1, t1,  b0, t1, t0);
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 5. BEZIER SWEEP  (ekor)
//    Kurva Bezier 3D kubik sebagai spine, disapu lingkaran
// ─────────────────────────────────────────────────────────

/** Evaluasi titik pada kurva Bezier kubik */
function bezierCubic(P0, P1, P2, P3, t) {
    var mt  = 1 - t;
    var mt2 = mt * mt;
    var mt3 = mt2 * mt;
    var t2  = t * t;
    var t3  = t2 * t;
    return [
        mt3*P0[0] + 3*mt2*t*P1[0] + 3*mt*t2*P2[0] + t3*P3[0],
        mt3*P0[1] + 3*mt2*t*P1[1] + 3*mt*t2*P2[1] + t3*P3[1],
        mt3*P0[2] + 3*mt2*t*P1[2] + 3*mt*t2*P2[2] + t3*P3[2]
    ];
}

/** Normalize vektor 3D */
function normalize3(v) {
    var len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if (len < 1e-8) return [0, 1, 0];
    return [v[0]/len, v[1]/len, v[2]/len];
}

/** Cross product */
function cross3(a, b) {
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ];
}

/**
 * Buat mesh ekor dengan Bezier sweep.
 * Kontrol point dalam ruang lokal (akar ekor di origin).
 * Radius menyempit dari baseRadius → tipRadius.
 */
function generateBezierSweep(P0, P1, P2, P3,
                              baseRadius, tipRadius,
                              segments, slices, color) {
    var positions = [];
    var normals   = [];
    var indices   = [];

    for (var i = 0; i <= segments; i++) {
        var t     = i / segments;
        var pt    = bezierCubic(P0, P1, P2, P3, t);
        var t1    = Math.min(t + 0.001, 1);
        var pt1   = bezierCubic(P0, P1, P2, P3, t1);

        // Tangent (arah spine)
        var tangent = normalize3([pt1[0]-pt[0], pt1[1]-pt[1], pt1[2]-pt[2]]);

        // Bangun local frame
        var up = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        var right  = normalize3(cross3(tangent, up));
        var up2    = cross3(right, tangent);

        var radius = baseRadius + (tipRadius - baseRadius) * t;

        for (var j = 0; j <= slices; j++) {
            var theta = (j / slices) * 2 * Math.PI;
            var cos   = Math.cos(theta), sin = Math.sin(theta);
            
            var nx = cos*right[0] + sin*up2[0];
            var ny = cos*right[1] + sin*up2[1];
            var nz = cos*right[2] + sin*up2[2];

            positions.push([
                pt[0] + radius * nx,
                pt[1] + radius * ny,
                pt[2] + radius * nz
            ]);
            normals.push([nx, ny, nz]);
        }
    }

    for (var i = 0; i < segments; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 6. BEZIER DUCK TAIL (Ekor Baji Bebek Berbasis Kurva Bezier 3D)
//    Membentuk badan belakang & ekor yang menyatu mulus (bukan batang).
//    Menggunakan 2 kurva Bezier 3D (dorsal/atas & ventral/bawah)
//    yang disapu ke belakang & melengkung anggun ke atas.
// ─────────────────────────────────────────────────────────
function generateBezierDuckTail(T, B, baseWidth, tipWidth, segments, slices, color) {
    var positions = [];
    var normals   = [];
    var indices   = [];
    var grid      = []; // 2D grid [segments+1][slices+1]

    for (var i = 0; i <= segments; i++) {
        var t = i / segments;
        var ptTop = bezierCubic(T[0], T[1], T[2], T[3], t);
        var ptBot = bezierCubic(B[0], B[1], B[2], B[3], t);

        // Center spine dan vektor tinggi cross-section
        var midX = (ptTop[0] + ptBot[0]) * 0.5;
        var midY = (ptTop[1] + ptBot[1]) * 0.5;
        var midZ = (ptTop[2] + ptBot[2]) * 0.5;

        var hy = (ptTop[1] - ptBot[1]) * 0.5;
        var hz = (ptTop[2] - ptBot[2]) * 0.5;

        // Lebar melintang (X): montok di pangkal badan, tebal di tengah, menyatu anggun ke ujung
        var w = baseWidth * Math.pow(1.0 - t, 0.55) + tipWidth * t;

        var row = [];
        for (var j = 0; j <= slices; j++) {
            var theta = (j / slices) * 2 * Math.PI;
            var cosT  = Math.cos(theta); // arah lebar (X)
            var sinT  = Math.sin(theta); // arah tinggi (Y-Z)

            var x = midX + w * cosT;
            var y = midY + hy * sinT;
            var z = midZ + hz * sinT;

            row.push([x, y, z]);
        }
        grid.push(row);
    }

    // Hitung posisi dan normal grid yang halus dari cross product
    for (var i = 0; i <= segments; i++) {
        for (var j = 0; j <= slices; j++) {
            positions.push(grid[i][j]);

            var i0 = Math.max(0, i - 1);
            var i1 = Math.min(segments, i + 1);
            var j0 = (j - 1 + slices) % slices;
            var j1 = (j + 1) % slices;

            var du = [
                grid[i1][j][0] - grid[i0][j][0],
                grid[i1][j][1] - grid[i0][j][1],
                grid[i1][j][2] - grid[i0][j][2]
            ];
            var dv = [
                grid[i][j1][0] - grid[i][j0][0],
                grid[i][j1][1] - grid[i][j0][1],
                grid[i][j1][2] - grid[i][j0][2]
            ];

            var nx = du[1]*dv[2] - du[2]*dv[1];
            var ny = du[2]*dv[0] - du[0]*dv[2];
            var nz = du[0]*dv[1] - du[1]*dv[0];
            var nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (nlen < 1e-6) {
                normals.push([0, 1, 0]);
            } else {
                normals.push([nx / nlen, ny / nlen, nz / nlen]);
            }
        }
    }

    // Grid indices
    for (var i = 0; i < segments; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    // Penutup pangkal di t=0 (berada di dalam badan)
    var centerIndex = positions.length;
    var baseMidX = (T[0][0] + B[0][0]) * 0.5;
    var baseMidY = (T[0][1] + B[0][1]) * 0.5;
    var baseMidZ = (T[0][2] + B[0][2]) * 0.5;
    positions.push([baseMidX, baseMidY, baseMidZ]);
    normals.push([0, 0, 1]); // mengarah ke dalam badan (+Z)

    for (var j = 0; j < slices; j++) {
        indices.push(centerIndex, j + 1, j);
    }

    // Penutup ujung di t=1 (tip ekor) - berbentuk jentikan runcing membulat
    var tipCenterIndex = positions.length;
    var tipMidX = (T[3][0] + B[3][0]) * 0.5;
    var tipMidY = (T[3][1] + B[3][1]) * 0.5;
    var tipMidZ = (T[3][2] + B[3][2]) * 0.5 - 0.02;
    positions.push([tipMidX, tipMidY, tipMidZ]);
    normals.push([0, 0.55, -0.83]); // mengarah ke belakang-atas melengkung

    var tipRingStart = segments * (slices + 1);
    for (var j = 0; j < slices; j++) {
        indices.push(tipCenterIndex, tipRingStart + j, tipRingStart + j + 1);
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 6b. DUCK HEAD WITH BEZIER BACK BUMP
//     Ellipsoid kepala di mana bagian belakang (cosT < 0)
//     ditarik keluar secara smooth via Bezier kubik,
//     membentuk punuk/bun membulat di belakang kepala
//     persis seperti siluet Apex Predator R.E.P.O.
//     Bagian depan (cosT > 0) tetap bulat sempurna untuk muka.
// ─────────────────────────────────────────────────────────
function generateDuckHeadWithBezierBack(a, b, c, stacks, slices, color, backBump, bumpY) {
    // a        = radius X (kiri-kanan)
    // b        = radius Y (atas-bawah)
    // c        = radius Z (depan-depan, bagian muka)
    // backBump = seberapa jauh punuk belakang menonjol ke -Z (contoh: 0.35)
    // bumpY    = seberapa naik punuk ke +Y (contoh: 0.08)
    backBump = backBump || 0.30;
    bumpY    = bumpY    || 0.06;

    var grid = []; // 2D array [stacks+1][slices+1]

    for (var i = 0; i <= stacks; i++) {
        var u    = i / stacks;
        var phi  = u * Math.PI - Math.PI / 2; // -pi/2 (bawah) s.d. +pi/2 (atas)
        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);

        var row = [];
        for (var j = 0; j <= slices; j++) {
            var theta = j / slices * 2 * Math.PI - Math.PI; // -pi s.d. +pi
            var cosT  = Math.cos(theta); // +1=depan(+Z), -1=belakang(-Z)
            var sinT  = Math.sin(theta); // kiri-kanan (X)

            // Posisi dasar ellipsoid
            var x = a * sinT  * cosPhi;
            var y = b * sinPhi;
            var z = c * cosT  * cosPhi;

            // Terapkan Bezier bump hanya di bagian belakang (cosT < 0)
            if (cosT < 0) {
                // backAmt: 0 di samping, 1 di garis tengah belakang
                var backAmt = -cosT;

                // Bezier cubic smooth: 0 → lembut naik → puncak
                var t  = backAmt;
                var mt = 1 - t;
                var bumpFactor = 3*mt*mt*t*0.20 + 3*mt*t*t*0.85 + t*t*t*1.0;

                // Hanya aktif di area tengah vertikal agar membulat organik
                var vertMask = Math.max(0, 1.0 - Math.abs(sinPhi) * 1.4);
                vertMask     = Math.pow(vertMask, 0.55);

                var finalBump = bumpFactor * vertMask;

                z -= backBump * finalBump; // dorong ke belakang (-Z)
                y += bumpY   * finalBump; // angkat sedikit ke atas (+Y)
            }

            row.push([x, y, z]);
        }
        grid.push(row);
    }

    // Hitung normal dari cross product tetangga grid
    var positions = [];
    var normals   = [];
    var indices   = [];

    for (var i = 0; i <= stacks; i++) {
        for (var j = 0; j <= slices; j++) {
            positions.push(grid[i][j]);

            var iPrev = Math.max(0, i - 1);
            var iNext = Math.min(stacks, i + 1);
            var du = [
                grid[iNext][j][0] - grid[iPrev][j][0],
                grid[iNext][j][1] - grid[iPrev][j][1],
                grid[iNext][j][2] - grid[iPrev][j][2]
            ];

            var jPrev = (j - 1 + slices) % slices;
            var jNext = (j + 1) % slices;
            var dv = [
                grid[i][jNext][0] - grid[i][jPrev][0],
                grid[i][jNext][1] - grid[i][jPrev][1],
                grid[i][jNext][2] - grid[i][jPrev][2]
            ];

            var n = cross3(dv, du);
            normals.push(normalize3(n));
        }
    }

    // Indeks segitiga
    for (var i = 0; i < stacks; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

/** Evaluasi titik 1D pada kurva Bezier kubik */
function bezierCubic1D(p0, p1, p2, p3, t) {
    var mt  = 1 - t;
    var mt2 = mt * mt;
    var mt3 = mt2 * mt;
    var t2  = t * t;
    var t3  = t2 * t;
    return mt3*p0 + 3*mt2*t*p1 + 3*mt*t2*p2 + t3*p3;
}

// ─────────────────────────────────────────────────────────
// 7. SEAMLESS DUCK BODY WITH BEZIER TAIL
//    Satu kesatuan mesh utuh (100% tanpa sambungan/seam)
//    di mana badan belakang mengalir mulus menjentik menjadi ekor
//    berdasarkan kurva Bezier 3D, persis seperti miniatur figurine.
// ─────────────────────────────────────────────────────────
function generateDuckBodyWithBezierTail(a, b, c, stacks, slices, color) {
    var grid = []; // 2D array [stacks+1][slices+1] of [x, y, z]

    for (var i = 0; i <= stacks; i++) {
        var u = i / stacks; // 0 (bawah) s.d. 1 (leher atas)
        var phi = u * Math.PI - Math.PI / 2; // -pi/2 s.d. +pi/2
        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);

        // Sedikit lebih ramping di leher atas, buncit di perut bawah
        var effA = a * (1.0 - 0.12 * Math.max(0.0, sinPhi));
        var effB = b;
        var effC = c;

        // Kontrol profil ekor berbasis kurva Bezier kubik dengan puncak lancip (cusp)
        // Aktif dari u=0.18 (dasar panggul belakang) s.d. u=0.82 (punggung atas)
        var tailFactor = 0;
        if (u >= 0.18 && u <= 0.82) {
            var tu = (u - 0.18) / (0.82 - 0.18); // parameter t in [0, 1]
            var peakU = 0.58; // posisi puncak ekor
            if (tu <= peakU) {
                // Busur bawah: menyapu naik ke puncak
                var s = tu / peakU;
                tailFactor = bezierCubic1D(0.0, 0.15, 0.65, 1.0, s);
            } else {
                // Busur atas: melandai anggun ke punggung
                var s = (1.0 - tu) / (1.0 - peakU);
                tailFactor = bezierCubic1D(0.0, 0.18, 0.70, 1.0, s);
            }
        }

        var row = [];
        for (var j = 0; j <= slices; j++) {
            var theta = j / slices * 2 * Math.PI - Math.PI; // -pi s.d. +pi
            var cosT  = Math.cos(theta); // +1 di depan (+Z), -1 di belakang (-Z)
            var sinT  = Math.sin(theta); // samping (+X / -X)

            var x = effA * sinT * cosPhi;
            var y = effB * sinPhi;
            var z = effC * cosT * cosPhi;

            // Di bagian belakang (cosT < 0), tarik permukaan menyatu membentuk ekor
            if (cosT < 0 && tailFactor > 0) {
                var backAmt = -cosT; // 0 di samping, 1 di garis tengah belakang
                // Baji ekor: memusat tajam di punggung tengah belakang membentuk ujung lancip
                var keel = Math.pow(backAmt, 3.2);

                // Ekstensi keluar ke belakang (-Z) dan angkat ke atas (+Y)
                var extZ = 0.78 * tailFactor * keel;
                var extY = 0.46 * tailFactor * keel;

                z -= extZ;
                y += extY;
            }

            row.push([x, y, z]);
        }
        grid.push(row);
    }

    // Hitung vektor normal analitik halus dari cross product grid
    var positions = [];
    var normals   = [];
    var indices   = [];

    for (var i = 0; i <= stacks; i++) {
        for (var j = 0; j <= slices; j++) {
            var p = grid[i][j];
            positions.push(p);

            var iPrev = Math.max(0, i - 1);
            var iNext = Math.min(stacks, i + 1);
            var du = [
                grid[iNext][j][0] - grid[iPrev][j][0],
                grid[iNext][j][1] - grid[iPrev][j][1],
                grid[iNext][j][2] - grid[iPrev][j][2]
            ];

            var jPrev = (j - 1 + slices) % slices;
            var jNext = (j + 1) % slices;
            var dv = [
                grid[i][jNext][0] - grid[i][jPrev][0],
                grid[i][jNext][1] - grid[i][jPrev][1],
                grid[i][jNext][2] - grid[i][jPrev][2]
            ];

            var n = cross3(dv, du);
            normals.push(normalize3(n));
        }
    }

    // Indeks segitiga
    for (var i = 0; i < stacks; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}

// ─────────────────────────────────────────────────────────
// 8. CHICK WING WITH 3 INTEGRATED FINGERS (Sayap Terpadu)
//    Membentuk sayap anak ayam utuh di mana 3 jari di tepi belakang
//    tergabung langsung sebagai satu kesatuan geometri tanpa sambungan.
// ─────────────────────────────────────────────────────────
function generateChickWing(isLeft, color) {
    var az = 0.28;         // semi-axis kedalaman (depan-ke-belakang)
    var by = 0.44;         // semi-axis tinggi
    var thickOuter = 0.15; // cembung sisi luar (menjauh dari badan)
    var thickInner = 0.05; // sisi dalam yang menempel ke badan
    var stacks = 18;
    var slices = 48;

    var grid = [];

    for (var i = 0; i <= stacks; i++) {
        var phi = (i / stacks) * Math.PI - Math.PI / 2; // -pi/2 s.d. +pi/2
        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);
        var rho    = Math.max(0.0, cosPhi);

        // Tebal sisi luar vs dalam
        var x;
        if (sinPhi >= 0) {
            x = (isLeft ? -1 : 1) * thickOuter * sinPhi;
        } else {
            x = (isLeft ? 1 : -1) * thickInner * (-sinPhi);
        }

        var row = [];
        for (var j = 0; j <= slices; j++) {
            var theta = (j / slices) * 2 * Math.PI;
            var cosT  = Math.cos(theta); // arah Z (depan/belakang)
            var sinT  = Math.sin(theta); // arah Y (atas/bawah)

            var rBase = 1.0 / Math.sqrt((cosT / az) * (cosT / az) + (sinT / by) * (sinT / by));

            // Tambahkan 3 jari (fingers / feather scallops) pada tepi belakang (cosT < 0)
            var deltaR = 0;
            if (theta >= Math.PI * 0.5 && theta <= Math.PI * 1.5) {
                var tau = (theta - Math.PI * 0.5) / Math.PI; // 0 di bahu atas s.d. 1 di ujung bawah
                var lobe = Math.abs(Math.sin(3.0 * Math.PI * tau));
                var finger = Math.pow(lobe, 1.35);
                // Jari tengah sedikit lebih menonjol
                var lengthMult = 1.0 + 0.35 * Math.sin(Math.PI * tau);
                deltaR = 0.20 * finger * lengthMult;
            }

            var r = rBase + deltaR;
            var z = r * cosT;
            var y = r * sinT;

            // Kelengkungan alami lengan anak ayam (bahu agak ke belakang, siku/tangan ke depan)
            var zTilted = z - 0.06 * (y / by);
            var yTilted = y;

            row.push([x, rho * yTilted, rho * zTilted]);
        }
        grid.push(row);
    }

    var positions = [];
    var normals   = [];
    var indices   = [];

    // Hitung posisi dan normal grid yang halus dari cross product
    for (var i = 0; i <= stacks; i++) {
        for (var j = 0; j <= slices; j++) {
            positions.push(grid[i][j]);

            var i0 = Math.max(0, i - 1);
            var i1 = Math.min(stacks, i + 1);
            var j0 = (j - 1 + slices) % slices;
            var j1 = (j + 1) % slices;

            var du = [
                grid[i1][j][0] - grid[i0][j][0],
                grid[i1][j][1] - grid[i0][j][1],
                grid[i1][j][2] - grid[i0][j][2]
            ];
            var dv = [
                grid[i][j1][0] - grid[i][j0][0],
                grid[i][j1][1] - grid[i][j0][1],
                grid[i][j1][2] - grid[i][j0][2]
            ];

            // Arah normal keluar
            var nx, ny, nz;
            if (isLeft) {
                nx = dv[1]*du[2] - dv[2]*du[1];
                ny = dv[2]*du[0] - dv[0]*du[2];
                nz = dv[0]*du[1] - dv[1]*du[0];
            } else {
                nx = du[1]*dv[2] - du[2]*dv[1];
                ny = du[2]*dv[0] - du[0]*dv[2];
                nz = du[0]*dv[1] - du[1]*du[0];
            }

            var nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (nlen < 1e-6) {
                normals.push([isLeft ? -1 : 1, 0, 0]);
            } else {
                normals.push([nx / nlen, ny / nlen, nz / nlen]);
            }
        }
    }

    // Grid triangles
    for (var i = 0; i < stacks; i++) {
        for (var j = 0; j < slices; j++) {
            var a0 = i * (slices + 1) + j;
            var a1 = a0 + 1;
            var b0 = a0 + (slices + 1);
            var b1 = b0 + 1;
            indices.push(a0, a1, b1,  a0, b1, b0);
        }
    }

    return { vertices: buildVertices(positions, color, normals), indices: indices };
}



// =========================================================================

// 2. SCENE GRAPH (HIERARCHICAL TRANSFORMATION)

// =========================================================================

/**
 * SceneNode.js
 * Node scene graph untuk hierarki transformasi model 3D.
 * Setiap node menyimpan geometry-nya sendiri dan daftar anak.
 *
 * Sistem matriks mengikuti pola Pertemuan 5 (MyObject.js):
 *   MODEL = MOVE_MATRIX * POSITION_MATRIX * PARENT_MATRIX
 */

class SceneNode {
    constructor(GL, SHADER_PROGRAM, _position, _color, _Mmatrix) {
        this.GL             = GL;
        this.SHADER_PROGRAM = SHADER_PROGRAM;
        this._position      = _position;
        this._color         = _color;
        this._Mmatrix       = _Mmatrix;

        this.vertex         = [];   // [x,y,z,r,g,b, ...]
        this.faces          = [];   // indices

        this.OBJECT_VERTEX  = null;
        this.OBJECT_FACES   = null;
        this.faceCount      = 0;

        // Matriks pose statis (set sekali di awal)
        this.POSITION_MATRIX = LIBS.get_I4();
        // Matriks animasi (diupdate tiap frame)
        this.MOVE_MATRIX     = LIBS.get_I4();

        this.visible = true;
        this.children = [];
    }

    /** Assign geometry dari hasil fungsi generate* */
    setGeometry(geomData) {
        this.vertex    = geomData.vertices;
        this.faces     = geomData.indices;
        this.faceCount = geomData.indices.length;
    }

    /** Upload semua buffer ke GPU, rekursif ke anak */
    setup() {
        if (this.vertex.length > 0) {
            this.OBJECT_VERTEX = this.GL.createBuffer();
            this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.OBJECT_VERTEX);
            this.GL.bufferData(this.GL.ARRAY_BUFFER,
                               new Float32Array(this.vertex),
                               this.GL.STATIC_DRAW);

            this.OBJECT_FACES = this.GL.createBuffer();
            this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.OBJECT_FACES);
            this.GL.bufferData(this.GL.ELEMENT_ARRAY_BUFFER,
                               new Uint16Array(this.faces),
                               this.GL.STATIC_DRAW);
        }
        this.children.forEach(child => child.setup());
    }

    /**
     * Render node dan anak-anaknya secara rekursif.
     * @param {number[]} parentMatrix  Model matrix dari parent (flat 16 floats)
     */
    render(parentMatrix) {
        // MODEL = MOVE * POS * PARENT
        var model = LIBS.multiply(this.MOVE_MATRIX, this.POSITION_MATRIX);
        model     = LIBS.multiply(model, parentMatrix);

        if (this.visible && this.OBJECT_VERTEX) {
            this.GL.uniformMatrix4fv(this._Mmatrix, false, model);

            this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.OBJECT_VERTEX);
            // stride = 6 float * 4 byte = 24 byte
            this.GL.vertexAttribPointer(this._position, 3, this.GL.FLOAT, false, 24, 0);
            this.GL.vertexAttribPointer(this._color,    3, this.GL.FLOAT, false, 24, 12);

            this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.OBJECT_FACES);
            this.GL.drawElements(this.GL.TRIANGLES, this.faceCount,
                                 this.GL.UNSIGNED_SHORT, 0);
        }

        this.children.forEach(child => child.render(model));
    }
}



// =========================================================================

// 3. APEX PREDATOR MODEL (R.E.P.O.)

// =========================================================================

/**
 * model.js  –  Apex Predator (R.E.P.O.)
 * 
 * Karakter anak ayam pemangsa kuning (Apex Predator):
 * - Memenuhi syarat akademis:
 *   1. Kurva 3D: Bezier Duck Tail (Kurva Bezier 3D kubik dorsal & ventral untuk ekor bebek bervolume).
 *   2. Tiga+ jenis Quadratic Object berbeda:
 *      - Ellipsoid          : Badan, kepala (tapered dome), mata, lengan, telapak & jari kaki
 *      - Elliptic Paraboloid: Paruh atas & paruh bawah (beak)
 *      - Cone (Kerucut)     : Jambul belakang kepala (crest) & taring tersembunyi (fangs)
 *      - Cylinder (Silinder): Batang kaki (legs)
 * - Warna: Kuning cerah anak ayam (#FFD21A), mata hitam pekat tanpa glare.
 * - Detail tangan: Dilengkapi 3 ujung bulu/jari pada tepi sayap sesuai siluet game.
 * - Jambul kepala: Jambul khas di belakang kepala sesuai siluet tampak samping.
 */

var C = {
    body     : [0.98, 0.82, 0.12],   // Kuning anak ayam cerah & hangat
    belly    : [1.00, 0.88, 0.24],   // Kuning sedikit lebih lembut/terang untuk perut depan
    crest    : [0.98, 0.80, 0.10],   // Kuning jambul kepala
    eye      : [0.02, 0.02, 0.02],   // Hitam pekat full
    beak     : [0.96, 0.78, 0.50],   // Oranye-peachy muda lembut (paruh bebek asli)
    jaw      : [0.80, 0.16, 0.24],   // Merah crimson rahang predator
    mouth    : [0.45, 0.12, 0.12],   // Interior mulut gelap kemerahan
    fang     : [0.98, 0.98, 0.90],   // Gading putih taring
    arm      : [0.98, 0.82, 0.12],   // Kuning sayap/lengan
    leg      : [0.94, 0.58, 0.12],   // Oranye kaki bebek
    foot     : [0.94, 0.60, 0.14],   // Oranye telapak kaki
    toe      : [0.92, 0.56, 0.12],   // Oranye jari
    tail     : [0.98, 0.82, 0.12],   // Kuning ekor
};

/**
 * Bangun seluruh scene graph karakter Apex Predator.
 * Mengembalikan objek berisi root dan referensi ke node animasi.
 */
function buildApexPredator(GL, prog, _pos, _col, _Mmat) {

    function mkNode() {
        return new SceneNode(GL, prog, _pos, _col, _Mmat);
    }
    function tx(node, x) { LIBS.translateX(node.POSITION_MATRIX, x); }
    function ty(node, y) { LIBS.translateY(node.POSITION_MATRIX, y); }
    function tz(node, z) { LIBS.translateZ(node.POSITION_MATRIX, z); }
    function pos(node, x, y, z) { tx(node,x); ty(node,y); tz(node,z); }
    function rx(node, a) { LIBS.rotateX(node.POSITION_MATRIX, a); }
    function ry(node, a) { LIBS.rotateY(node.POSITION_MATRIX, a); }
    function rz(node, a) { LIBS.rotateZ(node.POSITION_MATRIX, a); }

    // ══════════════════════════════════════════════════════════════
    //  1. BADAN (BODY) — Quadric: ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var body = mkNode();
    body.setGeometry(generateEllipsoid(0.96, 1.04, 0.90, 28, 40, C.body, 0.16, -0.10));
    ty(body, 0.15);

    // Perut buncit depan
    var belly = mkNode();
    belly.setGeometry(generateEllipsoid(0.74, 0.80, 0.52, 22, 32, C.belly));
    pos(belly, 0, -0.15, 0.44);

    // ══════════════════════════════════════════════════════════════
    //  2. KEPALA (HEAD) — Quadric: ELLIPSOID + CONE CREST
    // ══════════════════════════════════════════════════════════════
    var head = mkNode();
    // Kepala: bagian depan bulat untuk muka, belakang melengkung via Bezier
    // seperti siluet Apex Predator R.E.P.O. — punuk bulat organik di belakang
    // a=1.05 (lebar), b=1.02 (tinggi), c=1.00 (radius depan)
    // backBump=0.38 (seberapa jauh punuk belakang), bumpY=0.10 (sedikit naik)
    head.setGeometry(generateDuckHeadWithBezierBack(1.05, 1.02, 1.00, 32, 44, C.body, 0.38, 0.10));
    pos(head, 0, 1.42, 0.00);

    // ══════════════════════════════════════════════════════════════
    //  3a. PARUH BEBEK BIASA (MODE 1) — ELLIPTIC PARABOLOID
    //      Pose-nya diatur oleh setPredatorAmount(t)
    // ══════════════════════════════════════════════════════════════
    var beakUpper = mkNode();
    beakUpper.setGeometry(generateEllipticParaboloid(0.72, 0.22, 0.70, 16, 32, C.beak));

    var beakLower = mkNode();
    beakLower.setGeometry(generateEllipticParaboloid(0.62, 0.16, 0.62, 14, 28, C.beak));

    // Interior mulut (dark red) — hanya tampil saat mode predator
    var mouthInner = mkNode();
    mouthInner.setGeometry(generateEllipsoid(0.66, 0.36, 0.14, 16, 24, C.mouth));
    mouthInner.visible = false;
    pos(mouthInner, 0, -0.33, 0.90);

    // ══════════════════════════════════════════════════════════════
    //  3b. RAHANG PREDATOR (MODE 2)
    //      Elliptic Paraboloid (cangkang rahang) + CONE (gigi)
    //
    //      Tiap rahang = node "hinge" (engsel di sudut mulut)
    //        ├─ shell : paraboloid, ujung (tip) menghadap +Z (depan)
    //        └─ gigi  : cone-cone di tepi rahang, menghadap rahang lawan
    //
    //      Frame engsel: x = kanan, y = atas, z = depan.
    //      Titik di permukaan paraboloid (r = 0..rMax, th = sudut elips):
    //          x = a*r*cos(th),  y = b*r*sin(th),  z = D - r^2   (D = rMax^2)
    // ══════════════════════════════════════════════════════════════
    var JAW_OPEN_UP   = 0.40;   // rad, rahang atas terangkat
    var JAW_OPEN_DOWN = 0.50;   // rad, rahang bawah turun

    function buildJaw(isUpper) {
        var a    = isUpper ? 0.80 : 0.68;    // lebar
        var b    = isUpper ? 0.34 : 0.26;    // tebal
        var rMax = isUpper ? 0.95 : 0.85;    // panjang ~ rMax^2
        var D    = rMax * rMax;
        var dirY = isUpper ? -1 : 1;         // sisi gigi: atas -> bawah, bawah -> atas

        var hinge = mkNode();

        // Cangkang rahang
        var shell = mkNode();
        shell.setGeometry(generateEllipticParaboloid(a, b, rMax, 20, 36, C.jaw));
        pos(shell, 0, 0, D);
        rx(shell, -Math.PI / 2);             // sumbu paraboloid (+y) -> -z, tip jadi di depan
        hinge.children.push(shell);

        // Satu gigi (cone). Cone: pangkal di y=0, ujung di y=len.
        function addTooth(x, y, z, len, rad, side) {
            var t = mkNode();
            t.setGeometry(generateCone(rad, len, 8, C.fang));
            pos(t, x, y, z);
            if (isUpper) {                   // ujung ke bawah
                rx(t, Math.PI);
                rz(t, -side * 0.12);         // sedikit condong ke tengah
            } else {                         // ujung ke atas
                rz(t, side * 0.12);
            }
            hinge.children.push(t);
        }

        // Satu baris gigi di sepanjang rahang (kiri & kanan)
        function addRow(th, len, rad, zStart, zEnd, n) {
            for (var k = 0; k < n; k++) {
                var f = n > 1 ? k / (n - 1) : 0;
                var z = zStart + (zEnd - zStart) * f;
                var r = Math.sqrt(Math.max(D - z, 0.01));
                // gigi tengah lebih panjang, ke arah pangkal & ujung lebih pendek
                var l = len * (0.72 + 0.28 * Math.sin(Math.PI * (0.2 + 0.6 * f)));
                for (var s = -1; s <= 1; s += 2) {
                    var x = s * a * r * Math.cos(th);
                    var y = dirY * b * r * Math.sin(th) - dirY * 0.03; // tenggelam sedikit ke cangkang
                    addTooth(x, y, z, l, rad, s);
                }
            }
        }

        var zA   = 0.22;            // mulai di luar permukaan kepala
        var zB   = D - 0.16;        // berhenti sedikit sebelum ujung
        var n    = Math.max(3, Math.round((zB - zA) / 0.085) + 1);
        var half = (zB - zA) / (n - 1) * 0.5;

        // Baris luar (besar & panjang) + baris dalam (lebih kecil, selang-seling)
        addRow(0.30, isUpper ? 0.28 : 0.24, 0.048, zA,        zB,        n);
        addRow(0.95, isUpper ? 0.18 : 0.16, 0.040, zA + half, zB - half, n - 1);

        // Satu taring depan di ujung rahang
        var rf = Math.sqrt(0.06);
        addTooth(0, dirY * b * rf - dirY * 0.03, D - 0.06, isUpper ? 0.20 : 0.17, 0.05, 0);

        return { hinge: hinge };
    }

    var jawUpper = buildJaw(true);
    var jawLower = buildJaw(false);

    // ══════════════════════════════════════════════════════════════
    //  4. MATA (EYES) — Quadric: ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var eyeL = mkNode();
    eyeL.setGeometry(generateEllipsoid(0.40, 0.44, 0.36, 24, 32, C.eye));
    pos(eyeL, -0.54, 0.08, 0.70);
    ry(eyeL, -0.22);

    var eyeR = mkNode();
    eyeR.setGeometry(generateEllipsoid(0.40, 0.44, 0.36, 24, 32, C.eye));
    pos(eyeR, 0.54, 0.08, 0.70);
    ry(eyeR, 0.22);

    // ══════════════════════════════════════════════════════════════
    //  Transisi mode: t = 0 (paruh bebek biasa) .. 1 (mode predator)
    //  Semua pose dibangun ulang dari POSITION_MATRIX (identity dulu),
    //  jadi urutan pos() lalu rx() sama persis seperti kode sebelumnya.
    // ══════════════════════════════════════════════════════════════
    function lerp(p, q, t) { return p + (q - p) * t; }

    function setVisibleDeep(node, v) {
        node.visible = v;
        node.children.forEach(function (c) { setVisibleDeep(c, v); });
    }

    function setPredatorAmount(t) {
        // Paruh bebek lama: atas naik & miring ke atas, bawah turun & miring ke bawah
        LIBS.set_I4(beakUpper.POSITION_MATRIX);
        pos(beakUpper, 0, lerp(-0.22, 0.62, t), lerp(1.44, 1.00, t));
        rx(beakUpper, -Math.PI * 0.48 - 0.90 * t);

        LIBS.set_I4(beakLower.POSITION_MATRIX);
        pos(beakLower, 0, lerp(-0.36, -0.98, t), lerp(1.38, 1.12, t));
        rx(beakLower, -Math.PI * 0.48 + 0.70 * t);

        // Engsel rahang predator membuka (atas: rotasi -X, bawah: rotasi +X)
        LIBS.set_I4(jawUpper.hinge.POSITION_MATRIX);
        pos(jawUpper.hinge, 0, -0.16, 0.78);
        rx(jawUpper.hinge, -JAW_OPEN_UP * t);

        LIBS.set_I4(jawLower.hinge.POSITION_MATRIX);
        pos(jawLower.hinge, 0, -0.50, 0.78);
        rx(jawLower.hinge, JAW_OPEN_DOWN * t);

        // Paruh baru "muncul" begitu transisi dimulai
        var show = t > 0.05;
        setVisibleDeep(jawUpper.hinge, show);
        setVisibleDeep(jawLower.hinge, show);
        mouthInner.visible = show;
    }
    setPredatorAmount(0);   // state awal = mode 1

    // ── Susun hierarki kepala (eyeL & eyeR dari kode lama tetap dipakai) ──
    head.children.push(
        beakUpper, beakLower,
        jawUpper.hinge, jawLower.hinge,
        mouthInner,
        eyeL, eyeR
    );

    // ══════════════════════════════════════════════════════════════
    //  6. SAYAP  — Quadric: ELLIPTIC PARABOLOID
    //     Bentuk paraboloid pipih menyerupai sirip/sayap bebek kecil
    //     seperti referensi gambar: melengkung cekung ke depan,
    //     dibuka ke samping (rz ±π/2) lalu dimiringkan ke belakang-bawah.
    //     generateEllipticParaboloid(a, b, rMax, rings, segs, color):
    //       a  = lebar sayap (sumbu vertikal setelah rotasi)
    //       b  = tinggi sayap (sumbu maju-mundur setelah rotasi)
    //       rMax = seberapa besar/lebar sayap membuka
    // ══════════════════════════════════════════════════════════════

    // ── SAYAP KIRI ──
    var wingL = mkNode();
    // Paraboloid: base (rim lebar) menyentuh badan, tip lancip mengarah ke luar.
    // rMax=0.75 → base rim ~0.56 unit dari tip.
    // Node diposisikan di ujung luar (tip), base otomatis overlap ke badan.
    wingL.setGeometry(generateEllipticParaboloid(0.32, 0.20, 0.75, 14, 28, C.arm));
    pos(wingL, -1.46, 0.02, 0.00);   // tip di ujung kiri luar
    rz(wingL, -Math.PI / 2);          // buka ke +X (menuju badan) → base ke badan, tip ke luar ✓
    ry(wingL, -0.20);                  // sedikit miring ke belakang
    rx(wingL,  0.12);                  // sedikit ke bawah

    // ── SAYAP KANAN ──
    var wingR = mkNode();
    wingR.setGeometry(generateEllipticParaboloid(0.32, 0.20, 0.75, 14, 28, C.arm));
    pos(wingR,  1.46, 0.02, 0.00);   // tip di ujung kanan luar
    rz(wingR,  Math.PI / 2);          // buka ke -X (menuju badan) → base ke badan, tip ke luar ✓
    ry(wingR,  0.20);
    rx(wingR,  0.12);

    // ══════════════════════════════════════════════════════════════
    //  7. KAKI & TELAPAK — Quadric: CYLINDER + ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var legL = mkNode();
    legL.setGeometry(generateCylinder(0.16, 0.75, 16, C.leg));
    pos(legL, -0.34, -1.52, 0.05);

    var footL = mkNode();
    footL.setGeometry(generateEllipsoid(0.28, 0.08, 0.40, 10, 18, C.foot));
    pos(footL, 0, -0.04, 0.16);

    var toeL1 = mkNode();
    toeL1.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeL1, -0.18, 0, 0.30);
    ry(toeL1, -0.22);

    var toeL2 = mkNode();
    toeL2.setGeometry(generateEllipsoid(0.10, 0.07, 0.28, 8, 12, C.toe));
    pos(toeL2, 0, 0, 0.35);

    var toeL3 = mkNode();
    toeL3.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeL3, 0.18, 0, 0.30);
    ry(toeL3, 0.22);

    footL.children.push(toeL1, toeL2, toeL3);
    legL.children.push(footL);

    var legR = mkNode();
    legR.setGeometry(generateCylinder(0.16, 0.75, 16, C.leg));
    pos(legR, 0.34, -1.52, 0.05);

    var footR = mkNode();
    footR.setGeometry(generateEllipsoid(0.28, 0.08, 0.40, 10, 18, C.foot));
    pos(footR, 0, -0.04, 0.16);

    var toeR1 = mkNode();
    toeR1.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeR1, -0.18, 0, 0.30);
    ry(toeR1, -0.22);

    var toeR2 = mkNode();
    toeR2.setGeometry(generateEllipsoid(0.10, 0.07, 0.28, 8, 12, C.toe));
    pos(toeR2, 0, 0, 0.35);

    var toeR3 = mkNode();
    toeR3.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeR3, 0.18, 0, 0.30);
    ry(toeR3, 0.22);

    footR.children.push(toeR1, toeR2, toeR3);
    legR.children.push(footR);

    // ══════════════════════════════════════════════════════════════
    //  8. EKOR & BADAN BELAKANG (TAIL) — SYARAT: KURVA 3D BEZIER
    //     Dibuat BESAR, TEBAL, & MONTOK (menyelimuti seluruh pantat belakang badan)
    //     sehingga tampak benar-benar menyatu dengan badan sebagai satu siluet utuh,
    //     menggunakan 2 Kurva Bezier 3D (dorsal & ventral) sesuai sketsa & figurine.
    // ══════════════════════════════════════════════════════════════
    var tail = mkNode();
    tail.setGeometry(generateBezierDuckTail(
        // Kurva punggung atas (dorsal): dari punggung atas mengalir mulus ke belakang lalu menjentik ke atas
        [
            [0,  0.62, -0.62],  // P0: tertanam di punggung atas badan
            [0,  0.40, -1.15],  // P1: melandai tebal mengikuti punggung
            [0,  0.45, -1.48],  // P2: transisi lentur menyapu ke atas
            [0,  0.62, -1.68]   // P3: puncak ekor menjentik runcing anggun
        ],
        // Kurva bawah pantat (ventral): dari panggul bawah tepat di belakang kaki menyapu naik tebal
        [
            [0, -0.84, -0.42],  // Q0: tertanam di dasar panggul belakang kaki
            [0, -0.75, -1.05],  // Q1: pantat bawah montok tebal
            [0, -0.20, -1.48],  // Q2: melengkung naik dengan tebal
            [0,  0.54, -1.68]   // Q3: bertemu di ujung ekor menjentik runcing
        ],
        0.94,   // baseWidth (lebar montok 0.94 membungkus penuh kontur samping badan)
        0.08,   // tipWidth  (ujung ekor menjentik runcing rapi sesuai sketsa user & figurine)
        32,     // segments
        28,     // slices
        C.tail
    ));
    pos(tail, 0, 0, 0);

    // ══════════════════════════════════════════════════════════════
    //  RAKIT SELURUH HIERARKI
    // ══════════════════════════════════════════════════════════════
    body.children.push(belly, head, wingL, wingR, legL, legR, tail);

    return {
        root              : body,
        head              : head,
        beakUpper         : beakUpper,
        beakLower         : beakLower,
        jawUpper          : jawUpper.hinge,
        jawLower          : jawLower.hinge,
        mouthInner        : mouthInner,
        setPredatorAmount : setPredatorAmount,
        wingL             : wingL,
        wingR             : wingR,
        legL              : legL,
        legR              : legR,
        tail              : tail
    };
}



// =========================================================================

// 4. MAIN WEBGL APPLICATION & INTERACTIVE VIEWER

// =========================================================================

/**
 * main.js  –  Apex Predator Model Viewer
 * Kontrol:
 *   Mouse drag  → orbit kamera
 *   Scroll      → zoom
 *   Space       → toggle taring
 */

function main() {
    /** @type {HTMLCanvasElement} */
    var CANVAS = document.getElementById('mycanvas');
    CANVAS.width  = window.innerWidth;
    CANVAS.height = window.innerHeight;

    window.addEventListener('resize', function () {
        CANVAS.width  = window.innerWidth;
        CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(45, CANVAS.width / CANVAS.height, 0.1, 100);
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
    });

    /** @type {WebGLRenderingContext} */
    var GL;
    try {
        GL = CANVAS.getContext('webgl', { antialias: true });
    } catch (e) { alert('WebGL error'); return; }
    if (!GL) { alert('WebGL tidak didukung'); return; }

    // ─── SHADERS ───
    var vsSource = `
        attribute vec3 position;
        attribute vec3 color;
        uniform mat4 Pmatrix, Vmatrix, Mmatrix;
        varying vec3 vColor;
        void main(void) {
            gl_Position = Pmatrix * Vmatrix * Mmatrix * vec4(position, 1.0);
            vColor = color;
        }
    `;
    var fsSource = `
        precision mediump float;
        varying vec3 vColor;
        void main(void) {
            gl_FragColor = vec4(vColor, 1.0);
        }
    `;

    function compileShader(src, type) {
        var sh = GL.createShader(type);
        GL.shaderSource(sh, src);
        GL.compileShader(sh);
        if (!GL.getShaderParameter(sh, GL.COMPILE_STATUS)) {
            alert('Shader error: ' + GL.getShaderInfoLog(sh)); return null;
        }
        return sh;
    }

    var PROG = GL.createProgram();
    GL.attachShader(PROG, compileShader(vsSource, GL.VERTEX_SHADER));
    GL.attachShader(PROG, compileShader(fsSource, GL.FRAGMENT_SHADER));
    GL.linkProgram(PROG);
    GL.useProgram(PROG);

    var _pos  = GL.getAttribLocation(PROG, 'position');
    var _col  = GL.getAttribLocation(PROG, 'color');
    var _Pmat = GL.getUniformLocation(PROG, 'Pmatrix');
    var _Vmat = GL.getUniformLocation(PROG, 'Vmatrix');
    var _Mmat = GL.getUniformLocation(PROG, 'Mmatrix');

    GL.enableVertexAttribArray(_pos);
    GL.enableVertexAttribArray(_col);

    // ─── MODEL ───
    var model = buildApexPredator(GL, PROG, _pos, _col, _Mmat);
    var root  = model.root;
    root.setup();

    // ─── KAMERA ORBIT ───
    var THETA    = -0.65;     // rotasi Y (sudut 3/4 depan-kiri memperlihatkan wajah, sayap ber-3 jari, & ekor)
    var PHI      = -0.06;     // rotasi X
    var CAM_DIST =  7.0;
    var FRICTION =  0.88;
    var dTheta   = 0, dPhi = 0;
    // Target kamera sedikit ke atas (badan dinaikkan 0.2)
    var CAM_TARGET_Y = 0.5;
    var PROJMATRIX = LIBS.get_projection(42, CANVAS.width / CANVAS.height, 0.1, 100);

    function normalize(v) {
        var l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        return l < 1e-8 ? [0,1,0] : [v[0]/l, v[1]/l, v[2]/l];
    }
    function cross(a, b) {
        return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    }
    function buildViewMatrix() {
        var camX = CAM_DIST * Math.sin(THETA) * Math.cos(PHI);
        var camY = CAM_DIST * Math.sin(PHI) + CAM_TARGET_Y;
        var camZ = CAM_DIST * Math.cos(THETA) * Math.cos(PHI);
        // Look toward target (0, CAM_TARGET_Y, 0)
        var fwd   = normalize([-camX, CAM_TARGET_Y - camY, -camZ]);
        var right = normalize(cross(fwd, [0,1,0]));
        var up    = cross(right, fwd);
        var vm = [
            right[0],    right[1],    right[2],    0,
            up[0],       up[1],       up[2],       0,
           -fwd[0],     -fwd[1],     -fwd[2],      0,
            0,           0,           0,            1
        ];
        vm[12] = -(right[0]*camX + right[1]*camY + right[2]*camZ);
        vm[13] = -(up[0]*camX    + up[1]*camY    + up[2]*camZ);
        vm[14] =   fwd[0]*camX   + fwd[1]*camY   + fwd[2]*camZ;
        return vm;
    }

    // ─── MOUSE ───
    var drag = false, xPrev = 0, yPrev = 0;
    CANVAS.addEventListener('mousedown', function(e) {
        drag=true; xPrev=e.clientX; yPrev=e.clientY;
    });
    window.addEventListener('mouseup', function() { drag=false; });
    window.addEventListener('mousemove', function(e) {
        if (!drag) return;
        dTheta = (e.clientX - xPrev) * 0.005;
        dPhi   = (e.clientY - yPrev) * 0.005;
        THETA += dTheta; PHI += dPhi;
        PHI = Math.max(-1.4, Math.min(1.4, PHI));
        xPrev = e.clientX; yPrev = e.clientY;
    });
    CANVAS.addEventListener('wheel', function(e) {
        CAM_DIST += e.deltaY * 0.01;
        CAM_DIST = Math.max(2.5, Math.min(20, CAM_DIST));
        e.preventDefault();
    }, { passive: false });

    // ─── TOUCH ───
    var touches = {};
    CANVAS.addEventListener('touchstart', function(e) {
        e.preventDefault();
        for (var t of e.changedTouches) touches[t.identifier]={x:t.clientX,y:t.clientY};
    }, {passive:false});
    CANVAS.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (e.touches.length===1) {
            var t=e.changedTouches[0], p=touches[t.identifier];
            if (!p) return;
            dTheta=(t.clientX-p.x)*0.005; dPhi=(t.clientY-p.y)*0.005;
            THETA+=dTheta; PHI+=dPhi;
            PHI=Math.max(-1.4,Math.min(1.4,PHI));
            touches[t.identifier]={x:t.clientX,y:t.clientY};
        } else if (e.touches.length===2) {
            var t0=e.touches[0],t1=e.touches[1];
            var d=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
            if (touches._pd) CAM_DIST-=(d-touches._pd)*0.02;
            touches._pd=d;
            CAM_DIST=Math.max(2.5,Math.min(20,CAM_DIST));
        }
    }, {passive:false});
    CANVAS.addEventListener('touchend', function(e) {
        for (var t of e.changedTouches) delete touches[t.identifier];
        if (e.touches.length<2) delete touches._pd;
    });

    // ─── SPACE → toggle mode Predator ───
    var predatorOn  = false;
    var predatorAmt = 0;      // 0..1, dianimasikan halus di render loop
    window.addEventListener('keydown', function (e) {
        if (e.code === 'Space') {
            predatorOn = !predatorOn;
            e.preventDefault();
        }
    });

    // ─── GL STATE ───
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearColor(0.08, 0.08, 0.12, 1.0);
    GL.clearDepth(1.0);

    // ─── RENDER LOOP ───
    var animate = function(time) {
        // Inersia kamera
        if (!drag) {
            dTheta *= FRICTION; dPhi *= FRICTION;
            THETA += dTheta; PHI += dPhi;
            PHI = Math.max(-1.4, Math.min(1.4, PHI));
        }

        // Transisi halus antara mode 1 <-> mode 2
        var predTarget = predatorOn ? 1 : 0;
        if (predatorAmt !== predTarget) {
            predatorAmt += (predTarget - predatorAmt) * 0.12;
            if (Math.abs(predTarget - predatorAmt) < 0.003) predatorAmt = predTarget;
            model.setPredatorAmount(predatorAmt);
        }

        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        GL.uniformMatrix4fv(_Pmat, false, PROJMATRIX);
        GL.uniformMatrix4fv(_Vmat, false, buildViewMatrix());

        root.render(LIBS.get_I4());

        GL.flush();
        window.requestAnimationFrame(animate);
    };
    animate(0);
}

window.addEventListener('load', main);