import { describe, it, expect, beforeEach } from "vitest";
import { PaymentProcessor } from "@handler";

function completeTx(pp: PaymentProcessor, id: string) {
  pp.handle({ id, type: "submit" });
  pp.handle({ id, type: "authorize" });
  pp.handle({ id, type: "capture" });
  pp.handle({ id, type: "settle" });
  return pp.handle({ id, type: "complete" });
}

describe("Level 2 - Capacity Limits", () => {
  let pp: PaymentProcessor;

  beforeEach(() => {
    pp = new PaymentProcessor();
  });

  it("should allow 4 active transactions simultaneously", () => {
    for (let i = 1; i <= 4; i++) {
      const r = pp.handle({ id: `tx${i}`, type: "submit" });
      expect(r[0].status).toBe("PENDING");
    }
  });

  it("should queue the 5th transaction", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    const r = pp.handle({ id: "tx5", type: "submit" });
    expect(r).toEqual([{ id: "tx5", status: "QUEUED", message: expect.any(String) }]);
  });

  it("should promote queued transaction when a slot opens", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    pp.handle({ id: "tx5", type: "submit" }); // queued

    // Complete tx1 to free a slot
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    const r = pp.handle({ id: "tx1", type: "complete" });

    // Should return both tx1 COMPLETED and tx5 PENDING
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: "tx1", status: "COMPLETED", message: expect.any(String) });
    expect(r[1]).toEqual({ id: "tx5", status: "PENDING", message: expect.any(String) });
  });

  it("should promote in FIFO order", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    pp.handle({ id: "tx5", type: "submit" });
    pp.handle({ id: "tx6", type: "submit" });

    // Complete tx1
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    const r1 = pp.handle({ id: "tx1", type: "complete" });
    expect(r1[1].id).toBe("tx5");

    // Complete tx2
    pp.handle({ id: "tx2", type: "authorize" });
    pp.handle({ id: "tx2", type: "capture" });
    pp.handle({ id: "tx2", type: "settle" });
    const r2 = pp.handle({ id: "tx2", type: "complete" });
    expect(r2[1].id).toBe("tx6");
  });

  it("should ignore duplicate submit while queued", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    pp.handle({ id: "tx5", type: "submit" });
    const r = pp.handle({ id: "tx5", type: "submit" });
    expect(r).toEqual([{ id: "tx5", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore non-submit operations on queued transactions", () => {
    for (let i = 1; i <= 4; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    pp.handle({ id: "tx5", type: "submit" });
    const r = pp.handle({ id: "tx5", type: "authorize" });
    expect(r).toEqual([{ id: "tx5", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should queue multiple transactions and promote them one by one", () => {
    for (let i = 1; i <= 6; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }

    // Complete tx1 — promotes tx5
    const r1 = completeTx(pp, "tx1");
    expect(r1).toHaveLength(2);
    expect(r1[1].id).toBe("tx5");

    // Complete tx2 — promotes tx6
    const r2 = completeTx(pp, "tx2");
    expect(r2).toHaveLength(2);
    expect(r2[1].id).toBe("tx6");

    // Complete tx3 — nothing to promote
    const r3 = completeTx(pp, "tx3");
    expect(r3).toHaveLength(1);
  });

  it("should allow normal transitions on the first 4 transactions", () => {
    for (let i = 1; i <= 5; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    const r = pp.handle({ id: "tx2", type: "authorize" });
    expect(r[0].status).toBe("AUTHORIZED");
  });

  it("should not promote when non-terminal operations occur", () => {
    for (let i = 1; i <= 5; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    const r = pp.handle({ id: "tx1", type: "authorize" });
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("AUTHORIZED");
  });

  it("should handle completing all 4 active and promoting 4 queued", () => {
    for (let i = 1; i <= 8; i++) {
      pp.handle({ id: `tx${i}`, type: "submit" });
    }
    // tx1-4 active, tx5-8 queued

    for (let i = 1; i <= 4; i++) {
      const r = completeTx(pp, `tx${i}`);
      expect(r).toHaveLength(2);
      expect(r[1].id).toBe(`tx${i + 4}`);
    }
  });
});
