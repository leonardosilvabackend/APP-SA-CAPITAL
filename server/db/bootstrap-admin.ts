import { count, sql } from "drizzle-orm";
import { setupAdminInputSchema } from "../../shared/contracts";
import { hashPassword } from "../auth/password";
import { assertDatabaseSafety } from "../environment";
import { getDatabase } from "./client";
import { users } from "./schema";

assertDatabaseSafety();
// Read credentials from stdin so no password is put in arguments, environment examples or logs.
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 4096) throw new Error("Dados de cadastro acima do limite.");
}
const data = setupAdminInputSchema.parse(JSON.parse(input));
await getDatabase()!.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73622481)`);
  const [result] = await tx.select({ value: count() }).from(users);
  if (result.value) throw new Error("Cadastro inicial já realizado.");
  await tx.insert(users).values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password), role: "admin", status: "active" });
});
console.log("Administrador inicial provisionado.");
process.exit(0);
