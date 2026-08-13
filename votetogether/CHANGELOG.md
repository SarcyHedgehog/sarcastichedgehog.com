# Changelog

## 3.0.0-photon — in progress

### Added

- Transport-independent game-state engine with automated tests.
- Local multi-tab transport for development before Photon credentials are available.
- Photon Realtime JavaScript transport using rooms, targeted events, room properties and master-client command processing.
- A new responsive interface centred on the product promise: one poll, one vote, one shared result.
- Shareable room URLs, connection status, participant presence and explicit transport status.
- Living Multisynq-to-Photon migration tutorial.

### Preserved

- Room-scoped username/password identities.
- Persistent named host role.
- Vote plus majority prediction flow.
- Accuracy leaderboard and bounded poll history.
- The final Multisynq application as `legacy-multisynq.html`.

### Changed

- Application code is split into presentation, transport and domain-rule modules.
- Password hashing now uses the browser Web Crypto API rather than a third-party script.
- The service worker caches the new local application shell and no longer caches Multisynq.

### Known limitations

- Photon mode requires the official Photon JavaScript SDK 4.4 and a Realtime App ID.
- Development authentication preserves the old behaviour but is not suitable as hardened public authentication.
- Photon room state survives master-client changes while the room exists, but it is not permanent database storage.
