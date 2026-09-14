import { expect, it } from "vitest";
import { quoteQuotaAvailability } from "./availability";

const selected = [{ id: "one", code: "100001" }, { id: "two", code: "100002" }, { id: "three", code: "100003" }, { id: "four", code: "100004" }] as any;

it("reports each saved quota status without changing its snapshot", () => {
  expect(quoteQuotaAvailability(selected, [
    { id: "one", code: "100001", status: "available", committed: false },
    { id: "two", code: "100002", status: "reserved", committed: false },
    { id: "three", code: "100003", status: "sold", committed: false },
  ])).toEqual([
    { id: "one", code: "100001", status: "available" },
    { id: "two", code: "100002", status: "reserved" },
    { id: "three", code: "100003", status: "sold" },
    { id: "four", code: "100004", status: "unavailable" },
  ]);
});

it("reports an actively negotiated quota as reserved even if its stock status is inconsistent", () => {
  expect(quoteQuotaAvailability(selected.slice(0, 1), [{ id: "one", code: "100001", status: "available", committed: true }])[0].status).toBe("reserved");
});
