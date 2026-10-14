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
