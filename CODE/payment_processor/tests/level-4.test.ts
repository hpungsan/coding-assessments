import { describe, it, expect, beforeEach } from "vitest";
import { PaymentProcessor } from "@handler";
import { STATE_TTLS } from "../src/config";

describe("Level 4 - Timeouts", () => {
  let now: number;
  let pp: PaymentProcessor;

  beforeEach(() => {
    now = 1_000_000;
    pp = new PaymentProcessor(() => now);
  });

  it("should not expire a transaction before its TTL", () => {
    pp.handle({ id: "tx1", type: "submit" });
    now += STATE_TTLS.PENDING! - 1;
    const signals = pp.tick();
    expect(signals).not.toContain("tx1:expired");
  });

  it("should expire a PENDING transaction at its TTL", () => {
    pp.handle({ id: "tx1", type: "submit" });
    now += STATE_TTLS.PENDING!;
    const signals = pp.tick();
    expect(signals).toContain("tx1:expired");
  });

  it("should use per-state TTL for AUTHORIZED", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    now += STATE_TTLS.AUTHORIZED!;
    const signals = pp.tick();
    expect(signals).toContain("tx1:expired");
  });

  it("should use per-state TTL for CAPTURED", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    now += STATE_TTLS.CAPTURED!;
    const signals = pp.tick();
    expect(signals).toContain("tx1:expired");
  });

  it("should use per-state TTL for SETTLED", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    now += STATE_TTLS.SETTLED!;
    const signals = pp.tick();
    expect(signals).toContain("tx1:expired");
  });

  it("should reset TTL on state transition", () => {
    pp.handle({ id: "tx1", type: "submit" });
    now += STATE_TTLS.PENDING! - 1; // almost expired
    pp.handle({ id: "tx1", type: "authorize" }); // resets timer
    now += STATE_TTLS.PENDING!; // past old TTL, but within AUTHORIZED TTL
    const signals = pp.tick();
    expect(signals).not.toContain("tx1:expired");
  });

  it("should free slot and promote queued transaction on expiry", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    pp.handle({ id: "tx5", type: "submit" }); // queued

    now += STATE_TTLS.PENDING!;
    const signals = pp.tick();

    // All 4 active expired, up to 4 queued can promote (only 1 queued)
    expect(signals).toContain("tx1:expired");
    expect(signals).toContain("tx5:promoted");
  });

  it("should expire multiple transactions in one tick", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx2", type: "submit" });
    now += STATE_TTLS.PENDING!;
    const signals = pp.tick();
    expect(signals).toContain("tx1:expired");
    expect(signals).toContain("tx2:expired");
  });

  it("should ignore transitions on expired transactions", () => {
    pp.handle({ id: "tx1", type: "submit" });
    now += STATE_TTLS.PENDING!;
    pp.tick();
    const r = pp.handle({ id: "tx1", type: "authorize" });
    expect(r[0].status).toBe("IGNORED");
  });

  it("should not expire a COMPLETED transaction", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    pp.handle({ id: "tx1", type: "complete" });
    now += 1_000_000; // well past any TTL
    const signals = pp.tick();
    expect(signals).not.toContain("tx1:expired");
  });

  it("should track separate TTL timers per transaction", () => {
    pp.handle({ id: "tx1", type: "submit" });
    now += 10_000;
    pp.handle({ id: "tx2", type: "submit" });

    // tx1 submitted at 1_000_000, tx2 at 1_010_000
    // PENDING TTL is 30_000
    now = 1_000_000 + STATE_TTLS.PENDING!; // 1_030_000
    const signals1 = pp.tick();
    expect(signals1).toContain("tx1:expired");
    expect(signals1).not.toContain("tx2:expired");

    now = 1_010_000 + STATE_TTLS.PENDING!; // 1_040_000
    const signals2 = pp.tick();
    expect(signals2).toContain("tx2:expired");
  });
});
