import { pfIncomeTypes, pjIncomeTypes } from "./business";
export function checklistText(income: string, documents: string[], checked: string[] = [], customerType?:"PF"|"PJ") {
  const type = customerType==="PF" || (!customerType && pfIncomeTypes.includes(income)) ? "Pessoa física" : customerType==="PJ" || pjIncomeTypes.includes(income) ? "Pessoa jurídica" : "Pré-análise";
  return `CHECK-LIST SA CAPITAL\n${type} — ${income}\n\nDocumentos necessários:\n${documents.map(doc => `${checked.includes(doc) ? "☑" : "☐"} ${doc}`).join("\n")}\n\nDados: nome / razão social, CPF / CNPJ e tipo de renda.\nEnvio em PDF, JPG ou PNG pelo módulo Pré-análises.\nÉ necessária autorização do titular para enviar os documentos para pré-análise de crédito.`;
}
