import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth/password";

describe("senhas", () => {
  it("gera hashes únicos e valida somente a senha correta", async () => {
    const first = await hashPassword("uma-senha-segura");
    const second = await hashPassword("uma-senha-segura");
    expect(first).not.toBe(second);
    await expect(verifyPassword("uma-senha-segura", first)).resolves.toBe(true);
    await expect(verifyPassword("senha-incorreta", first)).resolves.toBe(false);
  });
});
