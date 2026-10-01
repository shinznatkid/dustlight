// A room module: everything world.js needs to stand one room up — its shell,
// furniture and lamps — so the same renderer, lighting, GI and furniture handling
// serve any room. This one is level 1's living room (the M1 slice), built by
// room.js / props.js. Other rooms live next to it (src/rooms/<id>.js) and can be
// looked at on their own with proto.html?room=<id>.
//
//   id        : the room's name
//   bounds    : { X0, X1, Z0, Z1, H } metres — the interior (walls, GI probe grid, dust, shafts)
//   build(scene) → the shell: { paint?, sky?, dome?, fireLight?, setFire?, fireOn?, fireGI?,
//                clickTargets?: { fire: [] }, blockers?, surfaces?, hang?, obstacles?, update?(dt, t, still) }
//                (see room.js for what each does; a room without a fireplace leaves those out)
//   ready()   → resolves once the shell's textures are in memory
//   loadProps(onProgress) → [{ e, obj }] furniture for decorate.js (see props.js LAYOUT)
//   buildFixtures(scene) → { lamps: [{ name, root, light, targets, adopt? }], update(dt, t, still) }
//   cams?     : camera presets like world.js CAMS (hero at least) — framing for this room's size
//   keys?     : time-of-day keys like world.js KEYS — a room may warm its own sky / backdrop
//   sites?    : what a level can work on here — { windows, soot, walls } (format: SITES in
//               room.js); a level only gets the systems its room has sites for
// A level (src/levels/<id>.js) names its room. The shell may also hand the level's systems
// their materials: paint (walls.js), floor { mat, worn, wornNormal } (floor.js), fireplace
// (boxes where the floor is never seen) and rug (put down once the repairs are done).
import { buildRoom, roomTexturesReady, ROOM, SITES } from '../room.js';
import { loadProps, buildFixtures } from '../props.js';

export default {
  id: 'meadow',
  bounds: ROOM,
  sites: SITES,
  build: buildRoom,
  ready: roomTexturesReady,
  loadProps,
  buildFixtures,
};
