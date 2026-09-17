import { expect, it } from "vitest";
import { checklistText } from "./checklist";
import { administratorText } from "./administrator-text";
it("copies the configured checklist and explicit marked items", () => {
  const text = checklistText("MEI", ["SIMEI", "CNH/RG"], ["SIMEI"]);
  expect(text).toContain("Pessoa jurídica"); expect(text).toContain("☑ SIMEI"); expect(text).toContain("☐ CNH/RG");
});
it("shares administrator information without temporary private file URLs", () => {
  const text = administratorText({ id: "1", name: "A", characteristics: "Informações", website: "https://example.com", documents: [{ id: "2", name: "Contrato", url: "https://example.com/private?token=secret" }] });
  expect(text).toContain("Contrato"); expect(text).not.toContain("token");
});
