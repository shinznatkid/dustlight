import * as THREE from 'three';

// Routes pointer / wheel / keys to the active tool (src/tools/*). Camera:
// right-drag orbits, middle-drag pans, wheel zooms (unless the tool wants the
// wheel, e.g. to turn held furniture). Left button belongs to the tool — a
// click (< 5 px of movement) is told apart from a drag. Right *click* asks the
// tool to cancel; with nothing to cancel it switches a lamp / the fire.
// `active()` gates everything so menus and photo mode get a quiet canvas.
export function setupInput(world, { active, tool, onPause, onPhoto, onToolKey, onSound = () => {}, onChange = () => {} }) {
  const { renderer, controls } = world;
  const el = renderer.domElement;
  const ndc = new THREE.Vector2();
  const setNdc = (e) => ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  let hoverDirty = false;
  let leftDown = null;
  let rightDown = null;

  function sync() {
    const t = tool();
    controls.enableZoom = !t?.wantsWheel;
    hoverDirty = true;
    onChange();
  }

  // play mode: tools own the left button, the camera orbits on the right
  function playButtons(on) {
    controls.mouseButtons = on
      ? { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  }

  // handled keys are marked (preventDefault) so the next screen's listener
  // doesn't act on the same press — P opens photo mode, and photo mode's P closes it
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.defaultPrevented || !active()) return;
    const t = tool();
    if (t?.key?.(e)) {
      e.preventDefault();
      sync();
      return;
    }
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') onPause();
    else if (k === 'p') onPhoto();
    else if (/^[1-9]$/.test(e.key) && onToolKey?.(+e.key - 1)) { /* switched */ } else return;
    e.preventDefault();
    sync();
  });

  el.addEventListener('pointerdown', (e) => {
    if (!active() || !world.ready) return;
    setNdc(e);
    if (e.button === 0) {
      leftDown = [e.clientX, e.clientY];
      el.setPointerCapture?.(e.pointerId);
      tool()?.down?.(ndc, e);
      sync();
    } else if (e.button === 2) rightDown = [e.clientX, e.clientY];
  });
  el.addEventListener('pointerup', (e) => {
    setNdc(e);
    if (e.button === 0 && leftDown) {
      const click = Math.hypot(e.clientX - leftDown[0], e.clientY - leftDown[1]) <= 5;
      leftDown = null;
      if (active()) tool()?.up?.(ndc, { click });
      sync();
    } else if (e.button === 2 && rightDown) {
      const click = Math.hypot(e.clientX - rightDown[0], e.clientY - rightDown[1]) <= 5;
      rightDown = null;
      if (!click || !active()) return;
      if (tool()?.cancel?.()) sync();
      else {
        const r = world.toggleAt(ndc);
        if (r === 'locked') onSound('blocked');
        else if (r) onSound('switch');
      }
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointermove', (e) => {
    setNdc(e);
    if (!active()) return;
    tool()?.move?.(ndc, e, !!leftDown);
    hoverDirty = true;
  });
  let wheelAcc = 0;
  el.addEventListener('wheel', (e) => {
    const t = tool();
    if (!active() || !t?.wantsWheel) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // one step per mouse notch; trackpads' small deltas add up to a step
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(wheelAcc) >= 60) {
      t.wheel?.(Math.sign(wheelAcc));
      wheelAcc = 0;
      sync();
    }
  }, { capture: true, passive: false });

  world.onFrame(() => {
    if (!hoverDirty || !world.ready) return;
    hoverDirty = false; // raycasting the scanned models isn't free: at most once per frame
    el.style.cursor = active() ? (tool()?.cursor?.(ndc) ?? '') : '';
  });

  return {
    ndc,
    playButtons,
    sync,
    // leaving play (menu, pause, photo): put back whatever is in hand
    release() {
      tool()?.release?.();
      leftDown = null;
      el.style.cursor = '';
      sync();
    },
  };
}
