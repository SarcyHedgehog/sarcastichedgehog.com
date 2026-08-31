(() => {
  'use strict';

  // Player-facing tuning values. Grid positions are measured in the game's
  // fixed 1100 × 620 world coordinates, so they behave identically on phones,
  // tablets and desktop browsers.
  window.HareTortoiseConfig = Object.freeze({
    placementGrid: Object.freeze({
      enabled: true,
      size: 10,
      showDots: true
    })
  });
})();
