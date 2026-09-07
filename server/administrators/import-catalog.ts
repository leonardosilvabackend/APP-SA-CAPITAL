import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { config } from "../config";
import { administratorInputSchema } from "../../shared/administrators";

// Import only missing names; never overwrite information edited in the app.
const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/consorcios?/g, "");
if (!config.databaseUrl) throw new Error("Banco não configurado");
const client = postgres(config.databaseUrl, { prepare: false, connect_timeout: 15 });
try {
  const catalog = JSON.parse(await readFile(new URL("./catalog.json", import.meta.url), "utf8")).map((item: unknown) => administratorInputSchema.parse(item));
  await client.begin(async sql => {
    await sql`LOCK TABLE administrators IN SHARE ROW EXCLUSIVE MODE`;
    const existing = await sql`SELECT name FROM administrators`;
    const names = new Set(existing.map(row => normalize(row.name)));
    for (const item of catalog) {
      if (names.has(normalize(item.name))) { console.log(`Já cadastrada: ${item.name}`); continue; }
      await sql`INSERT INTO administrators (name, characteristics, website) VALUES (${item.name}, ${item.characteristics}, ${item.website || null})`;
      names.add(normalize(item.name));
      console.log(`Inserida: ${item.name}`);
    }
  });
} finally {
  await client.end();
}
