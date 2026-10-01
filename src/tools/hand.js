import { t } from '../i18n.js';

// The hand: click a thing to pick it up / put it down (decorate.js), or press on
// litter and drag over more to gather it into a ball, then let go over the bin.
// Moving boxes (boxes.js): a click takes the next thing out, straight into the
// hand; a press-and-drag moves the box. Something carried off the floor's open
// edge goes into the put-aside box; right click / Esc puts a fresh thing back in
// its box (or a moved one back where it was).
export function createHand(world, { trash = null, boxes = null, sound }) {
  const { decor } = world;
  let gathering = false;
  let press = null; // a box pressed: { e, ndc, dragging }
  let hover = null; // entry under the pointer (for the hint)
  const el = world.renderer.domElement;
  const pxDist = (a, b) => Math.hypot((a.x - b.x) * el.clientWidth / 2, (a.y - b.y) * el.clientHeight / 2);

  // let go of what's in the hand: a fresh thing goes back in its box
  function putBack() {
    const r = decor.cancel();
    if (r?.fresh) boxes?.putBack(r.e);
    return r;
  }

  return {
    id: 'hand',
    hint() {
      if (gathering) return trash.overBin ? 'hint.trashOverBin' : 'hint.trashCarry';
      const h = decor.held;
      if (h) {
        if (h.e.crate) return 'hint.boxMove';
        if (h.target?.mode === 'out') return 'hint.heldOut';
        if (h.e.wall) return 'hint.heldWall';
        return h.fresh ? 'hint.heldFresh' : 'hint.held';
      }
      const b = hover && boxes?.boxOf(hover);
      if (b) return [b === boxes.lost ? 'hint.lostBox' : 'hint.box', { name: t(`box.${b.id}`), n: b.items.length }];
      return boxes?.active ? 'hint.unpack' : 'hint.hand';
    },
    down(ndc) {
      if (decor.held) return;
      const h = decor.hover(ndc);
      if (h?.e.crate) {
        press = { e: h.e, ndc: ndc.clone(), dragging: false };
        return;
      }
      if (trash && trash.hit(ndc) && trash.begin(ndc)) {
        gathering = true;
        sound('rustle', { gain: 0.5 });
      }
    },
    move(ndc) {
      if (press && !press.dragging && pxDist(ndc, press.ndc) > 6) {
        press.dragging = true;
        if (decor.pick(press.ndc)) sound('pickup', { gain: 0.6 }, press.e);
      }
      if (gathering) {
        if (trash.move(ndc) > 0) sound('rustle', { gain: 0.35, rate: 1.2 });
      } else if (decor.held) decor.aim(ndc);
    },
    up(ndc, { click }) {
      if (gathering) {
        gathering = false;
        const r = trash.end();
        if (!r.binned && r.n) sound('drop_soft', { gain: 0.6 });
        return;
      }
      if (press) {
        const p = press;
        press = null;
        if (p.dragging) {
          if (!decor.held) return;
          if (decor.drop().ok) sound('drop', { gain: 0.7 }, p.e);
          else {
            decor.cancel();
            sound('blocked');
          }
          return;
        }
        // a click on a box: the next thing comes out, into the hand
        const b = boxes?.boxOf(p.e);
        if (b && boxes.open(b, ndc)) sound('box_open');
        else sound('blocked');
        return;
      }
      if (!click) return;
      if (decor.held) {
        const it = decor.held.e;
        const r = decor.drop();
        if (r.out) {
          boxes?.lose(r.entries);
          sound('box_open', { gain: 0.5, rate: 1.2 });
        } else if (r.ok) {
          boxes?.placed(it);
          sound('drop', {}, it);
        } else sound('blocked');
      } else {
        const it = decor.pick(ndc);
        if (it) sound('pickup', {}, it);
        else if (world.fireAt(ndc)) {
          // clicking the logs lights (or puts out) the fire — once the fireplace is clean
          const r = world.toggleAt(ndc);
          sound(r === 'locked' ? 'blocked' : 'switch');
        }
      }
    },
    // true = the wheel was used here (the camera must not zoom)
    wheel(dir) {
      if (!decor.held) return false;
      if (decor.rotate(dir)) sound('rotate');
      return true;
    },
    get wantsWheel() { return !!decor.held; },
    key(e) {
      if (!decor.held) return false;
      const k = e.key.toLowerCase();
      if (k === 'r') {
        if (decor.rotate(e.shiftKey ? -6 : 6)) sound('rotate'); // 90°
        return true;
      }
      if (e.key === 'Escape') return this.cancel();
      return false;
    },
    // right click / Esc with something in hand
    cancel() {
      if (decor.held) {
        press = null;
        putBack();
        sound('cancel');
        return true;
      }
      if (gathering) {
        gathering = false;
        trash.end();
        return true;
      }
      return false;
    },
    cursor(ndc) {
      if (gathering || decor.held) {
        hover = null;
        return 'grabbing';
      }
      hover = decor.hover(ndc)?.e ?? null;
      if (hover?.crate) return 'pointer';
      if ((trash && trash.hit(ndc)) || hover) return 'grab';
      return world.fireAt(ndc) ? 'pointer' : '';
    },
    release() {
      press = null;
      if (decor.held) putBack();
      if (gathering) {
        gathering = false;
        trash.end();
      }
    },
    get busy() { return gathering || !!decor.held || !!press; },
  };
}
