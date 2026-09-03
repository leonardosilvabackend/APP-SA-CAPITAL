import { z } from "zod";

function parseBrazilianNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  let normalized = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

const positiveMoney = z.preprocess(parseBrazilianNumber, z.number().finite().nonnegative("O valor não pode ser negativo"));
const positiveInteger = z.preprocess(value => typeof value === "string" ? Number(value.trim()) : value, z.number().int().positive("Informe uma quantidade válida"));

export const quotaStatusSchema = z.enum(["available", "reserved"]);

export const quotaInputSchema = z.object({
  code: z.string().trim().min(1, "Informe o código").max(80),
  category: z.string().trim().min(1, "Informe a categoria").max(80),
  administrator: z.string().trim().min(1, "Informe a administradora").max(160),
  supplier: z.string().trim().max(160).optional().nullable().transform(value => value || null),
  creditAmount: positiveMoney,
  entryAmount: positiveMoney,
  installmentCount: positiveInteger,
  installmentAmount: positiveMoney,
  outstandingBalance: positiveMoney,
  status: quotaStatusSchema.default("available"),
  featured: z.boolean().default(false),
});

export const quotaUpdateSchema = quotaInputSchema.partial().refine(value => Object.keys(value).length > 0, "Informe ao menos uma alteração");
export const quotaImportSchema = z.object({ rows: z.array(z.unknown()).min(1).max(20000), mode: z.enum(["add", "replace"]).default("add") });
export type QuotaInput = z.infer<typeof quotaInputSchema>;

export function validateImportRows(rows: unknown[]) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const parsed = quotaInputSchema.safeParse(row);
    if (!parsed.success) return { row: index + 2, valid: false as const, error: parsed.error.issues.map(issue => issue.message).join("; ") };
    const normalizedCode = parsed.data.code.toLocaleLowerCase("pt-BR");
    if (seen.has(normalizedCode)) return { row: index + 2, valid: false as const, error: `Código duplicado na planilha: ${parsed.data.code}` };
    seen.add(normalizedCode);
    return { row: index + 2, valid: true as const, data: parsed.data };
  });
}
