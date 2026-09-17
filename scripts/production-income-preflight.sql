-- Somente leitura. Executar antes da migration 0013 com usuario autorizado.
-- Nenhuma credencial deve ser inserida neste arquivo.
BEGIN READ ONLY;
SELECT COUNT(*) AS analyses_without_known_requirements
FROM pre_analyses p
LEFT JOIN app_settings s ON s.id = 'default'
WHERE NOT COALESCE(s.income_documents ? p.income_type, false)
  AND p.income_type NOT IN ('Autônomo','Aposentado','CLT/Assalariado','Funcionário Público','Produtor Rural','Simples Nacional','LTDA','MEI');

SELECT COUNT(*) AS invalid_income_document_definitions
FROM app_settings s
CROSS JOIN LATERAL jsonb_each(s.income_documents) d
WHERE s.id = 'default'
  AND CASE WHEN jsonb_typeof(d.value) = 'array'
    THEN jsonb_array_length(d.value) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(d.value) AS doc(value)
      WHERE jsonb_typeof(doc.value) <> 'string'
        OR length(trim(doc.value #>> '{}')) = 0
        OR length(doc.value #>> '{}') > 100
    )
    ELSE true END;
COMMIT;
-- Ambos os resultados devem ser zero antes de autorizar a migration.
-- Caso contrario, revisar requisitos historicos em homologacao sem inventar documentos.
