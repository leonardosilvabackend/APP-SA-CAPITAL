import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as any, session: { userId: "user", sessionVersion: 1 } as any }));
vi.mock("./session", () => ({ getSessionToken: () => "cookie", readSessionToken: async () => state.session }));
vi.mock("../db/client", () => ({ getDatabase: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => state.user ? [state.user] : [] }) }) }) }) }));
import { getCurrentUser, PasswordChangeRequiredError } from "./current-user";
beforeEach(() => { state.user = { id: "user", status: "active", sessionVersion: 1, mustChangePassword: true }; state.session = { userId: "user", sessionVersion: 1 }; });
it("blocks API access while the initial password remains active", async () => {
  await expect(getCurrentUser({} as any)).rejects.toBeInstanceOf(PasswordChangeRequiredError);
});
it("allows session inspection and password change explicitly", async () => {
  expect(await getCurrentUser({} as any, { allowPasswordChange: true })).toEqual(state.user);
});
it("rejects old sessions even on the password-change path", async () => {
  state.user.sessionVersion++;
  expect(await getCurrentUser({} as any, { allowPasswordChange: true })).toBeNull();
});
it("allows normal access only after the mandatory change", async () => {
  state.user.mustChangePassword = false;
  expect(await getCurrentUser({} as any)).toEqual(state.user);
});
