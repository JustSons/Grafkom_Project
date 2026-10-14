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
    var THETA    =  0.25;     // rotasi Y
    var PHI      = -0.10;     // rotasi X (sedikit melihat dari atas)
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

    // ─── SPACE → toggle taring ───
    window.addEventListener('keydown', function(e) {
        if (e.code==='Space') {
            var v = !model.fangUL.visible;
            model.fangUL.visible = v;
            model.fangUR.visible = v;
            model.fangLL.visible = v;
            model.fangLR.visible = v;
            model.mouthInner.visible = v;
            // Geser paruh bawah saat mulut terbuka
            if (v) {
                LIBS.set_I4(model.beakLower.MOVE_MATRIX);
                LIBS.translateY(model.beakLower.MOVE_MATRIX, -0.15);
            } else {
                LIBS.set_I4(model.beakLower.MOVE_MATRIX);
            }
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
