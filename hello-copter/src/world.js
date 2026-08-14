export const WORLD_WIDTH = 24000;
export const WORLD_HEIGHT = 900;

export function wrap(value, size = WORLD_WIDTH) {
  return ((value % size) + size) % size;
}

export function wrappedDelta(from, to, size = WORLD_WIDTH) {
  let delta = wrap(to - from, size);
  if (delta > size / 2) delta -= size;
  return delta;
}

export function wrappedDistance(a, b) {
  return Math.hypot(wrappedDelta(a.x, b.x), b.y - a.y);
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function worldToScreen(entity, camera, viewport) {
  return {
    x: viewport.width / 2 + wrappedDelta(camera.x, entity.x),
    y: viewport.height * .5 - (entity.y - camera.y),
  };
}
