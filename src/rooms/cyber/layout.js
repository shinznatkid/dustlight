// Shared measurements of the neon flat (metres). Inner faces: left wall x = X0, back wall
// z = Z0; the front (z = Z1) and right (x = X1) sides are the open cutaway.
export const ROOM = { X0: -3.0, X1: 3.0, Z0: -2.5, Z1: 2.5, H: 3.0, T: 0.25 };
// one wide window in the left wall (two sashes): the city is out there, and at night its
// neon comes in through it the way the sun does by day
export const WIN = { zc: -0.2, w: 1.9, y0: 0.8, y1: 2.36 };
export const WAIN = 0.9; // the mint-tiled dado (its rail tops it at WAIN + 0.05)
export const SILL = { x1: ROOM.X0 + 0.2, y: WIN.y0, z0: WIN.zc - WIN.w / 2 - 0.1, z1: WIN.zc + WIN.w / 2 + 0.1 };
// the window's frame (in the middle of the wall's thickness) and its mullion
export const FRAME = {
  x: ROOM.X0 - ROOM.T * 0.5,
  z0: WIN.zc - WIN.w / 2,
  z1: WIN.zc + WIN.w / 2,
  mullion: WIN.zc,
  transom: WIN.y0 + (WIN.y1 - WIN.y0) * 0.74,
};
// the kitchenette on the back wall: a counter with a gas hob (the room's "fire") and a
// sink, tiled up to the shelf, an open shelf above
export const KITCHEN = { x0: 0.5, x1: 2.2, d: 0.62, top: 0.9, splash: 1.56, shelfY: 1.86, shelfD: 0.25 };
export const HOB = { x: 0.92, z: ROOM.Z0 + 0.33 }; // the burner the noodle pot sits on
export const SINK = { x: 1.78, z: ROOM.Z0 + 0.33 };
// the air conditioner high on the back wall (every flat in the city has one)
export const AC = { x: 2.15, y: 2.62 };
// where the three neon signs hang by default (their centres; they can be moved along the walls)
// — and the noodle bar's lantern, outside: on a bracket off the building, in the lower pane of
// the window's nearer sash, between the wall's outer face (X0 − T) and the city card behind
// (shell.js: X0 − T − 0.14); it stays where it is
export const SIGN_AT = {
  ramen: { wall: 'back', x: -1.45, y: 2.02 },
  moon: { wall: 'left', z: -1.9, y: 1.98 },
  cat: { wall: 'left', z: 1.62, y: 1.98 },
  street: { wall: 'street', x: ROOM.X0 - ROOM.T - 0.118, z: 0.2, y: 1.4 },
};
