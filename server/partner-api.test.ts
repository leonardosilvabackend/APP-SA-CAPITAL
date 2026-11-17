import { describe, expect, it } from "vitest";
import { publicQuota } from "./partner-api";
const quota = { code: "SA1", category: "Veículos", administrator: "CAIXA", creditAmount: "100000", entryAmount: "40000", installmentCount: 100, installmentAmount: "900", outstandingBalance: "70000", status: "available", id: "x", externalId: "secret", supplier: "secret", reservationOrigin: null, featured: false, createdAt: new Date(), updatedAt: new Date() } as never;
describe("resposta pública do estoque", () => { it("soma comissão sobre o crédito", () => expect(publicQuota(quota, 2).entry).toBe(42000)); it("não expõe campos internos", () => expect(publicQuota(quota, 0)).not.toHaveProperty("supplier")); it("mantém entrada sem comissão", () => expect(publicQuota(quota, 0).entry).toBe(40000)); });
