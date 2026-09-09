export const stockSortOptions = [
  { value: "credit_asc", label: "Crédito: menor" },
  { value: "credit_desc", label: "Crédito: maior" },
  { value: "default", label: "Padrão" },
  { value: "entry_percent_asc", label: "Entrada: menor %" },
  { value: "entry_percent_desc", label: "Entrada: maior %" },
  { value: "entry_asc", label: "Entrada: menor R$" },
  { value: "entry_desc", label: "Entrada: maior R$" },
  { value: "installment_asc", label: "Parcela: menor valor" },
  { value: "installment_desc", label: "Parcela: maior valor" },
  { value: "term_asc", label: "Prazo: menor" },
  { value: "term_desc", label: "Prazo: maior" },
  { value: "balance_desc", label: "Saldo devedor: maior" },
  { value: "balance_asc", label: "Saldo devedor: menor" },
] as const;
export type StockSort = typeof stockSortOptions[number]["value"];
