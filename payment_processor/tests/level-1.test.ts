import { describe, it, expect, beforeEach } from "vitest";
import { PaymentProcessor } from "@handler";

describe("Level 1 - Ordered Transitions", () => {
  let pp: PaymentProcessor;

  beforeEach(() => {
    pp = new PaymentProcessor();
  });

  it("should complete a full happy-path lifecycle", () => {
    const r1 = pp.handle({ id: "tx1", type: "submit" });
    expect(r1).toEqual([{ id: "tx1", status: "PENDING", message: expect.any(String) }]);

    const r2 = pp.handle({ id: "tx1", type: "authorize" });
    expect(r2).toEqual([{ id: "tx1", status: "AUTHORIZED", message: expect.any(String) }]);

    const r3 = pp.handle({ id: "tx1", type: "capture" });
    expect(r3).toEqual([{ id: "tx1", status: "CAPTURED", message: expect.any(String) }]);

    const r4 = pp.handle({ id: "tx1", type: "settle" });
    expect(r4).toEqual([{ id: "tx1", status: "SETTLED", message: expect.any(String) }]);

    const r5 = pp.handle({ id: "tx1", type: "complete" });
    expect(r5).toEqual([{ id: "tx1", status: "COMPLETED", message: expect.any(String) }]);
  });

  it("should ignore authorize before submit", () => {
    const r = pp.handle({ id: "tx1", type: "authorize" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore capture before authorize", () => {
    pp.handle({ id: "tx1", type: "submit" });
    const r = pp.handle({ id: "tx1", type: "capture" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore settle before capture", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    const r = pp.handle({ id: "tx1", type: "settle" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore complete before settle", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    const r = pp.handle({ id: "tx1", type: "complete" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore duplicate submit for an active transaction", () => {
    pp.handle({ id: "tx1", type: "submit" });
    const r = pp.handle({ id: "tx1", type: "submit" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should handle two independent transactions", () => {
    const r1 = pp.handle({ id: "tx1", type: "submit" });
    const r2 = pp.handle({ id: "tx2", type: "submit" });
    expect(r1[0].status).toBe("PENDING");
    expect(r2[0].status).toBe("PENDING");

    const r3 = pp.handle({ id: "tx2", type: "authorize" });
    expect(r3[0].status).toBe("AUTHORIZED");

    const r4 = pp.handle({ id: "tx1", type: "authorize" });
    expect(r4[0].status).toBe("AUTHORIZED");
  });

  it("should ignore unknown action types", () => {
    pp.handle({ id: "tx1", type: "submit" });
    const r = pp.handle({ id: "tx1", type: "refund" as any });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore actions on a completed transaction", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    pp.handle({ id: "tx1", type: "complete" });

    const r = pp.handle({ id: "tx1", type: "authorize" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });

  it("should ignore re-submit of a completed transaction", () => {
    pp.handle({ id: "tx1", type: "submit" });
    pp.handle({ id: "tx1", type: "authorize" });
    pp.handle({ id: "tx1", type: "capture" });
    pp.handle({ id: "tx1", type: "settle" });
    pp.handle({ id: "tx1", type: "complete" });

    const r = pp.handle({ id: "tx1", type: "submit" });
    expect(r).toEqual([{ id: "tx1", status: "IGNORED", message: expect.any(String) }]);
  });
});
