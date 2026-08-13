# Migrating VoteTogether from Multisynq to Photon Realtime

## Purpose

VoteTogether is deliberately small: one room, one active poll, one vote per participant, and an immediate shared result. This migration replaces the discontinued Multisynq transport while preserving that experience and the project's static-site deployment model.

The original implementation and history remain available on `main`. Migration work belongs on the `photon-migration` branch.

## Ground rules

- Preserve the existing `index.html` until each behaviour has a tested Photon equivalent.
- Keep Photon-specific code behind a small networking adapter.
- Continue to run as browser JavaScript from VS Code Live Server.
- Never treat the Photon App ID as an authentication secret.
- Start with anonymous development connections, then add proper authentication before any public deployment.
- Test every milestone with at least two independent browser sessions.

## Behavioural baseline

Before replacing the transport, record and test these existing behaviours:

1. A participant joins a named room with a username and password.
2. The first eligible participant can become the persistent host.
3. The host can create one active poll with multiple options.
4. Each participant can vote once and predict the most popular answer.
5. All connected participants see state changes immediately.
6. The host closes the poll and results and scores are calculated once.
7. Recent poll history and cumulative prediction scores persist.
8. A disconnected participant can rejoin with the same identity.
9. The established host regains host controls after reconnecting.
10. A room can be shared by URL or QR code.

## Concept mapping

| Multisynq concept | Photon Realtime equivalent | VoteTogether use |
| --- | --- | --- |
| Session name | Room name | Human-shareable room code |
| View / view ID | Actor / actor number | One live browser connection |
| View data | Actor custom properties | Display name and presence metadata |
| Model state | Room custom properties plus events | Poll, host, votes and results |
| Publish / subscribe | `raiseEvent` / event callback | Commands and live updates |
| Persistent session model | External persistence or a designated authority | Host identity, history and scores |
| Session join/exit | Actor join/leave events | Presence and reconnection |

Photon room properties are useful shared state but are not a permanent database. Persistence requirements must therefore be designed explicitly rather than assumed.

## Planned adapter

Application code should depend on an interface such as:

```javascript
connect({ roomCode, username, authToken })
disconnect()
sendCommand(type, payload)
subscribe(handler)
getSnapshot()
```

The first implementation can be a local in-memory adapter for UI testing. The Photon adapter can then implement the same interface without spreading Photon calls throughout the application.

## Migration milestones

### 1. Preserve and observe

- Keep the original Multisynq implementation runnable as a behavioural reference where possible.
- Separate UI rendering, domain rules and network calls.
- Add a connection/status panel suitable for local testing.

### 2. Connect two browsers

- Create a Photon Realtime application on the free development plan.
- Add its App ID to an ignored local configuration file.
- Connect two Live Server browser sessions to the same Photon room.
- Display actor join and leave events.

### 3. Synchronise a single poll

- Send a host-created poll as a command.
- Maintain one canonical active-poll snapshot.
- Enforce one accepted vote per participant identity.
- Broadcast vote totals without revealing individual votes unnecessarily.
- Close and score the poll exactly once.

### 4. Reconnection and authority

- Rejoin after a transient disconnect.
- Restore participant identity using an authenticated token, not a client-asserted username.
- Restore the established host safely.
- Define conflict handling if two clients attempt a host-only action simultaneously.

### 5. Persistence

- Decide which state must outlive the Photon room.
- Persist only the minimum required host, score and recent-history data.
- Document retention and deletion behaviour.

### 6. Secure and deploy

- Add custom authentication and reject anonymous production clients.
- Validate all host-only commands outside untrusted UI logic.
- Test reconnects, duplicate tabs, stale clients and malformed events.
- Deploy the static build while retaining an immediate rollback path.

## Local testing

1. Open the working folder in VS Code.
2. Run it through Live Server; do not use `file://` URLs.
3. Open two independent browser contexts so session storage is not accidentally shared.
4. Join the same room with distinct participant identities.
5. Repeat each behavioural-baseline test above.

## Migration journal

Record each working milestone here as it is completed. Include the problem, the chosen mapping, alternatives rejected, and the exact two-browser test that proved it.

### 2026-08-09 — Migration started

- Copied the existing repository to a separate local working folder.
- Preserved `C:\votetogether` as the pre-Codex safety copy.
- Designated `C:\votetogether - Copy` as the Photon working tree.
- Confirmed the working tree retains the `SarcyHedgehog/VoteTogether` GitHub remote and history.
- Created the `photon-migration` branch.
- Identified an existing uncommitted `index.html` change containing authentication and reconnection fixes; it is deliberately preserved.

### 2026-08-09 — Behaviour separated from transport

- Committed the final Multisynq authentication and reconnection fixes before changing engines.
- Preserved that complete implementation as `legacy-multisynq.html`.
- Extracted poll, voting, host and scoring rules into a transport-independent state engine.
- Added automated tests for authentication, host authority, duplicate-vote rejection, poll replacement and tied results.
- Added a local multi-tab transport using browser-native `BroadcastChannel`, `localStorage` and Web Locks.
- Rebuilt the UI without a framework or runtime CSS dependency.
- Added an initial Photon Realtime adapter against the documented JavaScript 4.4 API.

The local transport is not presented as a substitute backend. It exists so the complete application and its two-client behaviour can be developed and demonstrated before a Photon App ID and official SDK download are available.

### Photon protocol implemented

The first Photon protocol uses five small event types:

1. authentication request;
2. targeted authentication result;
3. command sent to the Photon room's master client;
4. canonical state snapshot broadcast to the room;
5. late-join state request.

The room master processes commands through the same pure rules used by local mode. It writes the canonical snapshot to a room property and broadcasts it. When Photon assigns a replacement master, that client can recover the latest room snapshot and rebuild the authenticated actor map from actor properties.

This is sufficient for development parity. It is not yet hardened against a deliberately modified client; custom authentication and trusted validation remain required before public deployment.
