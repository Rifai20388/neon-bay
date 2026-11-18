// Keyboard and mouse input for Neon Bay. WASD moves and drives, the mouse
// orbits the camera under pointer lock, click shoots, E interacts.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.prevKeys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
    this.locked = false;
    this.canvas = canvas;
    this.onFirstGesture = null;
    this._gestured = false;
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this._gesture();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clicked = true;
      this._gesture();
      if (!this.locked) canvas.requestPointerLock();
    });
  }

  _gesture() {
    if (!this._gestured) {
      this._gestured = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  down(code) { return !!this.keys[code]; }

  // True only on the frame the key went down. Call endFrame() once per tick.
  pressed(code) { return !!this.keys[code] && !this.prevKeys[code]; }

  endFrame() { this.prevKeys = { ...this.keys }; }

  // WASD or arrows as -1/0/1 axes.
  axes() {
    const f = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
      - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const r = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
      - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { forward: f, right: r };
  }

  // Consume the accumulated mouse delta for this frame.
  takeMouse() {
    const dx = this.mouseDX; const dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}
