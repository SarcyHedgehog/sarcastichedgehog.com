export const C = Object.freeze({
  gridSize: 16,
  cellWidth: 5,
  wallHeight: 4,
  wallThickness: 0.5,
  msPerCell: 400,
  itSpeedMultiplier: 1.2,
  trailLength: 14,
  immunityMs: 10_000,
  roundMs: 4 * 60_000,
  nextRoundMs: 12_000,
  cubeSpawnChance: 0.2,
  maxBlueCubes: 45,
  tickMs: 50,
  turnBufferMs: 1_000,
  snapshotMs: 100
});

export const MAX_PLAYERS = 8;

export const WALL = Object.freeze({ north: 1, east: 2, south: 4, west: 8 });
export const PLAYER_COLORS = Object.freeze([
  0x48d9ff, 0xff477e, 0xffd166, 0x64f58d, 0xb388ff, 0xff8c42, 0xf8f9fa, 0x52b788
]);
export const DIRECTIONS = Object.freeze([
  Object.freeze({ dx: 0, dy: -1 }),
  Object.freeze({ dx: 1, dy: 0 }),
  Object.freeze({ dx: 0, dy: 1 }),
  Object.freeze({ dx: -1, dy: 0 })
]);
