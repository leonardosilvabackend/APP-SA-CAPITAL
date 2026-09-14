import { expect, it } from "vitest";
import { quotaInputSchema } from "../../shared/stock";
import { saImportSourceKey, saImportValues } from "./sa-import";

const row = quotaInputSchema.parse({ code: "SA-987", category: "imóveis", administrator: "Administradora", supplier: "Fornecedor SA", creditAmount: "24.709,00", entryAmount: "9.900,00", installmentCount: 10, installmentAmount: "500,00", outstandingBalance: "5.000,00" });

it("adds three percent of credit to the spreadsheet entry and preserves its source code", () => {
  expect(saImportValues(row)).toMatchObject({ sourceCode: "SA-987", category: "Imóvel", creditAmount: "24709.00", entryAmount: "10641.27" });
});

it("matches repeated source codes without case or surrounding spaces", () => {
  expect(saImportSourceKey("Fornecedor SA", " SA-987 ")).toBe(saImportSourceKey("fornecedor sa", "sa-987"));
});
