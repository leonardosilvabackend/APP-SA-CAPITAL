import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@shared/contracts";
import { updateSessionCache } from "./sessionCache";
const user: AuthenticatedUser = { id: "123e4567-e89b-42d3-a456-426614174000", name: "Teste", email: "test@example.invalid", role: "admin", managerId: null, status: "active", mustChangePassword: false };

describe("session cache transitions", () => {
  it("notifies the mounted session observer on login and logout while clearing private records", async () => {
    const client = new QueryClient();
    client.setQueryData(["current-user"], null);
    client.setQueryData(["saved-quotes"], ["private previous account"]);
    const original = client.getQueryCache().find({ queryKey: ["current-user"] });
    const observer = new QueryObserver<AuthenticatedUser | null>(client, { queryKey: ["current-user"], enabled: false });
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);
    try {
      await updateSessionCache(client, user);
      expect(client.getQueryCache().find({ queryKey: ["current-user"] })).toBe(original);
      expect(observer.getCurrentResult().data).toEqual(user);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ data: user }));
      expect(client.getQueryData(["saved-quotes"])).toBeUndefined();
      client.setQueryData(["users"], ["private current account"]);
      await updateSessionCache(client, null);
      expect(observer.getCurrentResult().data).toBeNull();
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ data: null }));
      expect(client.getQueryData(["users"])).toBeUndefined();
    } finally { unsubscribe(); client.clear(); }
  });
  it("prevents an older session request from replacing a successful login", async () => {
    const client = new QueryClient();
    let finish!: (value: null) => void;
    const pending = client.fetchQuery({ queryKey: ["current-user"], queryFn: () => new Promise<null>(resolve => { finish = resolve; }) }).catch(() => undefined);
    await updateSessionCache(client, user);
    finish(null); await pending;
    expect(client.getQueryData(["current-user"])).toEqual(user);
    client.clear();
  });
});
