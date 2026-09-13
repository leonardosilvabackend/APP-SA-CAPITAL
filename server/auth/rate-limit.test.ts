import { expect, it } from "vitest";
import { consumeLimit } from "./rate-limit";
it("rejects attempts above the limit and recovers only after expiration", () => {
  const key = "test-limit";
  expect(consumeLimit(key, 2, 100)).toBe(true);
  expect(consumeLimit(key, 2, 101)).toBe(true);
  expect(consumeLimit(key, 2, 102)).toBe(false);
  expect(consumeLimit(key, 2, 900101)).toBe(true);
});
