import { expect, it, vi } from "vitest";
import { readinessProbe } from "./observability";
it("bounds readiness latency without accumulating blocked database probes", async () => {
  const check = vi.fn(() => new Promise(() => {}));
  const probe = readinessProbe(check, 10);
  const results = await Promise.allSettled([probe(), probe(), probe()]);
  expect(results.every(result => result.status === "rejected")).toBe(true);
  expect(check).toHaveBeenCalledOnce();
});
