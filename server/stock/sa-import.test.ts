import { expect, it } from "vitest";
import { quotaInputSchema } from "../../shared/stock";
import { saImportSourceKey, saImportValues } from "./sa-import";

const row = quotaInputSchema.parse({ code: "SA-987", category: "imóveis", administrator: "Administradora", supplier: "Fornecedor SA", creditAmount: "24.709,00", entryAmount: "9.900,00", installmentCount: 10, installmentAmount: "500,00", outstandingBalance: "5.000,00" });

it("applies commercial adjustments using adjusted credit and preserves its source code", () => {
  expect(saImportValues(row)).toMatchObject({ sourceCode: "SA-987", category: "Imóvel", creditAmount: "24684.29", entryAmount: "10640.53", installmentAmount: "501.70", outstandingBalance: "5017.00" });
});

it("matches repeated source codes without case or surrounding spaces", () => {
  expect(saImportSourceKey("Fornecedor SA", " SA-987 ")).toBe(saImportSourceKey("fornecedor sa", "sa-987"));
});

it("calculates balance from adjusted installment instead of the spreadsheet balance", () => {
  expect(saImportValues({ ...row, creditAmount: 100000, entryAmount: 10000, installmentAmount: 1000, installmentCount: 48, outstandingBalance: 1 })).toMatchObject({ creditAmount: "99900.00", entryAmount: "12997.00", installmentAmount: "1001.70", outstandingBalance: "48081.60" });
});
