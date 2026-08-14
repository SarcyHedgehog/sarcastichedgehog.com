# Hello Copter — JavaScript reconstruction

This is the browser reconstruction of the recovered 2012 Sarcastic Hedgehog
game. Flight Test 02 restores the original visual identity and gameplay pieces
while retaining a direction-neutral simulation suitable for a future
Defender-style multiplayer mode.

## Run locally

Serve this folder over HTTP (VS Code Live Server is fine) and open `index.html`.
No build step or package installation is required. Run `npm test` for the
deterministic simulation tests.

For Shared Skies, create a dedicated **Photon Realtime / JavaScript** app,
copy `config.example.js` to `config.js`, and put its App ID in
`PHOTON_APP_ID`. Do not reuse another game's App ID. `config.js` is loaded
before the module game code so local development and deployment use the same
configuration method as the other Sarcastic Hedgehog Photon conversions.

## GitHub deployment

The repository workflow publishes the contents of `browser/` to the
`hello-copter/` directory of `SarcyHedgehog/sarcastichedgehog.com`.

Add these repository Actions secrets before running the workflow:

- `PHOTON_APP_ID` — the dedicated Photon Realtime JavaScript App ID.
- `GH_PAGES_DEPLOY_TOKEN` — a fine-grained GitHub token with **Contents:
  read and write** access to the `sarcastichedgehog.com` repository.

The workflow generates the production `config.js`; the local file remains
ignored and must never be committed.

## Controls

- `Space`, pointer, or touch: lift
- `A` / `D` or left / right arrows: turn and fly left or right
- `P` or `Escape`: pause
- On touch devices, use the on-screen direction and lift controls

## Restored in Flight Test 02

- Original sky, three parallax foliage layers, ground and helicopter artwork
- Business Bird, Witch Pig and Bomb Fish animation sheets
- Ground and ceiling Monkey Mouths: warning, pause, emerge, then travel
- Repair, shield and slowdown pickups with their original artwork and sounds
- Animated helicopter shield with the original expiry warning flash
- Bidirectional wrapped world, fixed simulation step and responsive controls
- Rescue birds restored to their original surface-running lane
- Correct recovered atlas frame counts (no transparent Witch Pig/Bomb Fish frames)
- Optional Shared Skies pilot presence, interpolation, labels and wrapped radar

## Architecture

- `src/world.js` owns the wrapping world and shortest wrapped-distance maths.
- `src/simulation.js` owns authoritative state, spawning and fixed-step updates.
- `src/game.js` renders the view and translates controls into input intents.
- Entities store absolute world positions and signed velocities. Rendering may
  mirror art, but it never decides simulation direction.
- `src/shared-skies.js` is the Photon transport for the current formation-flight
  preview. It shares pilot poses at 12.5 Hz and extrapolates briefly between
  packets; it never exposes a local server or secret.

## Multiplayer status

Shared Skies is deliberately additive: pilots in one airspace code can find
and pass one another anywhere in the 24,000-unit loop. Their names and craft
are visible in-world and the radar uses shortest wrapped distance.

At this stage each pilot still owns their local hazards, rescues, lives and
score. This is useful for testing the world, room lifecycle and remote motion,
but it is not yet the final authoritative co-op game. The next phase described
in `docs/FUTURE-MULTIPLAYER.md` moves spawns, collisions and rescues to one
migratable room authority so every pilot sees exactly the same encounter.

The recovered Unity project remains the historical reference. Original art and
audio used by this reconstruction are copied from that archive.
