function createParaboloid(radius, height, segments) {
    let vertices = [];
    // v = iterasi vertikal, u = iterasi horizontal (melingkar)
    for (let i = 0; i <= segments; i++) {
        let v = i / segments; 
        let r = v * radius; 
        let y = -height * (v * v); // Persamaan paraboloid: y berbanding lurus dengan kuadrat radius
        
        for (let j = 0; j <= segments; j++) {
            let u = j / segments;
            let theta = u * 2 * Math.PI;
            
            let x = r * Math.cos(theta);
            let z = r * Math.sin(theta);
            
            vertices.push(x, y, z);
        }
    }
    return vertices;
}

function createCylinder(radius, height, segments) {
    let vertices = [];
    for (let i = 0; i <= segments; i++) {
        let y = (i / segments) * height - (height / 2); // Pusatkan di sumbu Y
        
        for (let j = 0; j <= segments; j++) {
            let theta = (j / segments) * 2 * Math.PI;
            let x = radius * Math.cos(theta);
            let z = radius * Math.sin(theta);
            
            vertices.push(x, y, z);
        }
    }
    return vertices;
}

function createCone(radius, height, segments) {
    let vertices = [];
    for (let i = 0; i <= segments; i++) {
        let v = i / segments;
        let y = v * height - (height / 2);
        let currentRadius = radius * (1 - v); // Radius menyempit seiring naiknya y
        
        for (let j = 0; j <= segments; j++) {
            let theta = (j / segments) * 2 * Math.PI;
            let x = currentRadius * Math.cos(theta);
            let z = currentRadius * Math.sin(theta);
            
            vertices.push(x, y, z);
        }
    }
    return vertices;
}

function createSphere(radius, segments) {
    let vertices = [];
    for (let i = 0; i <= segments; i++) {
        let lat = Math.PI * (i / segments) - Math.PI / 2; // -90 derajat ke 90 derajat
        let y = radius * Math.sin(lat);
        let r = radius * Math.cos(lat);
        
        for (let j = 0; j <= segments; j++) {
            let lon = 2 * Math.PI * (j / segments);
            let x = r * Math.cos(lon);
            let z = r * Math.sin(lon);
            
            vertices.push(x, y, z);
        }
    }
    return vertices;
}

function evaluateCubicBezier3D(t, p0, p1, p2, p3) {
    let u = 1 - t;
    let tt = t * t;
    let uu = u * u;
    let uuu = uu * u;
    let ttt = tt * t;

    // Rumus interpolasi polinomial Bernstein
    let x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
    let y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
    let z = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
    
    return [x, y, z];
}

function createBezierSpine(p0, p1, p2, p3, segments) {
    let vertices = [];
    for (let i = 0; i <= segments; i++) {
        let t = i / segments;
        let point = evaluateCubicBezier3D(t, p0, p1, p2, p3);
        vertices.push(...point);
    }
    return vertices; // Output berupa tulang punggung garis lengkung telinga
}

/* =====================================================================
   TAMBAHAN (fungsi bawaan di atas tidak diubah)
   Semua fungsi create* menghasilkan grid titik (baris x kolom) tanpa indeks
   dan tanpa normal, jadi belum bisa digambar dengan pencahayaan.
   ===================================================================== */

// Indeks segitiga untuk grid titik (rows x cols), urutan baris demi baris.
// Dipakai untuk semua hasil create* (rows = cols = segments + 1).
function createGridIndices(rows, cols) {
    let indices = [];
    for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
            let a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    return indices;
}

// Normal halus (smooth) tiap titik. Titik dengan posisi sama (sambungan
// melingkar dan kutub puncak) digabung supaya tidak ada garis jahitan.
function computeNormals(v, idx) {
    let n = new Array(v.length).fill(0), acc = {};
    let key = i => Math.round(v[3*i]*1e4) + ',' + Math.round(v[3*i+1]*1e4) + ',' + Math.round(v[3*i+2]*1e4);
    for (let t = 0; t < idx.length; t += 3) {
        let a = idx[t], b = idx[t+1], c = idx[t+2];
        let ux = v[3*b]-v[3*a], uy = v[3*b+1]-v[3*a+1], uz = v[3*b+2]-v[3*a+2];
        let wx = v[3*c]-v[3*a], wy = v[3*c+1]-v[3*a+1], wz = v[3*c+2]-v[3*a+2];
        let fx = uy*wz - uz*wy, fy = uz*wx - ux*wz, fz = ux*wy - uy*wx; // luas segitiga ikut berbobot
        for (let i of [a, b, c]) {
            let s = acc[key(i)] || (acc[key(i)] = [0, 0, 0]);
            s[0] += fx; s[1] += fy; s[2] += fz;
        }
    }
    for (let i = 0; i < v.length / 3; i++) {
        let s = acc[key(i)], l = Math.hypot(s[0], s[1], s[2]);
        if (l < 1e-12) { n[3*i+1] = 1; continue; }
        n[3*i] = s[0]/l; n[3*i+1] = s[1]/l; n[3*i+2] = s[2]/l;
    }
    return n;
}

// Tabung yang mengikuti kurva Bezier kubik 3D (untuk telinga kelinci).
// Penampang berupa elips: radiusFn(t) -> [lebar, tebal], t = 0 (pangkal) .. 1 (ujung).
// Hasil: grid (segments+1) x (ringSegments+1), indeks pakai createGridIndices.
function createBezierTube(p0, p1, p2, p3, segments, ringSegments, radiusFn) {
    let vertices = [];
    let norm = a => { let l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
    let cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    for (let i = 0; i <= segments; i++) {
        let t = i / segments;
        let P = evaluateCubicBezier3D(t, p0, p1, p2, p3);
        let A = evaluateCubicBezier3D(Math.max(0, t - 0.01), p0, p1, p2, p3);
        let B = evaluateCubicBezier3D(Math.min(1, t + 0.01), p0, p1, p2, p3);
        let T = norm([B[0]-A[0], B[1]-A[1], B[2]-A[2]]);           // arah kurva
        let N = cross(T, [0, 0, 1]);                                // arah lebar telinga
        if (Math.hypot(N[0], N[1], N[2]) < 1e-3) N = cross(T, [1, 0, 0]);
        N = norm(N);
        let Bn = cross(T, N);                                       // arah tebal telinga
        let [w, h] = radiusFn(t);
        for (let j = 0; j <= ringSegments; j++) {
            let a = 2 * Math.PI * j / ringSegments;
            let c = Math.cos(a) * w, s = Math.sin(a) * h;
            vertices.push(P[0] + N[0]*c + Bn[0]*s, P[1] + N[1]*c + Bn[1]*s, P[2] + N[2]*c + Bn[2]*s);
        }
    }
    return vertices;
}