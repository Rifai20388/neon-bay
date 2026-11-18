// Keyboard + mouse input for Neon Bay. Pointer lock gives the mouse-look;
// the keys set is the single source of truth for what is held down.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    clicked: false,
    // One-shot actions, set by the keydown handler and cleared by the game
    // loop after it has read them.
    pressed: new Set(),
    attach() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        keys.add(e.code);
        input.pressed.add(e.code);
        // Keep the page from scrolling on game keys.
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => keys.delete(e.code));
      window.addEventListener('blur', () => keys.clear());
      document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
          input.mouseDX += e.movementX || 0;
          input.mouseDY += e.movementY || 0;
        }
      });
      document.addEventListener('pointerlockchange', () => {
        input.locked = document.pointerLockElement === canvas;
      });
      canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock();
        }
      });
      // A press while locked is a shot; mousedown fires before the frame
      // reads it, so one press is exactly one shot.
      canvas.addEventListener('mousedown', () => {
        if (document.pointerLockElement === canvas) input.clicked = true;
      });
    },
    lock() {
      if (document.pointerLockElement !== canvas) {
        // Pointer lock needs a user gesture; without one (screenshot mode)
        // the request rejects, which is fine — swallow it.
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          /* no gesture yet */
        }
      }
    },
    unlock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    // Read and clear the mouse deltas for this frame.
    takeMouse() {
      const dx = input.mouseDX;
      const dy = input.mouseDY;
      input.mouseDX = 0;
      input.mouseDY = 0;
      return { dx, dy };
    },
    // True once for the frame the key went down (use for E, F, P, M, R, T).
    wasPressed(code) {
      return input.pressed.has(code);
    },
    // True once for the frame the locked canvas was clicked.
    takeClick() {
      const c = input.clicked;
      input.clicked = false;
      return c;
    },
    endFrame() {
      input.pressed.clear();
    },
  };
  return input;
}
