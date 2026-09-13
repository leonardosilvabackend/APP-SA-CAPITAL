import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config";
import * as schema from "./schema";
import { assertDatabaseSafety } from "../environment";

let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  assertDatabaseSafety();
  if (!database) {
    const client = postgres(config.databaseUrl, { prepare: false, max: 10, connect_timeout: 5, connection: { statement_timeout: 15000 } });
    database = drizzle(client, { schema });
  }
  return database;
}
