import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Separate credentials, never .env/.env.production or the application's config.
const settings = parse(readFileSync('.env.homologation', 'utf8'));
const required = ['TEST_SUPABASE_PROJECT_REF', 'PRODUCTION_SUPABASE_PROJECT_REF', 'TEST_SUPABASE_URL', 'TEST_SUPABASE_SERVICE_ROLE_KEY', 'TEST_STORAGE_BUCKET', 'TEST_RESEND_API_KEY', 'TEST_EMAIL_FROM', 'TEST_EMAIL_TO', 'TEST_EMAIL_ALLOWLIST'];
for (const key of required) if (!settings[key]) throw new Error(`Configure ${key} no arquivo exclusivo de homologacao`);
if (settings.APP_ENV !== 'test') throw new Error('Somente TEST');
const url = new URL(settings.TEST_SUPABASE_URL);
if (url.protocol !== 'https:' || url.hostname !== `${settings.TEST_SUPABASE_PROJECT_REF}.supabase.co` || settings.TEST_SUPABASE_PROJECT_REF === settings.PRODUCTION_SUPABASE_PROJECT_REF || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Projeto Storage TEST invalido ou igual a producao');
if (!settings.TEST_EMAIL_ALLOWLIST.split(',').map(x => x.trim()).includes(settings.TEST_EMAIL_TO) || /[,;\r\n]/.test(settings.TEST_EMAIL_TO)) throw new Error('Destinatario fora da lista de homologacao');
if (!/^[a-z0-9-]+$/.test(settings.TEST_STORAGE_BUCKET)) throw new Error('Bucket invalido');
if (!process.argv.includes('--execute')) {
  console.log('Configuracao validada sem chamadas externas. Confira os recursos TEST antes de usar --execute.');
  process.exit(0);
}
if (settings.CONFIRM_TEST_SERVICES !== 'only-isolated-test-resources') throw new Error('Confirme a propriedade dos recursos TEST antes de executar');
const client = createClient(url.href, settings.TEST_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
const bucket = settings.TEST_STORAGE_BUCKET, object = `phase2-check/${crypto.randomUUID()}.pdf`, content = Buffer.from('%PDF-1.4\nSA Capital TEST only\n%%EOF');
const storage = client.storage.from(bucket);
const info = await client.storage.getBucket(bucket);
if (info.error || info.data.public) throw new Error('Bucket deve existir e ser privado; nenhum recurso sera criado automaticamente');
let uploaded = false;
try {
  const upload = await storage.upload(object, content, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error('Upload TEST falhou');
  uploaded = true;
  const anonymous = await fetch(`${url.origin}/storage/v1/object/public/${bucket}/${object}`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (anonymous.ok) throw new Error('Falha de privacidade: arquivo acessivel sem assinatura');
  const signed = await storage.createSignedUrl(object, 60);
  if (signed.error) throw new Error('Assinatura TEST falhou');
  const signedUrl = new URL(signed.data.signedUrl);
  if (signedUrl.origin !== url.origin) throw new Error('URL assinada fora do projeto TEST');
  const download = await fetch(signedUrl, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!download.ok || !Buffer.from(await download.arrayBuffer()).equals(content)) throw new Error('Download TEST divergente');
  const email = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${settings.TEST_RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ from: settings.TEST_EMAIL_FROM, to: settings.TEST_EMAIL_TO, subject: 'SA Capital TEST — homologacao', text: 'Mensagem ficticia de homologacao. Confirme recebimento e pasta de spam na caixa TEST.' }), signal: AbortSignal.timeout(10000) });
  if (!email.ok) throw new Error(`Envio TEST recusado: HTTP ${email.status}`);
  console.log('Storage privado: upload e download conferidos. Email aceito pela API; recebimento e expiracao do link exigem conferencia adicional.');
} finally {
  if (uploaded) { const removal = await storage.remove([object]); if (removal.error) throw new Error(`Limpeza TEST pendente: ${object}`); }
}
