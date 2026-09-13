import { afterEach, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ config: { emailEnabled: true, resendApiKey: "test-only", resendFromEmail: "sender@example.invalid" } }));
import { sendStatusEmail } from "./email";
afterEach(() => vi.unstubAllGlobals());
it("retries transient errors with the same idempotency key", async () => {
  const request = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", request);
  await sendStatusEmail("Test", "target@example.invalid", "Subject", "Message");
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][1].headers["Idempotency-Key"]).toBe(request.mock.calls[1][1].headers["Idempotency-Key"]);
  expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it("reports rejected delivery instead of silently succeeding", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(sendStatusEmail("Test", "target@example.invalid", "Subject", "Message")).rejects.toThrow("403");
});
