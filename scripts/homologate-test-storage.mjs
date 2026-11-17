import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";

const settings = parse(await readFile(".env.test", "utf8"));
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET", "TEST_SUPABASE_PROJECT_REF"];
if (settings.APP_ENV !== "test" || settings.DATABASE_ENV !== "test") throw new Error("Homologação permitida somente no ambiente TEST.");
for (const key of required) if (!settings[key]) throw new Error(`Configure ${key} em .env.test com dados exclusivos do TEST.`);
if (!/^[a-z0-9]{20}$/.test(settings.TEST_SUPABASE_PROJECT_REF)) throw new Error("Identificador do projeto TEST inválido.");
if (!/^[a-z0-9-]+$/.test(settings.SUPABASE_BUCKET)) throw new Error("Nome do bucket TEST inválido.");
const url = new URL(settings.SUPABASE_URL);
if (url.protocol !== "https:" || url.hostname !== `${settings.TEST_SUPABASE_PROJECT_REF}.supabase.co` || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
  throw new Error("URL do Storage não corresponde ao projeto TEST explicitamente identificado.");
}

const client = createClient(url.href, settings.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
});
const { data: bucketInfo, error: bucketError } = await client.storage.getBucket(settings.SUPABASE_BUCKET);
if (bucketError || !bucketInfo) throw new Error(`Bucket TEST indisponível: ${bucketError?.message ?? "não encontrado"}`);
if (bucketInfo.public) throw new Error("O bucket TEST precisa ser privado para os arquivos da aplicação.");

const bucket = client.storage.from(settings.SUPABASE_BUCKET);
const objectPath = `homologation/${randomUUID()}.png`;
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y4hU9cAAAAASUVORK5CYII=", "base64");
let uploaded = false;
try {
  const upload = await bucket.upload(objectPath, image, { contentType: "image/png", upsert: false });
  if (upload.error) throw new Error(`Upload TEST falhou: ${upload.error.message}`);
  uploaded = true;
  const signed = await bucket.createSignedUrl(objectPath, 60);
  if (signed.error || !signed.data?.signedUrl) throw new Error(`URL assinada TEST falhou: ${signed.error?.message ?? "ausente"}`);
  const signedUrl = new URL(signed.data.signedUrl, url);
  if (signedUrl.protocol !== "https:" || signedUrl.hostname !== url.hostname) throw new Error("URL assinada saiu do projeto TEST.");
  const download = await fetch(signedUrl, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (download.status !== 200 || !Buffer.from(await download.arrayBuffer()).equals(image)) throw new Error(`Leitura da URL assinada TEST falhou: HTTP ${download.status}`);
  console.log("Storage TEST: bucket privado, upload e leitura por URL assinada aprovados.");
} finally {
  if (uploaded) {
    const removed = await bucket.remove([objectPath]);
    if (removed.error) throw new Error(`Falha ao remover o objeto de homologação TEST: ${removed.error.message}`);
    const afterRemoval = await bucket.download(objectPath);
    if (!afterRemoval.error) throw new Error("O objeto de homologação ainda está acessível após a remoção.");
    console.log("Storage TEST: objeto descartável removido e ausência confirmada.");
  }
}
