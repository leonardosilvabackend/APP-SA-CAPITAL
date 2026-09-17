import { administratorKey, normalizeAdministratorName } from "@shared/administrator-name";
const files: Record<string, string> = {
  canopus: "CANOPUS LOGO.png", "caoa consorcios": "CAOA CONSORCIOS LOGO.png", disal: "disal LOGO.png", ademicon: "LOGO ADEMICON.png", ancora: "LOGO ANCORA.png",
  "banco do brasil": "LOGO BANCO DO BRASIL.png", banrisul: "LOGO BANRISUL.png", bradesco: "LOGO BRADESCO.png", caixa: "LOGO CAIXA.png", cnp: "LOGO CNP.png",
  embracon: "LOGO EMBRACON.png", gazin: "logo GAZIN.png", "hs consorcios": "LOGO HS.png", itau: "LOGO ITAU.png", magalu: "LOGO MAGALU.png", mycon: "LOGO MYCON.png",
  "porto seguro": "LOGO PORTO SEGURO.png", "primo rossi": "LOGO PRIMO ROSSI.png", renault: "LOGO RENAULT.png", rodobens: "LOGO RODOBENS.png", santander: "LOGO SANTANDER.png",
  serello: "LOGO SERELLO.png", servopa: "LOGO SERVOPA (2).png", sicoob: "LOGO SICOOB.png", sicredi: "LOGO SICREDI.png", sponchiado: "LOGO SPONCHIADO.png",
  tradicao: "LOGO TRADICAO.png", "uniao catarinense": "LOGO UNIAO CATARINENSE.png", unicoob: "logo UNICOOB.png", volkswagen: "LOGO VOLKSWAGEM.png",
  yamaha: "LOGO YAMAHA.png", zema: "LOGO ZEMA.png", racon: "LOGO RACON.png",
};
export function administratorLogoPath(name: string) {
  const file = files[administratorKey(normalizeAdministratorName(name))];
  return file ? `/administrator-logos/LOGO/${encodeURIComponent(file)}` : null;
}
export default function AdministratorLogo({ name }: { name: string }) {
  const canonical = normalizeAdministratorName(name), path = administratorLogoPath(canonical);
  if (!path) return <span className="administrator-logo administrator-logo-fallback" aria-label={canonical}>{canonical.slice(0, 2).toUpperCase()}</span>;
  return <span className="administrator-logo"><img src={path} alt={`Logo ${canonical}`} /></span>;
}
