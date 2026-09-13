import { expect, it } from "vitest";
import { acquireSmartCapacity, smartCapacity, shareSmartWork } from "./smart-capacity";
it("rejects overload and releases capacity idempotently", () => {
  const first = acquireSmartCapacity()!, second = acquireSmartCapacity()!;
  expect(acquireSmartCapacity()).toBeNull();
  first(); first();
  expect(smartCapacity().active).toBe(1);
  second();
  expect(smartCapacity().active).toBe(0);
});
it("shares identical in-flight work but never reuses a completed snapshot", async () => {
  let calls = 0, release!: () => void;
  const first = shareSmartWork("same", async () => { calls++; await new Promise<void>(resolve => { release = resolve; }); return 42; })!;
  const second = shareSmartWork("same", async () => { calls++; return 0; });
  await Promise.resolve();
  expect(second).toBe(first); expect(calls).toBe(1);
  release(); expect(await second).toBe(42);
  expect(await shareSmartWork("same", async () => ++calls)).toBe(2);
  await expect(shareSmartWork("failure", async () => { throw new Error("failure"); })).rejects.toThrow();
  expect(smartCapacity().active).toBe(0);
});
