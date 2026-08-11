export const TICK_MS = 33;
export const SNAPSHOT_MS = 66;
export const C = Object.freeze({
  courtWidth: 8, courtDepth: 5, paddleLength: 1.2, paddleThickness: .2,
  paddleX: 3.8, paddleSpeed: .10, ballRadius: .10, ballSpeed: .05,
  brickWidth: .25, brickDepth: .5, wallColumns: 5, winScore: 10,
  shrinkFactor: .5, shrinkMs: 20_000, portalRadius: .18,
  portalCooldownMs: 750, blackBrickIntervalMs: 30_000, maxBlackBricks: 10,
});

export const BRICK = Object.freeze({
  green: 0x00bb00, red: 0xcc0000, purple: 0x9900cc, black: 0x222222,
});
