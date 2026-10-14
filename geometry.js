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
