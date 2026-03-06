import { describe, it, expect, beforeEach } from "vitest";
import { PaymentProcessor } from "@handler";

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

  it("should enforce global key uniqueness across different transactions", () => {
    pp.handle({ id: "tx1", type: "submit", idempotencyKey: "shared-key" });
    // Same key, different transaction — should return the original cached response
    const r = pp.handle({ id: "tx2", type: "submit", idempotencyKey: "shared-key" });
    expect(r[0].id).toBe("tx1");
    expect(r[0].status).toBe("PENDING");
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
});
