import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("mantém a entrada pública da SA Capital na autenticação", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  expect(source).not.toContain("LandingPage");
  expect(source).toContain("if (!me.data) return <AuthPage");
});
