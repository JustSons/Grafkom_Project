var LIBS = {
    degToRad: function (angle) {
        return (angle * Math.PI / 180);
    },

    get_projection: function (angle, a, zMin, zMax) {
        var tan = Math.tan(LIBS.degToRad(0.5 * angle)),
            A = -(zMax + zMin) / (zMax - zMin),
            B = (-2 * zMax * zMin) / (zMax - zMin);
        return [
            0.5 / tan, 0, 0, 0,
            0, 0.5 * a / tan, 0, 0,
            0, 0, A, -1,
            0, 0, B, 0
        ];
    },

    get_I4: function () {
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    },

    set_I4: function (m) {
        m[0]=1;m[1]=0;m[2]=0;m[3]=0;
        m[4]=0;m[5]=1;m[6]=0;m[7]=0;
        m[8]=0;m[9]=0;m[10]=1;m[11]=0;
        m[12]=0;m[13]=0;m[14]=0;m[15]=1;
    },

    rotateX: function (m, angle) {
        var c=Math.cos(angle),s=Math.sin(angle);
        var mv1=m[1],mv5=m[5],mv9=m[9];
        m[1]=m[1]*c-m[2]*s; m[5]=m[5]*c-m[6]*s; m[9]=m[9]*c-m[10]*s;
        m[2]=m[2]*c+mv1*s;  m[6]=m[6]*c+mv5*s;  m[10]=m[10]*c+mv9*s;
    },

    rotateY: function (m, angle) {
        var c=Math.cos(angle),s=Math.sin(angle);
        var mv0=m[0],mv4=m[4],mv8=m[8];
        m[0]=c*m[0]+s*m[2]; m[4]=c*m[4]+s*m[6]; m[8]=c*m[8]+s*m[10];
        m[2]=c*m[2]-s*mv0;  m[6]=c*m[6]-s*mv4;  m[10]=c*m[10]-s*mv8;
    },

    rotateZ: function (m, angle) {
        var c=Math.cos(angle),s=Math.sin(angle);
        var mv0=m[0],mv4=m[4],mv8=m[8];
        m[0]=c*m[0]-s*m[1]; m[4]=c*m[4]-s*m[5]; m[8]=c*m[8]-s*m[9];
        m[1]=c*m[1]+s*mv0;  m[5]=c*m[5]+s*mv4;  m[9]=c*m[9]+s*mv8;
    },

    translateX: function(m,t){m[12]+=t;},
    translateY: function(m,t){m[13]+=t;},
    translateZ: function(m,t){m[14]+=t;},
    set_position: function(m,x,y,z){m[12]=x;m[13]=y;m[14]=z;},
    scaleX: function(m,t){m[0]*=t;},
    scaleY: function(m,t){m[5]*=t;},
    scaleZ: function(m,t){m[10]*=t;},

    multiply: function (m1, m2) {
        var rm = new Float32Array(16);
        for (var c = 0; c < 4; c++)
            for (var r = 0; r < 4; r++) {
                var sum = 0;
                for (var k = 0; k < 4; k++)
                    sum += m1[k * 4 + r] * m2[c * 4 + k];
                rm[c * 4 + r] = sum;
            }
        return rm;
    },

    makeScale: function(sx,sy,sz){
        return [sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1];
    },

    makeTranslation: function(tx,ty,tz){
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1];
    },

    makeRotationY: function(a){
        var c=Math.cos(a),s=Math.sin(a);
        return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
    },

    makeRotationX: function(a){
        var c=Math.cos(a),s=Math.sin(a);
        return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
    },

    makeRotationZ: function(a){
        var c=Math.cos(a),s=Math.sin(a);
        return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];
    },

    /**
     * Matriks rotasi 4x4 terhadap Sumbu Sembarang (Arbitrary Axis)
     * Menggunakan formula rotasi Rodrigues pada unit vektor (x, y, z)
     */
    makeRotationAxis: function(x, y, z, angle) {
        var len = Math.sqrt(x*x + y*y + z*z);
        if (len < 1e-6) return this.get_I4();
        x /= len; y /= len; z /= len;
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        var t = 1 - c;
        return [
            t*x*x + c,      t*x*y + s*z,    t*x*z - s*y,    0,
            t*x*y - s*z,    t*y*y + c,      t*y*z + s*x,    0,
            t*x*z + s*y,    t*y*z - s*x,    t*z*z + c,      0,
            0,              0,              0,              1
        ];
    },

    rotateAxis: function (m, x, y, z, angle) {
        var r = this.makeRotationAxis(x, y, z, angle);
        var res = this.multiply(m, r);
        for (var i = 0; i < 16; i++) m[i] = res[i];
    },

    /**
     * Matriks transformasi lengkap dengan Pivot Point:
     * Menjamin bagian tubuh tetap INTACT pada engsel (pivot) tanpa putus/copot.
     * v' = T(P + T) * R * S * T(-P) * v
     */
    makePivotTransform: function(px, py, pz, rx, ry, rz, sx, sy, sz, tx, ty, tz) {
        sx = (sx !== undefined) ? sx : 1;
        sy = (sy !== undefined) ? sy : 1;
        sz = (sz !== undefined) ? sz : 1;
        tx = tx || 0; ty = ty || 0; tz = tz || 0;
        rx = rx || 0; ry = ry || 0; rz = rz || 0;

        var cx = Math.cos(rx), sx_ang = Math.sin(rx);
        var cy = Math.cos(ry), sy_ang = Math.sin(ry);
        var cz = Math.cos(rz), sz_ang = Math.sin(rz);

        // R = Rz * Ry * Rx
        var r00 = cz*cy,              r01 = cz*sy_ang*sx_ang - sz_ang*cx,  r02 = cz*sy_ang*cx + sz_ang*sx_ang;
        var r10 = sz_ang*cy,          r11 = sz_ang*sy_ang*sx_ang + cz*cx,  r12 = sz_ang*sy_ang*cx - cz*sx_ang;
        var r20 = -sy_ang,            r21 = cy*sx_ang,                     r22 = cy*cx;

        // Gabungkan skala (M = R * S)
        var m00 = r00 * sx, m01 = r01 * sy, m02 = r02 * sz;
        var m10 = r10 * sx, m11 = r11 * sy, m12 = r12 * sz;
        var m20 = r20 * sx, m21 = r21 * sy, m22 = r22 * sz;

        // Translasi pivot: v' = M*(v - P) + P + T = M*v + (P + T - M*P)
        var txFinal = px + tx - (m00*px + m01*py + m02*pz);
        var tyFinal = py + ty - (m10*px + m11*py + m12*pz);
        var tzFinal = pz + tz - (m20*px + m21*py + m22*pz);

        return [
            m00, m10, m20, 0,
            m01, m11, m21, 0,
            m02, m12, m22, 0,
            txFinal, tyFinal, tzFinal, 1
        ];
    },

    /**
     * Matriks transformasi dengan Pivot Point & Rotasi Sumbu Sembarang (Arbitrary Axis):
     * Memutar objek mengelilingi sumbu sembarang (ax, ay, az) dengan pusat di pivot (px, py, pz).
     */
    makePivotTransformAxis: function(px, py, pz, ax, ay, az, angle, sx, sy, sz, tx, ty, tz) {
        sx = (sx !== undefined) ? sx : 1;
        sy = (sy !== undefined) ? sy : 1;
        sz = (sz !== undefined) ? sz : 1;
        tx = tx || 0; ty = ty || 0; tz = tz || 0;

        var len = Math.sqrt(ax*ax + ay*ay + az*az);
        if (len < 1e-6) return this.get_I4();
        var x = ax / len, y = ay / len, z = az / len;

        var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;

        var r00 = t*x*x + c,   r01 = t*x*y - s*z, r02 = t*x*z + s*y;
        var r10 = t*x*y + s*z, r11 = t*y*y + c,   r12 = t*y*z - s*x;
        var r20 = t*x*z - s*y, r21 = t*y*z + s*x, r22 = t*z*z + c;

        var m00 = r00 * sx, m01 = r01 * sy, m02 = r02 * sz;
        var m10 = r10 * sx, m11 = r11 * sy, m12 = r12 * sz;
        var m20 = r20 * sx, m21 = r21 * sy, m22 = r22 * sz;

        var txFinal = px + tx - (m00*px + m01*py + m02*pz);
        var tyFinal = py + ty - (m10*px + m11*py + m12*pz);
        var tzFinal = pz + tz - (m20*px + m21*py + m22*pz);

        return [
            m00, m10, m20, 0,
            m01, m11, m21, 0,
            m02, m12, m22, 0,
            txFinal, tyFinal, tzFinal, 1
        ];
    },

    copy: function(m){ return m.slice(); },

    identity: function() {
        return new Float32Array(LIBS.get_I4());
    },

    mul: function(a, b) {
        return LIBS.multiply(a, b);
    },

    chain: function() {
        var matrices = Array.prototype.slice.call(arguments);
        return matrices.reduce(function(result, matrix) {
            return LIBS.multiply(result, matrix);
        });
    },

    translation: function(x, y, z) {
        return new Float32Array(LIBS.makeTranslation(x, y, z));
    },

    scaling: function(x, y, z) {
        return new Float32Array(LIBS.makeScale(x, y, z));
    },

    rotX: function(angle) {
        return new Float32Array(LIBS.makeRotationX(angle));
    },

    rotY: function(angle) {
        return new Float32Array(LIBS.makeRotationY(angle));
    },

    rotZ: function(angle) {
        return new Float32Array(LIBS.makeRotationZ(angle));
    },

    pivot: function(px, py, pz, rx, ry, rz, sx, sy, sz, tx, ty, tz) {
        return new Float32Array(LIBS.makePivotTransform(px, py, pz, rx, ry, rz, sx, sy, sz, tx, ty, tz));
    },

    pivotAxis: function(px, py, pz, ax, ay, az, angle, sx, sy, sz, tx, ty, tz) {
        return new Float32Array(LIBS.makePivotTransformAxis(px, py, pz, ax, ay, az, angle, sx, sy, sz, tx, ty, tz));
    },

    perspective: function(fov, aspect, near, far) {
        var f = 1 / Math.tan(fov / 2);
        var matrix = new Float32Array(16);
        matrix[0] = f / aspect;
        matrix[5] = f;
        matrix[10] = (far + near) / (near - far);
        matrix[11] = -1;
        matrix[14] = 2 * far * near / (near - far);
        return matrix;
    },

    lookAt: function(eye, target, up) {
        var normalize = function(v) {
            var length = Math.hypot(v[0], v[1], v[2]) || 1;
            return [v[0] / length, v[1] / length, v[2] / length];
        };
        var cross = function(a, b) {
            return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        };
        var forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
        var side = normalize(cross(forward, up));
        var vertical = cross(side, forward);
        var matrix = LIBS.identity();
        matrix[0] = side[0]; matrix[4] = side[1]; matrix[8] = side[2];
        matrix[1] = vertical[0]; matrix[5] = vertical[1]; matrix[9] = vertical[2];
        matrix[2] = -forward[0]; matrix[6] = -forward[1]; matrix[10] = -forward[2];
        matrix[12] = -(side[0] * eye[0] + side[1] * eye[1] + side[2] * eye[2]);
        matrix[13] = -(vertical[0] * eye[0] + vertical[1] * eye[1] + vertical[2] * eye[2]);
        matrix[14] = forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2];
        return matrix;
    }
};
