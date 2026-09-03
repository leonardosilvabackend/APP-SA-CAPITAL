import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  if (!config.databaseUrl) return null;
  if (!database) {
    const client = postgres(config.databaseUrl, { prepare: false });
    database = drizzle(client, { schema });
  }
  return database;
}
