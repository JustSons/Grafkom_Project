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
