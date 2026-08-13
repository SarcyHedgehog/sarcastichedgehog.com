# Poker Dice V2

A mobile-first Photon Realtime game containing two modes in one app:

- **Poker Dice** — every player gets up to three public rolls; the strongest poker hand wins.
- **Liar's Dice** — one concealed five-dice hand passes around the table. Accept it and make a higher claim, or call the previous player a liar. A failed claimant or challenger is eliminated; the last player standing wins.

The dice use the traditional poker faces **9, 10, Jack, Queen, King, Ace**.

## Local setup

1. Copy `config.example.js` to `config.js`.
2. Put the Photon Realtime JavaScript application ID in `PHOTON_APP_ID`.
3. Serve the folder over HTTP. `npm run serve` uses port 8773.
4. Open the same table code in two different browsers or private profiles.

`config.js` is ignored by Git. Do not commit it.

## Liar's Dice rules used here

- The host chooses one or two rerolls in the lobby.
- The opening player receives a freshly rolled concealed hand.
- After a claim, the next player must choose **Accept dice** or **Call liar** before seeing the hand.
- Accepting reveals the hand only to that player. They may keep any dice, use the configured rerolls, and must make a strictly higher claim. They may also reroll nothing and bluff immediately.
- Calling liar reveals the dice to everyone. If the real hand meets or beats the claim, the challenger is eliminated; otherwise the claimant is eliminated.
- The challenge winner opens the next round. The last active player wins.

Claims use poker categories and the significant face values. Kickers are used to rank final Poker Dice results but deliberately omitted from Liar's Dice claims to keep the mobile claim builder quick.

## Architecture and hidden information

Photon's room master is authoritative. Public snapshots contain players, phase, claims and public Poker Dice results. During Liar's Dice, the actual dice are **not** included in room properties or public snapshots. The master sends them only to the current actor using a targeted Photon event. They enter public state only when a challenge reveals the hand.

This is appropriate for a friendly game, but the current Photon room master can technically inspect the authoritative hand in developer tools. Preventing even the room master from knowing it would require a substantially more complex commit/reveal protocol.

If the room master changes during an unrevealed Liar's Dice round, the incomplete round is safely restarted with fresh concealed dice because the secret hand is intentionally not persisted publicly.

## Migration from Multisynq

The original game used a deterministic Multisynq model mirrored to every client. V2 preserves a single authoritative state machine but moves authority to Photon's room master:

1. Multisynq model subscriptions became validated Photon commands.
2. Every command includes the sending actor and is checked against host/turn ownership.
3. Public state is persisted as a Photon room property for late joins and master migration.
4. Targeted Photon events provide the private hand required by Liar's Dice.
5. A per-tab Photon user ID prevents the same-browser duplicate-user join error.
6. Late joiners and eliminated players are explicit spectators.

The original repository and commit history are retained.

## Testing

Run:

```powershell
npm test
```

Tests cover poker ranking and tie-breaks, claim ordering, reroll limits, hidden public state and challenge elimination.

## Deployment

The GitHub Action requires:

- `PHOTON_APP_ID`
- `GH_PAGES_DEPLOY_TOKEN`

On a push to `main`, it creates the production `config.js` and replaces `/dice` in the `sarcastichedgehog.com` repository.
