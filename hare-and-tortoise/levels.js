(() => {
  'use strict';

  const commonInventory = { platform: 4, ramp: 2, spring: 2, pipe: 0 };

  window.HareTortoiseWorlds = [
    {
      id: 'green-meadows',
      name: 'Green Meadows',
      subtitle: 'A pleasant place to make physics unnecessarily complicated.',
      theme: 'meadow',
      levels: [
        {
          id: 'green-1',
          revision: 1,
          number: 1,
          name: 'Training Meadow',
          description: 'Learn the shed, reach the goal, then improve the journey.',
          inventory: commonInventory,
          scoring: {
            hare: { par: 12, stars: { one: 12, two: 8, three: 5 } },
            tortoise: { par: 10, stars: { one: 10, two: 15, three: 22 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 92, y: 270, vx: 290, vy: -52 },
          goal: { x: 1023, y: 494 },
          carrots: [{ x: 405, y: 310 }, { x: 635, y: 365 }, { x: 820, y: 360 }],
          goldenHedgehog: { x: 570, y: 225 },
          fixedObjects: [],
          starter: {
            hare: [
              { type: 'platform', x: 405, y: 365, angle: 0 },
              { type: 'platform', x: 700, y: 525, angle: 0 },
              { type: 'ramp', x: 620, y: 510, angle: -0.25 },
              { type: 'spring', x: 945, y: 535, angle: 0 }
            ],
            tortoise: [
              { type: 'platform', x: 405, y: 365, angle: 0 },
              { type: 'platform', x: 700, y: 525, angle: 0 },
              { type: 'ramp', x: 620, y: 510, angle: -0.25 },
              { type: 'spring', x: 945, y: 535, angle: 0 }
            ]
          }
        },
        {
          id: 'green-2',
          revision: 1,
          number: 2,
          name: 'The Green Block',
          description: 'One very solid square stands between drop-off and goal.',
          inventory: { platform: 3, ramp: 2, spring: 2, pipe: 0 },
          scoring: {
            hare: { par: 14, stars: { one: 14, two: 10, three: 7 } },
            tortoise: { par: 12, stars: { one: 12, two: 18, three: 26 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 92, y: 405, vx: 305, vy: -35 },
          goal: { x: 1015, y: 286 },
          carrots: [{ x: 345, y: 330 }, { x: 690, y: 245 }, { x: 875, y: 365 }],
          goldenHedgehog: { x: 548, y: 245 },
          fixedObjects: [
            { type: 'block', x: 548, y: 400, width: 128, height: 128, color: '#4f8f45' }
          ],
          starter: {
            hare: [
              { type: 'ramp', x: 360, y: 455, angle: -0.45 },
              { type: 'platform', x: 705, y: 310, angle: 0 }
            ],
            tortoise: [
              { type: 'ramp', x: 360, y: 455, angle: -0.45 },
              { type: 'platform', x: 705, y: 310, angle: 0 }
            ]
          }
        },
        {
          id: 'green-3',
          revision: 3,
          number: 3,
          name: 'Pipe Dream',
          description: 'Build an elbow over the crate wall and drop the sphere down the chimney.',
          inventory: { platform: 2, ramp: 2, spring: 1, pipe: 1 },
          scoring: {
            hare: { par: 16, stars: { one: 16, two: 11, three: 8 } },
            tortoise: { par: 14, stars: { one: 14, two: 22, three: 32 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 92, y: 170, vx: 315, vy: -12 },
          goal: { x: 1048, y: 505, radius: 34 },
          carrots: [{ x: 410, y: 170 }, { x: 690, y: 145 }, { x: 1010, y: 315 }],
          goldenHedgehog: { x: 710, y: 355 },
          fixedObjects: [
            { type: 'crate', x: 900, y: 520, width: 80, height: 78 },
            { type: 'crate', x: 900, y: 440, width: 80, height: 78 },
            { type: 'crate', x: 900, y: 360, width: 80, height: 78 },
            { type: 'crate', x: 900, y: 280, width: 80, height: 78 },
            { type: 'crate', x: 900, y: 200, width: 80, height: 78 }
          ],
          starter: {
            hare: [
              { type: 'platform', x: 610, y: 245, angle: 0 }
            ],
            tortoise: [
              { type: 'platform', x: 610, y: 245, angle: 0 }
            ]
          }
        }
      ]
    }
  ];
})();
