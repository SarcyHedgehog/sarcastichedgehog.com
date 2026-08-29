(() => {
  'use strict';

  const PLAYFIELD = Object.freeze({ left: 0, right: 1100, top: 35, bottom: 560 });

  function pieceLength(piece) {
    return piece.type === 'platform' ? 155 : piece.type === 'ramp' ? 130 : piece.type === 'pipe' ? 124 : 105;
  }

  function rotatePoint([x, y], angle) {
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return { x: x * cosine - y * sine, y: x * sine + y * cosine };
  }

  function pipeBounds(piece) {
    const points = [[-62, 0], [0, 0], [0, 62]].map(point => rotatePoint(point, piece.angle || 0));
    const radius = 41;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      const xPad = Math.abs(nx) * radius, yPad = Math.abs(ny) * radius;
      minX = Math.min(minX, a.x - xPad, b.x - xPad);
      maxX = Math.max(maxX, a.x + xPad, b.x + xPad);
      minY = Math.min(minY, a.y - yPad, b.y - yPad);
      maxY = Math.max(maxY, a.y + yPad, b.y + yPad);
    }
    // The elbow is rendered with a round join at its centre.
    const corner = points[1];
    return {
      minX: Math.min(minX, corner.x - radius), maxX: Math.max(maxX, corner.x + radius),
      minY: Math.min(minY, corner.y - radius), maxY: Math.max(maxY, corner.y + radius)
    };
  }

  function pieceBounds(piece) {
    if (piece.type === 'pipe') return pipeBounds(piece);
    const half = pieceLength(piece) / 2;
    const radius = piece.type === 'spring' ? 12 : 8;
    const dx = Math.cos(piece.angle || 0) * half;
    const dy = Math.sin(piece.angle || 0) * half;
    return {
      minX: -Math.abs(dx) - radius, maxX: Math.abs(dx) + radius,
      minY: -Math.abs(dy) - radius, maxY: Math.abs(dy) + radius
    };
  }

  function clampPiece(piece, x = piece.x, y = piece.y, playfield = PLAYFIELD) {
    const bounds = pieceBounds(piece);
    return {
      x: Math.max(playfield.left - bounds.minX, Math.min(playfield.right - bounds.maxX, x)),
      y: Math.max(playfield.top - bounds.minY, Math.min(playfield.bottom - bounds.maxY, y))
    };
  }

  window.HareTortoiseGeometry = Object.freeze({ PLAYFIELD, pieceLength, pieceBounds, clampPiece });
})();
