const files: Record<string, string> = {
  canopus: "CANOPUS LOGO.png", caoa: "CAOA CONSORCIOS LOGO.png", disal: "disal LOGO.png", ademicon: "LOGO ADEMICON.png", ancora: "LOGO ANCORA.png",
  "banco do brasil": "LOGO BANCO DO BRASIL.png", banrisul: "LOGO BANRISUL.png", bradesco: "LOGO BRADESCO.png", caixa: "LOGO CAIXA.png", cnp: "LOGO CNPG.png", cnpg: "LOGO CNPG.png",
  embracon: "LOGO EMBRACON.jpg", gazin: "logo GAZIN.png", hs: "LOGO HS.png", itau: "LOGO ITAU.png", magalu: "logo MAGALU.jpg", mycon: "LOGO MYCON.png",
  porto: "LOGO PORTO SEGURO.png", "primo rossi": "LOGO PRIMO ROSSI.png", renault: "LOGO RENAULT.png", rodobens: "LOGO RODOBENS.png", santander: "LOGO SANTANDER.png",
  serello: "LOGO SERELLO.png", servopa: "LOGO SERVOPA (2).png", sicoob: "LOGO SICOOB.png", sicredi: "LOGO SICREDI.png", sponchiado: "LOGO SPONCHIADO.png",
  tradicao: "LOGO TRADICAO.png", "uniao catarinense": "LOGO UNIAO CATARINENSE.png", unicoob: "logo UNICOOB.png", volkswagen: "LOGO VOLKSWAGEM.png", wolkswagen: "LOGO VOLKSWAGEM.png",
  yamaha: "LOGO YAMAHA.png", zema: "LOGO ZEMA.png", racon: "RACON LOGO.jpg",
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export default function AdministratorLogo({ name }: { name: string }) {
  const entry = Object.entries(files).find(([key]) => normalize(name).includes(key));
  if (!entry) return <span className="administrator-logo administrator-logo-fallback" aria-label={name}>{name.slice(0, 2).toUpperCase()}</span>;
  return <span className="administrator-logo"><img src={`/administrator-logos/LOGO/${encodeURIComponent(entry[1])}`} alt={`Logo ${name}`} /></span>;
}
