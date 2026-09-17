ALTER TABLE "app_settings" ADD COLUMN "income_types" jsonb;--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "required_documents_snapshot" jsonb;
--> statement-breakpoint
UPDATE "pre_analyses" AS p SET "required_documents_snapshot" = COALESCE(
  (SELECT s."income_documents" -> p."income_type" FROM "app_settings" s WHERE s."id" = 'default'),
  '{"Autônomo":["CNH/RG","IRPF","Notas Fiscais","Extratos","Contrato de Aluguel","RPA"],"Aposentado":["3 últimos pagamentos do benefício","Carta de concessão","CNH/RG"],"CLT/Assalariado":["CNH/RG","3 últimos contracheques","CTPS","FGTS"],"Funcionário Público":["3 últimos contracheques","CNH/RG","IRPF"],"Produtor Rural":["IRPF","CNH/RG","NF de produtor rural","Extratos bancários dos últimos 6 meses"],"Simples Nacional":["CNPJ","PGDAS dos últimos 12 meses","CNH/RG do sócio"],"LTDA":["Balanço patrimonial dos últimos 2 anos","DRE dos últimos 2 anos","Faturamento dos últimos 12 meses","Balancete do ano vigente","CNPJ","Contrato social","CNH/RG dos sócios"],"MEI":["SIMEI dos últimos 12 meses","CNH/RG do sócio"]}'::jsonb -> p."income_type"
) WHERE p."required_documents_snapshot" IS NULL;
