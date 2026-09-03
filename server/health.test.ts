import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "../shared/contracts";

describe("contrato de saúde da aplicação", () => {
  it("aceita uma resposta válida", () => {
    const result = healthResponseSchema.parse({ status: "ok", app: "SA-CAPITAL-APP", timestamp: new Date().toISOString(), databaseConfigured: false });
    expect(result.status).toBe("ok");
  });
});
