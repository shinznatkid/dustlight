// Floor plan of the bookshop (metres). Same frame as level 1's room: the left
// wall (x = X0) and the back wall (z = Z0) stand, the front (z = Z1) and right
// (x = X1) sides are the open cutaway. The sun comes from -x, so the shop front
// (door + big window) is the left wall; the back wall holds the books.
export const ROOM = { X0: -3.2, X1: 3.2, Z0: -2.6, Z1: 2.6, H: 3.0, T: 0.25 };
const { X0, Z0 } = ROOM;

// shop door (glazed upper half + transom) and the big shop window, both in the left wall
export const DOOR = { z0: -2.1, z1: -1.2, y1: 2.7, fx: X0 - 0.13 };
export const WIN = { z0: -0.8, z1: 1.7, y0: 0.55, y1: 2.7, fx: X0 - 0.16, transom: 2.16 };

// built-in bookshelves along the back wall, from the left corner to x1
export const SHELF = {
  x0: X0,
  x1: 1.25,
  bays: 5,
  back: Z0,
  front: Z0 + 0.34,
  // tops of the boards the books stand on
  boards: [0.12, 0.47, 0.82, 1.17, 1.52, 1.87, 2.22],
  top: 2.6, // underside of the top panel is 2.57
  cornice: 2.7,
  rail: { y: 2.43, z: Z0 + 0.34 + 0.075 }, // brass library-ladder rail
};

// shop counter in front of the plastered part of the back wall
export const COUNTER = { x0: 1.4, x1: 3.0, z0: -1.52, z1: -0.92, h: 0.98 };

// window seat / display bench under the shop window
export const SEAT = { x1: X0 + 0.55, z0: WIN.z0 + 0.05, z1: WIN.z1 - 0.05, h: 0.46 };

// floating shelves on the plastered back wall, above the counter
export const WALL_SHELVES = [
  { x0: 1.55, x1: 2.75, y: 1.46, d: 0.24 },
  { x0: 1.55, x1: 2.75, y: 1.86, d: 0.24 },
];

// the rolling library ladder, hooked on the rail
export const LADDER = { x: -0.72, w: 0.44, tilt: 0.25 };

// honey chest of drawers used as a second display near the way in (books + a lamp)
export const DISPLAY = { x: 0.95, z: 1.95, ry: 0.75, top: 0.55 };
// a point on the display's top, `lx` along its length
export const onDisplay = (lx) => ({ x: DISPLAY.x + lx * Math.cos(DISPLAY.ry), z: DISPLAY.z - lx * Math.sin(DISPLAY.ry) });

// reading corner: armchair facing into the room, side table at its left hand
// (where the oil lamp stands), a footstool in front
export const NOOK = {
  chair: { x: -2.25, z: 1.72, ry: 0.95 },
  side: { x: -1.86, z: 1.2, top: 0.755 },
  stool: { x: -1.72, z: 2.12 },
};
