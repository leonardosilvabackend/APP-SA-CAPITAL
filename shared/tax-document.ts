export function validTaxDocument(value: string, kind: "PF" | "PJ") {
  if (!/^\d+$/.test(value) || /^(\d)\1+$/.test(value) || value.length !== (kind === "PF" ? 11 : 14)) return false;
  const digits = [...value].map(Number);
  const check = (base: number[], weights: number[]) => {
    const remainder = base.reduce((total, digit, i) => total + digit * weights[i], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (kind === "PF") return digits[9] === check(digits.slice(0, 9), [10,9,8,7,6,5,4,3,2]) && digits[10] === check(digits.slice(0, 10), [11,10,9,8,7,6,5,4,3,2]);
  return digits[12] === check(digits.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) && digits[13] === check(digits.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
}
