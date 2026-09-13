import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { ownershipScope } from "./ownership";
import { negotiations, preAnalyses, savedQuotes } from "../db/schema";
const advisor = { id: "123e4567-e89b-42d3-a456-426614174001", role: "advisor" };
describe("ownership scopes", () => {
  it.each([savedQuotes.creatorId, negotiations.ownerId, preAnalyses.partnerId])("limits each owner to the assessor or their managed users", owner => {
    const query = new PgDialect().sqlToQuery(ownershipScope(owner, advisor)!);
    expect(query.params).toEqual([advisor.id, advisor.id]);
    expect(query.sql).toContain('select managed.id from "users" as managed');
    expect(query.sql).toContain("managed.manager_id =");
    expect(query.sql).toContain("managed.role in ('user', 'partner')");
  });
  it("compiles advisor quote update and deletion without requiring an outer users join", () => {
    const db = drizzle.mock();
    const update = db.update(savedQuotes).set({ clientName: "Test" }).where(ownershipScope(savedQuotes.creatorId, advisor)).toSQL();
    const deletion = db.delete(savedQuotes).where(ownershipScope(savedQuotes.creatorId, advisor)).toSQL();
    for (const query of [update, deletion]) { expect(query.sql).not.toContain('"users"."manager_id"'); expect(query.params).toContain(advisor.id); }
  });
  it("keeps administrator visibility and ordinary users restricted to themselves", () => {
    expect(ownershipScope(savedQuotes.creatorId, { ...advisor, role: "admin" })).toBeUndefined();
    const query = new PgDialect().sqlToQuery(ownershipScope(savedQuotes.creatorId, { ...advisor, role: "user" })!);
    expect(query.params).toEqual([advisor.id]); expect(query.sql).not.toContain("managed");
  });
});
