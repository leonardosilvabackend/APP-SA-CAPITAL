import { eq } from "drizzle-orm";
import { DEFAULT_USER_PASSWORD } from "../../shared/contracts";
import { hashPassword } from "../auth/password";
import { assertDatabaseSafety, environment } from "../environment";
import { getDatabase } from "./client";
import { users, quotas } from "./schema";
assertDatabaseSafety();
if (environment.appEnv !== "test") throw new Error("Dados demonstrativos permitidos somente em TEST.");
const db = getDatabase()!;
const passwordHash = await hashPassword(DEFAULT_USER_PASSWORD);
const accounts = [
  { name: "Administrador Teste", email: "admin@sa-capital.test", role: "admin" as const },
  { name: "Assessor Teste", email: "assessor@sa-capital.test", role: "advisor" as const },
];
for (const account of accounts) await db.insert(users).values({ ...account, passwordHash, mustChangePassword: false }).onConflictDoNothing({ target: users.email });
const [advisor] = await db.select().from(users).where(eq(users.email, "assessor@sa-capital.test"));
await db.insert(users).values({ name: "Usuário Teste", email: "usuario@sa-capital.test", role: "user", managerId: advisor.id, passwordHash, mustChangePassword: false }).onConflictDoNothing({ target: users.email });
await db.insert(quotas).values(Array.from({ length: 6 }, (_, index) => ({
  code: `TESTE-${String(index + 1).padStart(3, "0")}`, category: index < 3 ? "Imóvel" : "Veículo", administrator: "Administradora Fictícia", supplier: "Dados de demonstração",
  creditAmount: String((index + 1) * 50000), entryAmount: String((index + 1) * 10000), installmentCount: 100,
  installmentAmount: String((index + 1) * 500), outstandingBalance: String((index + 1) * 50000), status: "available" as const,
}))).onConflictDoNothing({ target: quotas.code });
console.log("Contas e cotas fictícias preparadas no banco TEST.");
process.exit(0);
