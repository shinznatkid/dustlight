// Shared measurements of the pottery studio (metres). Inner faces: left wall x = X0,
// back wall z = Z0; the front (z = Z1) and right (x = X1) sides are the open cutaway.
export const ROOM = { X0: -3.0, X1: 3.0, Z0: -2.5, Z1: 2.5, H: 3.0, T: 0.25 };
// one wide window in the left wall — the sun (from -x) comes through it
export const WIN = { zc: -0.3, w: 2.1, y0: 0.82, y1: 2.42 };
export const WAIN = 0.8; // sage wainscot height (its rail lines up with the sill)
export const SILL = { x1: ROOM.X0 + 0.2, y: WIN.y0, z0: WIN.zc - WIN.w / 2 - 0.1, z1: WIN.zc + WIN.w / 2 + 0.1 };
// the tall open shelf unit on the back wall: board tops, centre x and width
export const SHELF_Y = [0.1, 0.56, 1.02, 1.48, 1.94];
export const SHELF_X = { x: 1.1, w: 1.5 };
// the wall shelf over the work table (a built-in fitting; jars stand on it)
export const WALL_SHELF = { x0: -1.95, x1: -0.1, y: 1.66, d: 0.26 };
// the kiln in the back-right corner (its flue runs into the back wall at FLUE_Y)
export const KILN = { x: 2.4, z: -1.72, ry: 0.5 };
export const FLUE_Y = 2.3;
// the wheel stands where the window's sun lands on it at every time of day
export const WHEEL = { x: -1.05, z: 0.0 };
// the hanging planter in the window (its leaves throw a shadow into the sun patch)
export const PLANTER = { x: ROOM.X0 + 0.32, y: 1.95, z: WIN.zc - 0.52 };
// the window's frame (in the middle of the wall's thickness, x): its sides, and where the
// mullions and the transom run — the sun comes through the panes between them
export const FRAME = {
  x: ROOM.X0 - ROOM.T * 0.5,
  z0: WIN.zc - WIN.w / 2,
  z1: WIN.zc + WIN.w / 2,
  mullions: [1, 2].map((k) => WIN.zc - WIN.w / 2 + (WIN.w * k) / 3),
  transom: WIN.y0 + (WIN.y1 - WIN.y0) * 0.72,
};
