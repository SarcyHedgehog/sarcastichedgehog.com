export class TurnBuffer {
  constructor(ttlMs = 1000) {
    this.ttlMs = ttlMs;
    this.intent = null;
    this.held = false;
    this.expiresAt = 0;
  }

  press(intent, now) {
    if (intent !== "left" && intent !== "right") return;
    this.intent = intent;
    this.held = true;
    this.expiresAt = now + this.ttlMs;
  }

  release(intent, now) {
    if (!intent || intent === this.intent) {
      this.held = false;
      if (this.intent) this.expiresAt = Math.max(this.expiresAt, now + this.ttlMs);
    }
  }

  peek(now) {
    if (!this.intent) return null;
    if (!this.held && now > this.expiresAt) this.clear();
    return this.intent;
  }

  consume(now) {
    const value = this.peek(now);
    if (value && !this.held) this.clear();
    return value;
  }

  clear() {
    this.intent = null;
    this.held = false;
    this.expiresAt = 0;
  }

  snapshot() { return { intent: this.intent, held: this.held, expiresAt: this.expiresAt }; }
  restore(value = {}) {
    this.intent = value.intent === "left" || value.intent === "right" ? value.intent : null;
    this.held = Boolean(value.held && this.intent);
    this.expiresAt = Number(value.expiresAt) || 0;
  }
}
