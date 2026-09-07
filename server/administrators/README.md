# Catálogo de administradoras

`catalog.json` contém as 18 administradoras e os textos fornecidos pelo usuário, sem revisão das regras comerciais. Os links preenchidos foram localizados nos sites oficiais; logos e links não confirmados foram omitidos.

Execute `npm run db:import-administrators` com `DATABASE_URL` configurada para inserir os registros faltantes. A importação usa uma transação e compara nomes sem acentos, pontuação e o termo “consórcio(s)”. Registros existentes não são alterados. O script não precisa de credenciais de armazenamento.

A edição na interface permite alterar nome, características e site, substituir a logo e acrescentar documentos, preservando os anexos existentes. Apenas usuários administradores podem cadastrar ou editar.
