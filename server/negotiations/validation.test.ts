import { describe, expect, it } from "vitest";
import { canEditNegotiation, cents, paymentInputSchema, paymentTotals, updateNegotiationSchema } from "../../shared/negotiations";

describe("negotiation amounts and permissions", () => {
  it("subtracts every signal and settlement in cents", () => {
    expect(paymentTotals("100.30", [{ kind: "signal", amount: "0.10" }, { kind: "signal", amount: "0.20" }, { kind: "payment", amount: "100.00" }]))
      .toEqual({ paidAmount: "100.30", signalAmount: "0.30", remainingAmount: "0.00" });
    expect(cents("-0.50")).toBe(-50);
  });
  it("rejects negative amounts and fractional cents", () => {
    const valid = { version: 0, status: "awaiting_data", entryAmount: "100.00", transferFee: "0", registrationFee: "0", commissionAmount: "0" };
    for (const entryAmount of ["-1", "1.001", "NaN", "1e4", ""]) expect(updateNegotiationSchema.safeParse({ ...valid, entryAmount }).success).toBe(false);
    expect(updateNegotiationSchema.safeParse(valid).success).toBe(true);
  });
  it("requires positive payments and a timezone on the payment date", () => {
    const valid = { id: crypto.randomUUID(), version: 0, kind: "signal", amount: "1.00", paidAt: "2026-09-05T15:30:00-03:00" };
    expect(paymentInputSchema.safeParse(valid).success).toBe(true);
    expect(paymentInputSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ ...valid, paidAt: "2026-09-05T15:30" }).success).toBe(false);
  });
  it("grants write access only to the three authorized roles", () => {
    for (const role of ["admin", "advisor", "administrative"]) expect(canEditNegotiation(role)).toBe(true);
    for (const role of ["user", "partner"]) expect(canEditNegotiation(role)).toBe(false);
  });
});
