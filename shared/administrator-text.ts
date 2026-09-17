import type { Administrator } from "./administrators";
export function administratorText(item: Administrator) {
  return `ADMINISTRADORA: ${item.name}\n\n${item.characteristics}${item.website ? `\n\nSite oficial: ${item.website}` : ""}${item.documents.length ? `\n\nDocumentos disponíveis na plataforma:\n${item.documents.map(doc => `• ${doc.name}`).join("\n")}` : ""}`;
}
