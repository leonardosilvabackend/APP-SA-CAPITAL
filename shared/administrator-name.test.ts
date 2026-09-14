import { describe, expect, it } from "vitest";
import { normalizeAdministratorName, STANDARD_ADMINISTRATORS } from "./administrator-name";

describe("padronização de administradoras", () => {
  it.each(STANDARD_ADMINISTRATORS)("preserva o nome padrão %s", name => expect(normalizeAdministratorName(name)).toBe(name));
  it.each([
    ["CNP CONSORCIO", "CNP"], ["CNP Consórcios S/A", "CNP"], ["HS CONSÓRICO", "HS Consórcios"],
    ["hs consorcio - top", "HS Consórcios"], ["VOLKSWAGEM", "Volkswagen"], ["CAOA", "Caoa Consórcios"],
    ["Itau Consorcios", "Itaú"], ["Ancora", "Âncora"], ["BB CONSORCIOS", "Banco do Brasil"],
  ])("converte %s para %s", (input, expected) => expect(normalizeAdministratorName(input)).toBe(expected));
  it("mantém um nome desconhecido sem inventar correspondência", () => expect(normalizeAdministratorName("Nova Administradora")).toBe("Nova Administradora"));
});
