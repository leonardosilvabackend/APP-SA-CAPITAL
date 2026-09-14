export const STANDARD_ADMINISTRATORS = [
  "Ademicon", "Âncora", "Banco do Brasil", "Banrisul", "Bradesco", "Caixa", "Caoa Consórcios", "CNP", "Disal", "Embracon", "Gazin", "HS Consórcios", "Itaú", "Magalu", "MyCon", "Porto Seguro", "Primo Rossi", "Racon", "RCI", "Rodobens", "Santander", "Serello", "Servopa", "Sicoob", "Sicredi", "Spengler", "Sponchiado", "Tradição", "Unicoob", "Volkswagen", "Yamaha", "Zema",
] as const;

export function administratorKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const aliases = new Map<string, string>();
for (const name of STANDARD_ADMINISTRATORS) {
  const key = administratorKey(name);
  for (const alias of [key, `${key} consorcio`, `${key} consorcios`, `consorcio ${key}`, `consorcios ${key}`]) aliases.set(alias, name);
}
for (const [alias, name] of Object.entries({
  ancora: "Âncora", bb: "Banco do Brasil", "bb consorcios": "Banco do Brasil", "banco brasil": "Banco do Brasil",
  "caixa economica": "Caixa", "caixa economica federal": "Caixa", caoa: "Caoa Consórcios", cnpg: "CNP",
  hs: "HS Consórcios", "hs consorico": "HS Consórcios", "hs consorcio": "HS Consórcios", itau: "Itaú",
  "porto": "Porto Seguro", "porto consorcio": "Porto Seguro", "rci brasil": "RCI", "volkswagem": "Volkswagen",
})) aliases.set(alias, name);

export function normalizeAdministratorName(value: string) {
  const trimmed = value.trim();
  const key = administratorKey(trimmed);
  const direct = aliases.get(key);
  if (direct) return direct;
  if (key.startsWith("cnp ")) return "CNP";
  if (key.startsWith("hs ")) return "HS Consórcios";
  return trimmed;
}
