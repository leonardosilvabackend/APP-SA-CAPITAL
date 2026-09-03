UPDATE "users" SET "role" = 'user' WHERE "role" = 'partner';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
UPDATE "pre_analyses" SET "status" = 'received' WHERE "status" = 'draft';
INSERT INTO "app_settings" ("id", "income_documents") VALUES (
  'default',
  '{"Autônomo":["CNH/RG","IRPF","Notas Fiscais","Extratos","Contrato de Aluguel","RPA"],"Aposentado":["3 últimos pagamentos do benefício","Carta de concessão","CNH/RG"],"CLT/Assalariado":["CNH/RG","3 últimos contracheques","CTPS","FGTS"],"Funcionário Público":["3 últimos contracheques","CNH/RG","IRPF"],"Produtor Rural":["IRPF","CNH/RG","NF de produtor rural","Extratos bancários dos últimos 6 meses"],"Simples Nacional":["CNPJ","PGDAS dos últimos 12 meses","CNH/RG do sócio"],"LTDA":["Balanço patrimonial dos últimos 2 anos","DRE dos últimos 2 anos","Faturamento dos últimos 12 meses","Balancete do ano vigente","CNPJ","Contrato social","CNH/RG dos sócios"],"MEI":["SIMEI dos últimos 12 meses","CNH/RG do sócio"]}'::jsonb
) ON CONFLICT ("id") DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 26214400, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = false;
