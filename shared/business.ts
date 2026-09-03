export const defaultIncomeDocuments: Record<string, string[]> = {
  "Autônomo": ["CNH/RG", "IRPF", "Notas Fiscais", "Extratos", "Contrato de Aluguel", "RPA"],
  "Aposentado": ["3 últimos pagamentos do benefício", "Carta de concessão", "CNH/RG"],
  "CLT/Assalariado": ["CNH/RG", "3 últimos contracheques", "CTPS", "FGTS"],
  "Funcionário Público": ["3 últimos contracheques", "CNH/RG", "IRPF"],
  "Produtor Rural": ["IRPF", "CNH/RG", "NF de produtor rural", "Extratos bancários dos últimos 6 meses"],
  "Simples Nacional": ["CNPJ", "PGDAS dos últimos 12 meses", "CNH/RG do sócio"],
  "LTDA": ["Balanço patrimonial dos últimos 2 anos", "DRE dos últimos 2 anos", "Faturamento dos últimos 12 meses", "Balancete do ano vigente", "CNPJ", "Contrato social", "CNH/RG dos sócios"],
  "MEI": ["SIMEI dos últimos 12 meses", "CNH/RG do sócio"],
};
export const pfIncomeTypes = ["Autônomo", "Aposentado", "CLT/Assalariado", "Funcionário Público", "Produtor Rural"];
export const pjIncomeTypes = ["Simples Nacional", "LTDA", "MEI"];
export const legalNotice = "A SA CAPITAL se isenta de qualquer responsabilidade sobre alteração de valores, fica a responsabilidade do parceiro verificar junto ao seu assessor os valores atualizados antes de qualquer negociação.";
