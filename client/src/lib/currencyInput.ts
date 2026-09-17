export function currencyInputValue(text: string): number {
  return Number(text.replace(/[^\d,]/g, "").replace(",", "."));
}
export function currencyInputText(text: string): string {
  const clean = text.replace(/[^\d,]/g, "");
  if (!clean) return "";
  const [integer, decimal] = clean.split(",");
  const whole = (integer || "0").replace(/^0+(?=\d)/, "");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${clean.includes(",") ? `,${(decimal ?? "").slice(0,2)}` : ""}`;
}
