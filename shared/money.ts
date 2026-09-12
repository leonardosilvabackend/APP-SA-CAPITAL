// Decimal arithmetic; ties round away from zero. Public numbers are only presentation values.
export function moneyCents(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Valor monetario invalido");
  const fraction = match[3] ?? "";
  const magnitude = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0")) + (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n);
  return match[1] ? -magnitude : magnitude;
}
export function roundRatio(value: bigint, numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new Error("Divisor invalido");
  const product = value * numerator, absolute = product < 0n ? -product : product;
  const rounded = (absolute + denominator / 2n) / denominator;
  return product < 0n ? -rounded : rounded;
}
export function moneyNumber(cents: bigint) {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Total monetario excede a faixa segura");
  return Number(cents) / 100;
}
export function sumMoney(values: (string | number)[]) { return values.reduce((total, value) => total + moneyCents(value), 0n); }
