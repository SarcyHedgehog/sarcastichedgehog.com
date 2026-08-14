# Future shared-skies design

The browser reconstruction is single-player first, and Flight Test 03 now has
a Photon-backed Shared Skies preview on top of its Defender-style shared world.

## World

- The world is 24,000 logical units wide: many screens at ordinary zoom.
- Horizontal positions wrap into `[0, worldWidth)`.
- Distance and targeting use the shortest wrapped delta, so an entity at the
  far right edge can correctly see one just across the left edge.
- The camera is only a view. Moving the camera never moves or respawns the
  simulation.

This means two pilots travelling in opposite directions will eventually meet,
including when their meeting occurs at the map seam.

## Direction-neutral entities

- Players have an explicit `facing` (`-1` west, `1` east) and a signed velocity.
- Spawn positions are chosen ahead of the player's current facing, but stored
  as absolute wrapped coordinates.
- Wave enemies use signed velocity and work in either direction.
- Hunters target the shortest wrapped vector to their target.
- Rendering flips artwork from the entity's actual direction; it does not
  determine movement.

## Implemented Photon preview

- A dedicated room code joins up to twelve pilots.
- Each client publishes a compact pose around 12.5 times per second.
- Remote craft are briefly extrapolated between packets and drawn with labels.
- A radar strip plots remote pilots using shortest wrapped distance.
- Room departure removes the craft and a persistent browser identity avoids
  duplicate-user joins after an ordinary refresh.

This preview intentionally does **not** pretend its hazards are synchronized.
Each pilot still has a local single-player encounter stream.

## Authoritative Photon phase

The recommended multiplayer phase is an authoritative room simulation:

1. Clients send compact input intents: lift, left, right, sequence, timestamp.
2. A designated authority advances the same fixed-step simulation used by
   single-player.
3. Photon room events distribute periodic snapshots and important discrete
   events (spawn, rescue, collision, death).
4. Clients predict their own craft and interpolate remote craft.
5. Authority can migrate by transferring the latest snapshot and random seed.

Enemy decisions and collisions should never be independently rolled by each
client. That avoids divergent spawns and double rescues.

### Concrete next implementation

- Room properties hold `worldSeed`, `simulationTick`, `authorityActor` and an
  authority epoch. One client owns the authoritative fixed-step simulation.
- Each pilot sends only sequenced input changes. The authority broadcasts
  lightweight snapshots at roughly 10 Hz plus reliable rescue, hit, pickup and
  spawn events.
- A client predicts its own helicopter immediately, then gently reconciles it
  to snapshots. Remote pilots and enemies are interpolated between snapshots.
- If the authority leaves, the next actor resumes from the newest complete
  snapshot, increments the epoch and ignores packets from older epochs.
- World sectors are derived from the shared seed. This keeps scenery and
  dormant encounters consistent without broadcasting the entire 24,000-unit
  loop, while active enemies remain authoritative entities.

### Defender feel

- Add a narrow radar strip showing wrapped relative positions of pilots,
  rescue birds, power-ups and dangerous encounters.
- Preserve turn momentum so reversing the helicopter is a committed manoeuvre,
  not an instantaneous sprite flip.
- Allow pilots travelling in opposite directions to meet naturally, including
  across the world seam, and then continue past one another.
- Keep personal score/lives but share the rescue objective. Shield collisions
  can protect another pilot and award an assist.
- Spectators can follow a pilot or view the radar-centred world without owning
  a simulation-controlled craft.

## Sensible multiplayer additions

- Shared rescue total with individual score and lives.
- Other pilots appear naturally in the same looping world rather than being
  teleported into a small arena.
- Radar displays wrapped relative positions.
- Optional co-op rescues and shield assists.
- Rejoining pilots spawn near, but not on top of, the nearest active teammate.

None of these require changing the current entity coordinate system, fixed
simulation step, bidirectional controls, or collision rules.
