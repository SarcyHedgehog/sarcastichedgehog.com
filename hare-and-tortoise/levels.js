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
          starter: [
            { type: 'platform', x: 405, y: 365, angle: 0 },
            { type: 'platform', x: 700, y: 525, angle: 0 },
            { type: 'ramp', x: 620, y: 510, angle: -0.25 },
            { type: 'spring', x: 945, y: 535, angle: 0 }
          ]
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
          starter: [
            { type: 'ramp', x: 360, y: 455, angle: -0.45 },
            { type: 'platform', x: 705, y: 310, angle: 0 }
          ]
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
          starter: [
            { type: 'platform', x: 610, y: 245, angle: 0 }
          ]
        },
        {
          id: 'green-4',
          revision: 1,
          number: 4,
          name: 'Mind the Gap',
          description: 'Carrot in a box',
          scoring: {
            hare: { par: 7, stars: { one: 6, two: 5, three: 3 } },
            tortoise: { par: 10, stars: { one: 10, two: 15, three: 22 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 99, y: 234, vx: 290, vy: -52 },
          goal: { x: 1008, y: 232, radius: 34 },
          carrots: [
            { x: 197, y: 428 },
            { x: 840, y: 160 },
            { x: 559, y: 256 }
          ],
          goldenHedgehog: { x: 850, y: 469 },
          fixedObjects: [
            { type: 'crate', x: 556, y: 74, width: 80, height: 78 },
            { type: 'crate', x: 556, y: 157, width: 80, height: 78 },
            { type: 'crate', x: 556, y: 516, width: 80, height: 78 },
            { type: 'crate', x: 556, y: 350, width: 80, height: 78 },
            { type: 'crate', x: 556, y: 434, width: 80, height: 78 }
          ],
          starter: [],
          background: { type: 'preset', preset: 'meadow', image: '' },
          availablePieces: { platform: 2, ramp: 1, spring: 3, pipe: 0 }
        },
        {
          id: 'green-5',
          revision: 1,
          number: 5,
          name: 'Carrot Dash',
          description: 'Carrots on a Box',
          scoring: {
            hare: { par: 7, stars: { one: 6, two: 5, three: 3 } },
            tortoise: { par: 8, stars: { one: 10, two: 13, three: 20 } },
            carrotClockEffectSeconds: 2
          },
          launcher: { x: 99, y: 234, vx: 290, vy: -52 },
          goal: { x: 1008, y: 232, radius: 34 },
          carrots: [
            { x: 504, y: 87 },
            { x: 596, y: 90 },
            { x: 549, y: 88 }
          ],
          goldenHedgehog: { x: 565, y: 483 },
          fixedObjects: [
            { type: 'block', x: 543, y: 181, width: 128, height: 128, color: '#4f8f45' }
          ],
          starter: [
            { type: 'platform', x: 556, y: 491, angle: -2.792526803190927 }
          ],
          background: { type: 'preset', preset: 'meadow', image: '' },
          availablePieces: { platform: 3, ramp: 2, spring: 2, pipe: 1 }
        },
        {
          id: 'green-6',
          revision: 1,
          number: 6,
          name: 'Hello Down There',
          description: 'Up and Under',
          scoring: {
            hare: { par: 10, stars: { one: 8, two: 6, three: 4 } },
            tortoise: { par: 12, stars: { one: 15, two: 20, three: 25 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 584, y: 175, vx: 291, vy: -93 },
          goal: { x: 573, y: 378, radius: 34 },
          carrots: [
            { x: 985, y: 311 },
            { x: 261, y: 274 },
            { x: 384, y: 399 }
          ],
          goldenHedgehog: { x: 982, y: 262 },
          fixedObjects: [],
          starter: [
            { type: 'pipe', x: 981, y: 129, angle: 0 },
            { type: 'platform', x: 947, y: 292, angle: 1.5707963267948966 },
            { type: 'spring', x: 1015, y: 501.64525137490637, angle: -1.0821041362364843 },
            { type: 'platform', x: 572, y: 290, angle: 0 }
          ],
          background: { type: 'preset', preset: 'meadow', image: '' },
          availablePieces: { platform: 3, ramp: 2, spring: 2, pipe: 0 }
        },
        {
          id: 'green-7',
          revision: 1,
          number: 7,
          name: 'Boing',
          description: 'Weeeee',
          scoring: {
            hare: { par: 7, stars: { one: 5, two: 4, three: 3 } },
            tortoise: { par: 12, stars: { one: 15, two: 20, three: 25 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 56, y: 89, vx: 290, vy: -52 },
          goal: { x: 1056, y: 76, radius: 34 },
          carrots: [
            { x: 361, y: 109 },
            { x: 155, y: 325 },
            { x: 736, y: 201 }
          ],
          goldenHedgehog: { x: 1007, y: 285 },
          fixedObjects: [],
          starter: [
            { type: 'spring', x: 189.80555555555557, y: 493.8827807486631, angle: 0 },
            { type: 'spring', x: 317.83641975308643, y: 492.67294117647054, angle: 0 },
            { type: 'spring', x: 445.49691358024694, y: 493.6954010695187, angle: 0 },
            { type: 'spring', x: 572.5092592592594, y: 493.63315508021395, angle: 0 },
            { type: 'spring', x: 698.0092592592592, y: 493.79016042780745, angle: 0 }
          ],
          background: { type: 'preset', preset: 'meadow', image: '' },
          availablePieces: { platform: 3, ramp: 2, spring: 0, pipe: 0 }
        },
        {
          id: 'green-8',
          revision: 1,
          number: 8,
          name: 'Who put that there?',
          description: "Well that's annoying",
          scoring: {
            hare: { par: 8, stars: { one: 6, two: 4, three: 3 } },
            tortoise: { par: 12, stars: { one: 15, two: 20, three: 25 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 92, y: 270, vx: 290, vy: -52 },
          goal: { x: 1020, y: 500, radius: 34 },
          carrots: [
            { x: 547, y: 94 },
            { x: 840, y: 243 },
            { x: 300, y: 230 }
          ],
          goldenHedgehog: { x: 542, y: 500 },
          fixedObjects: [
            { type: 'crate', x: 550, y: 307, width: 80, height: 317 }
          ],
          starter: [],
          background: { type: 'preset', preset: 'meadow', image: '' },
          availablePieces: { platform: 3, ramp: 2, spring: 1, pipe: 0 }
        }
      ]
    },
    {
      id: 'bounce-in-space',
      number: 2,
      name: 'Bounce in Space',
      subtitle: 'Avoid the black holes',
      theme: 'space',
      levels: [
        {
          id: 'space-1',
          revision: 1,
          number: 1,
          name: "Eeek, it's a black hole",
          description: '',
          scoring: {
            hare: { par: 7, stars: { one: 5, two: 4, three: 3 } },
            tortoise: { par: 12, stars: { one: 15, two: 20, three: 25 } },
            carrotClockEffectSeconds: 1
          },
          launcher: { x: 917, y: 109, vx: 290, vy: -52 },
          goal: { x: 152, y: 467, radius: 34 },
          carrots: [
            { x: 280, y: 80 },
            { x: 156, y: 209 },
            { x: 1030, y: 417 }
          ],
          goldenHedgehog: { x: 533, y: 401 },
          fixedObjects: [
            { type: 'blackhole', x: 531, y: 300, radius: 23 },
            { type: 'block', x: 1032, y: 495, width: 128, height: 128, color: '#466c91' }
          ],
          starter: [
            { type: 'pipe', x: 153.42283950617283, y: 76.00000000000001, angle: 4.71238898038469 }
          ],
          background: { type: 'preset', preset: 'space', image: '' },
          availablePieces: { platform: 3, ramp: 2, spring: 2, pipe: 1 }
        }
      ]
    }
  ];
})();
