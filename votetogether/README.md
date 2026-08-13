# VoteTogether

One poll. One vote. One immediate shared result.

VoteTogether is a deliberately frictionless social polling game inspired by the Wii Everybody Votes Channel. A host asks one question, shares a room link, and everyone votes anonymously while predicting the most popular answer.

This branch migrates the original Multisynq implementation to Photon Realtime while keeping the app as a framework-free static website.

## Current status

- Complete responsive UI and game rules
- Room-scoped username/password identity
- Persistent host role
- One active poll and one accepted vote per participant
- Majority prediction scoring, leaderboard and recent history
- Shareable room URLs
- Local multi-tab transport for immediate development and testing
- Photon Realtime adapter implemented against the JavaScript 4.4 API
- Original implementation preserved in `legacy-multisynq.html`

The local transport is fully usable now. Photon mode needs a Realtime App ID and the official JavaScript SDK download.

## Run locally

1. Open this folder in VS Code.
2. Copy `config.example.js` to `config.js` if a local config does not already exist.
3. Keep `MODE: "local"`.
4. Start VS Code Live Server from `index.html`.
5. Open the same URL in two tabs.
6. Join the same room with different names and passwords.

Local mode uses `BroadcastChannel` for live notifications and `localStorage` for canonical room state. It is a development transport, not a production backend.

## Enable Photon

1. Create a free Photon account.
2. Create an application of type **Realtime**.
3. Download the official Photon JavaScript SDK 4.4.
4. Copy `lib/photon.min.js` from the download into `vendor/photon.min.js`.
5. Configure the ignored `config.js`:

```javascript
window.APP_CONFIG = {
  MODE: "photon",
  PHOTON_APP_ID: "your-realtime-app-id",
  PHOTON_REGION: "eu",
  PHOTON_SDK_URL: "vendor/photon.min.js",
  BASE_URL: "http://127.0.0.1:5500/",
  DEBUG: false,
};
```

6. Reload both browser tabs and join the same room.

The App ID is a client identifier and will be visible in browser code. It is not a replacement for authentication.

## Architecture

```text
src/app.js
  presentation, interaction and room lifecycle
        │
        ▼
src/transports/index.js
  selects local or Photon transport
        │
        ├── local-transport.js
        │     BroadcastChannel + localStorage
        │
        └── photon-transport.js
              Photon rooms, events and room properties
        │
        ▼
src/game-state.js
  transport-independent rules and scoring
```

The Photon room's master client processes application commands and publishes canonical snapshots. The latest snapshot is also stored in a Photon room property so late joiners and a replacement master can recover it while the room exists.

Photon room properties are not permanent database storage. Long-term persistence and hardened authentication are separate production milestones documented in `tutorial/photon_migration.md`.

## Tests

Run the transport-independent rules:

```bash
npm test
```

For browser testing, use two Live Server tabs and follow the behavioural baseline in `tutorial/photon_migration.md`.

## Security status

Local mode stores hashed room credentials in the browser for development. Photon development mode stores the same application state in a room property. This preserves the original behaviour but is not hardened authentication: a malicious client can inspect or manipulate browser-visible state.

Before any public deployment:

- configure Photon Custom Authentication;
- reject anonymous Photon clients;
- move credential verification and privileged command validation behind a trusted service;
- decide which room data should persist and for how long.

## Project history

- `main`: original Multisynq application
- `photon-migration`: Photon migration and local development transport
- `legacy-multisynq.html`: final preserved Multisynq page inside this branch
- `tutorial/`: implementation history and reusable patterns

See [the migration journal](tutorial/photon_migration.md) and [the changelog](CHANGELOG.md).

## License

MIT
