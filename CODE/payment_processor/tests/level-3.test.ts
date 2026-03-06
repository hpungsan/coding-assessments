import { describe, it, expect, beforeEach } from "vitest";
import { PaymentProcessor } from "@handler";
import { IDEMPOTENCY_TTL } from "../src/config";

describe("Level 3 - Idempotency", () => {
  let pp: PaymentProcessor;

  beforeEach(() => {
    pp = new PaymentProcessor();
  });

  it("should return cached response for duplicate idempotency key", () => {
    const r1 = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
    expect(r1[0].status).toBe("PENDING");

    const r2 = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
    expect(r2).toEqual(r1);
  });

  it("should treat different idempotency keys independently", () => {
    const r1 = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
    const r2 = pp.handle({ id: "tx2", type: "submit", idempotencyKey: "key2" });
    expect(r1[0].id).toBe("tx1");
    expect(r2[0].id).toBe("tx2");
  });

  it("should not cache requests without an idempotency key", () => {
    pp.handle({ id: "tx1", type: "submit" });
    // Second submit without key — normal IGNORED behavior, not cached
    const r = pp.handle({ id: "tx1", type: "submit" });
    expect(r[0].status).toBe("IGNORED");
  });

  it("should cache the QUEUED response for a queued submit", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    const r1 = pp.handle({ id: "tx5", type: "submit", idempotencyKey: "key5" });
    expect(r1[0].status).toBe("QUEUED");

    const r2 = pp.handle({ id: "tx5", type: "submit", idempotencyKey: "key5" });
    expect(r2).toEqual(r1);
  });

  it("should cache the IGNORED response", () => {
    pp.handle({ id: "tx1", type: "submit" });
    const r1 = pp.handle({ id: "tx1", type: "capture", idempotencyKey: "key-cap" });
    expect(r1[0].status).toBe("IGNORED");

    const r2 = pp.handle({ id: "tx1", type: "capture", idempotencyKey: "key-cap" });
    expect(r2).toEqual(r1);
  });

  it("should reject idempotency key reuse with a different request", () => {
    pp.handle({ id: "tx1", type: "submit", idempotencyKey: "shared-key" });
    // Same key, different transaction — conflict, not a silent replay
    const r = pp.handle({ id: "tx2", type: "submit", idempotencyKey: "shared-key" });
    expect(r[0].id).toBe("tx2");
    expect(r[0].status).toBe("CONFLICT");
    expect(r[0].message).toBe("Idempotency key conflict");
  });

  it("should cache transition responses with idempotency keys", () => {
    pp.handle({ id: "tx1", type: "submit" });
    const r1 = pp.handle({ id: "tx1", type: "authorize", idempotencyKey: "auth-key" });
    expect(r1[0].status).toBe("AUTHORIZED");

    const r2 = pp.handle({ id: "tx1", type: "authorize", idempotencyKey: "auth-key" });
    expect(r2).toEqual(r1);
  });

  it("should allow same transaction to use different keys for different actions", () => {
    pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key-submit" });
    const r1 = pp.handle({ id: "tx1", type: "authorize", idempotencyKey: "key-auth" });
    expect(r1[0].status).toBe("AUTHORIZED");

    // Replay submit key — returns original submit response
    const r2 = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key-submit" });
    expect(r2[0].status).toBe("PENDING");
  });

  describe("Idempotency cache TTL", () => {
    let now: number;

    beforeEach(() => {
      now = 1_000_000;
      pp = new PaymentProcessor(() => now);
    });

    it("should return cached response before TTL expires", () => {
      pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      now += IDEMPOTENCY_TTL - 1;
      const r = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      expect(r[0].status).toBe("PENDING");
    });

    it("should not serve cached response after TTL expires", () => {
      pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      now += IDEMPOTENCY_TTL;
      // Cache expired — request is re-processed, tx already exists
      const r = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      expect(r[0].status).toBe("IGNORED");
      expect(r[0].message).toBe("Transaction already exists");
    });

    it("should allow reuse of expired idempotency key without conflict", () => {
      pp.handle({ id: "tx1", type: "submit", idempotencyKey: "shared-key" });
      now += IDEMPOTENCY_TTL;
      // Key expired — different request with same key is not a conflict
      const r = pp.handle({ id: "tx2", type: "submit", idempotencyKey: "shared-key" });
      expect(r[0].status).toBe("PENDING");
      expect(r[0].id).toBe("tx2");
    });

    it("should evict expired entries on tick()", () => {
      pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      now += IDEMPOTENCY_TTL;
      pp.tick(); // evicts expired cache entry

      // Re-submit with same key — should be re-processed (not cached, not conflict)
      const r = pp.handle({ id: "tx1", type: "submit", idempotencyKey: "key1" });
      expect(r[0].status).toBe("IGNORED");
      expect(r[0].message).toBe("Transaction already exists");
    });
  });
});
