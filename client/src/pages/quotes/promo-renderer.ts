import { administratorKey } from "@shared/administrator-name";
import { administratorLogoPath } from "../../components/AdministratorLogo";
import type { QuoteResponse } from "../QuotePanel";
import { promoAverageTerm, promoCardValues } from "./promo-values";

export type PromoDesign = "modern" | "highlight" | "truck" | "tractor" | "property_alt";
export type PromoFormat = "portrait" | "square";

export function promoDesigns(quote: QuoteResponse) {
  const property = quote.quotas.some(q => administratorKey(q.category).includes("imovel"));
  return property ? [
    { id: "modern" as const, label: "Imóvel — Nova arte aprovada" },
    { id: "highlight" as const, label: "Imóvel — Editorial" },
    { id: "property_alt" as const, label: "Imóvel — Essencial" },
  ] : [
    { id: "modern" as const, label: "Veículo — Nova arte aprovada" },
    { id: "truck" as const, label: "Veículo — Caminhão" },
    { id: "tractor" as const, label: "Veículo — Trator" },
  ];
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Não foi possível carregar a arte")); image.src = src; });
function palette(name: string) {
  const key = administratorKey(name);
  if (key.includes("itau")) return { accent: "#ff650d", deep: "#8f2700" };
  if (key.includes("caixa")) return { accent: "#1688df", deep: "#003b73" };
  if (key.includes("sicredi")) return { accent: "#45ed55", deep: "#07521e" };
  if (key === "hs" || key.includes("hs consorcios")) return { accent: "#ef1741", deep: "#780019" };
  if (key.includes("bradesco")) return { accent: "#ed2458", deep: "#750020" };
  if (key.includes("santander")) return { accent: "#ec2525", deep: "#780000" };
  return { accent: "#2b78dd", deep: "#0b315d" };
}
type Fill = string | CanvasGradient;

export async function renderPromoCard(quote: QuoteResponse, design: PromoDesign = "modern", format: PromoFormat = "portrait"): Promise<Blob> {
  const property = quote.quotas.some(q => administratorKey(q.category).includes("imovel"));
  if (property && ["truck", "tractor"].includes(design)) throw new Error("Selecione uma arte de imóvel");
  if (!property && design === "property_alt") throw new Error("Selecione uma arte de veículo");
  const administrator = Array.from(new Set(quote.quotas.map(q => q.administrator))).join(" / ");
  const category = property ? "IMÓVEL" : design === "truck" ? "VEÍCULO PESADO" : design === "tractor" ? "TRATOR" : "VEÍCULO";
  const photoName = property ? "property" : design === "truck" ? "truck" : design === "tractor" ? "tractor" : "vehicle";
  const layout = design === "highlight" || design === "truck" ? "editorial" : design === "property_alt" || design === "tractor" ? "essential" : "panorama";
  const logoPath = administratorLogoPath(administrator);
  const [photo, logo] = await Promise.all([load(`/promo/${photoName}.png`), logoPath ? load(logoPath).catch(() => null) : Promise.resolve(null)]);
  await document.fonts.ready;
  const canvas = document.createElement("canvas"), square = format === "square"; canvas.width = 1080; canvas.height = square ? 1080 : 1920;
  const c = canvas.getContext("2d"); if (!c) throw new Error("Seu navegador não suporta gerar o card");
  const W = canvas.width, H = canvas.height, colors = palette(administrator), summary = quote.summary, values = promoCardValues(quote);
  const light = layout === "essential", surface = light ? "#f5f6f4" : "#080b0e", card = light ? "#ffffff" : "rgba(12,17,21,.94)", ink = light ? "#12171d" : "#ffffff", muted = light ? "#5d6873" : "#aab4bf";
  const font = (size: number, weight = 700) => `${weight} ${size}px Arial, sans-serif`;
  const fit = (value: string, x: number, y: number, size: number, color = ink, maxWidth = W - x - 50, weight = 700) => { let chosen = size; c.font = font(chosen, weight); while (c.measureText(value).width > maxWidth && chosen > 14) c.font = font(--chosen, weight); c.fillStyle = color; c.fillText(value, x, y); };
  const rounded = (x: number, y: number, w: number, h: number, r: number, fill: Fill, stroke?: string, lineWidth = 2) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); } };
  const cover = (image: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = .5) => { const scale = Math.max(w / image.width, h / image.height), dw = image.width * scale, dh = image.height * scale; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(image, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh); c.restore(); };
  const logoAt = (x: number, y: number, w: number, h: number) => { if (!logo) return; const scale = Math.min(w / logo.width, h / logo.height); rounded(x - 18, y - 13, w + 36, h + 26, 18, "rgba(255,255,255,.94)"); c.drawImage(logo, x + (w - logo.width * scale) / 2, y + (h - logo.height * scale) / 2, logo.width * scale, logo.height * scale); };
  const logoRaw = (x: number, y: number, w: number, h: number) => { if (!logo) return; const scale = Math.min(w / logo.width, h / logo.height); c.drawImage(logo, x + (w - logo.width * scale) / 2, y + (h - logo.height * scale) / 2, logo.width * scale, logo.height * scale); };
  const heading = (top: number, compact = false) => { const left = compact ? 42 : 58; rounded(left, top, compact ? 9 : 12, compact ? 100 : 140, 8, colors.accent); fit("CARTA", left + (compact ? 28 : 38), top + (compact ? 37 : 51), compact ? 31 : 44, "#fff", compact ? 410 : 520, 400); fit("CONTEMPLADA", left + (compact ? 28 : 38), top + (compact ? 82 : 112), compact ? 43 : 61, "#fff", compact ? 610 : 690, 850); logoAt(compact ? 835 : 790, top + (compact ? 11 : 21), compact ? 155 : 210, compact ? 70 : 90); };
  const metric = (x: number, y: number, w: number, h: number, label: string, value: string, emphasis = false, compact = false) => { rounded(x, y, w, h, compact ? 18 : 26, emphasis && layout === "editorial" ? colors.deep : card, emphasis ? colors.accent : (light ? "#d9dee2" : "#3c4751"), emphasis ? 3 : 2); rounded(x, y + (compact ? 22 : 31), compact ? 9 : 12, h - (compact ? 44 : 62), 7, colors.accent); fit(label, x + (compact ? 34 : 50), y + (compact ? 43 : 61), compact ? 20 : 29, colors.accent, w - (compact ? 62 : 92), 800); fit(value, x + (compact ? 34 : 50), y + (compact ? 92 : 137), compact ? (emphasis ? 38 : 31) : (emphasis ? 62 : 44), ink, w - (compact ? 62 : 92), 850); };
  const small = (x: number, y: number, w: number, h: number, label: string, value: string, compact = false) => { rounded(x, y, w, h, compact ? 16 : 22, card, light ? "#d9dee2" : "#3c4751"); rounded(x, y + (compact ? 20 : 27), compact ? 8 : 10, h - (compact ? 40 : 54), 6, colors.accent); fit(label, x + (compact ? 30 : 43), y + (compact ? 39 : 55), compact ? 17 : 23, colors.accent, w - (compact ? 50 : 70), 800); fit(value, x + (compact ? 30 : 43), y + (compact ? 79 : 110), compact ? 26 : 35, ink, w - (compact ? 50 : 70), 800); };

  c.fillStyle = surface; c.fillRect(0, 0, W, H);
  const firstModernVersion = design === "modern";
  const secondVehicleVersion = !property && design === "truck";
  const alternativeVersion = design !== "modern";
  if (firstModernVersion && !square) {
    cover(photo, 0, 0, W, 1020, .5);
    const leftShade = c.createLinearGradient(0, 0, 720, 0);
    leftShade.addColorStop(0, "rgba(3,7,11,.96)"); leftShade.addColorStop(.5, "rgba(3,7,11,.62)"); leftShade.addColorStop(1, "rgba(3,7,11,0)");
    c.fillStyle = leftShade; c.fillRect(0, 0, W, 930);
    const lowerShade = c.createLinearGradient(0, 670, 0, 1120);
    lowerShade.addColorStop(0, "rgba(3,7,11,0)"); lowerShade.addColorStop(.72, "#070b0f"); lowerShade.addColorStop(1, "#070b0f");
    c.fillStyle = lowerShade; c.fillRect(0, 650, W, 500);
    c.fillStyle = "#070b0f"; c.fillRect(0, 1080, W, H - 1080);

    logoRaw(62, 56, 285, 150);
    fit("CARTA", 62, 340, 72, "#fff", 470, 400);
    fit("CONTEMPLADA", 62, 438, 79, "#fff", 690, 900);
    fit(`SEU ${property ? "IMÓVEL" : "VEÍCULO"},`, 76, 556, 25, "#f2f4f6", 380, 500);
    fit("MAIS PERTO", 76, 591, 25, "#f2f4f6", 380, 500);
    fit("DO QUE VOCÊ IMAGINA.", 76, 626, 25, "#f2f4f6", 460, 500);

    const offerPanel = c.createLinearGradient(50, 0, 1030, 0); offerPanel.addColorStop(0, "rgba(5,10,15,.98)"); offerPanel.addColorStop(1, "rgba(12,19,25,.96)");
    rounded(56, 800, 968, 318, 30, offerPanel, "#52606c", 2);
    rounded(56, 800, 13, 318, 9, colors.accent);
    c.fillStyle = "#65717b"; c.fillRect(536, 846, 2, 224);
    fit("CRÉDITO", 112, 875, 27, "#e4e8ec", 360, 500);
    fit(money(summary.creditTotal), 112, 981, 58, "#fff", 380, 900);
    fit("ENTRADA", 626, 875, 27, "#e4e8ec", 310, 500);
    fit("POR", 626, 929, 20, "#d8dde2", 150, 500);
    fit(money(summary.finalEntryTotal), 626, 1002, 48, colors.accent, 340, 900);

    fit("CONDIÇÕES", 82, 1210, 32, "#eef1f4", 260, 500);
    c.fillStyle = colors.accent; c.fillRect(302, 1197, 706, 3);
    rounded(76, 1260, 446, 190, 22, "rgba(11,17,22,.88)", "#3c4852", 2);
    rounded(546, 1260, 458, 190, 22, "rgba(11,17,22,.88)", "#3c4852", 2);
    rounded(76, 1285, 9, 140, 6, colors.accent);
    rounded(546, 1285, 9, 140, 6, colors.accent);
    fit("PRAZO MÉDIO", 112, 1325, 23, colors.accent, 350, 800);
    fit(`${promoAverageTerm(values.averageTerm)} meses`, 112, 1393, 40, "#fff", 350, 850);
    fit("PRIMEIRA PARCELA", 584, 1325, 23, colors.accent, 365, 800);
    fit(money(values.firstInstallment), 584, 1393, 40, "#fff", 365, 850);

    fit(`COTAS ${quote.quotas.map(q => q.code).join(" • ")}`, 82, 1535, 17, "#98a3ad", 520, 650);
    fit(administrator.toUpperCase(), 82, 1570, 19, "#fff", 520, 800);
    fit(`PLANEJAMENTO É O PRIMEIRO PASSO PARA O SEU ${property ? "IMÓVEL" : "VEÍCULO"}.`, 440, 1740, 19, "#f1f3f5", 560, 500);
    c.fillStyle = colors.deep; c.beginPath(); c.moveTo(0, 1835); c.lineTo(390, 1920); c.lineTo(0, 1920); c.closePath(); c.fill();
    c.fillStyle = colors.accent; c.beginPath(); c.moveTo(1080, 1800); c.lineTo(1080, 1920); c.lineTo(650, 1920); c.closePath(); c.fill();
  } else if (firstModernVersion && square) {
    cover(photo, 0, 0, W, 610, .48);
    const photoShade = c.createLinearGradient(0, 0, 0, 630); photoShade.addColorStop(0, "rgba(3,9,17,.76)"); photoShade.addColorStop(.55, "rgba(3,9,17,.04)"); photoShade.addColorStop(1, "#09111a"); c.fillStyle = photoShade; c.fillRect(0, 0, W, 630);
    rounded(44, 42, 9, 105, 6, colors.accent); fit("CARTA", 78, 79, 29, "#fff", 430, 400); fit("CONTEMPLADA", 78, 132, 43, "#fff", 590, 850); logoAt(840, 57, 150, 64);
    const panel = c.createLinearGradient(0, 450, 0, H); panel.addColorStop(0, "#0c141e"); panel.addColorStop(1, "#06090d"); rounded(35, 445, 1010, 600, 32, panel, "rgba(255,255,255,.10)");
    fit(`${category}  •  ${administrator.toUpperCase()}`, 70, 500, 18, colors.accent, 850, 750);
    fit("CRÉDITO", 70, 554, 20, "#aeb8c4", 250, 750); fit(money(summary.creditTotal), 70, 622, 51, "#fff", 900, 850);
    rounded(60, 655, 960, 130, 20, colors.deep, colors.accent, 2); fit("ENTRADA", 91, 700, 19, "#dce3ea", 250, 750); fit(`POR: ${money(summary.finalEntryTotal)}`, 91, 756, 38, "#fff", 850, 850);
    small(60, 810, 380, 135, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`, true); small(460, 810, 560, 135, "PRIMEIRA PARCELA", money(values.firstInstallment), true);
    fit(`COTAS  ${quote.quotas.map(q => q.code).join("  •  ")}`, 64, 1006, 16, "#8f9baa", 930, 600); c.fillStyle = colors.accent; c.fillRect(35, 1032, 1010, 13);
  } else if (alternativeVersion && !square) {
    const editorial = design === "truck" || design === "highlight";
    if (editorial) {
      cover(photo, 0, 0, W, 1040, .46);
      const topShade = c.createLinearGradient(0, 0, 0, 1040); topShade.addColorStop(0, "rgba(2,6,10,.78)"); topShade.addColorStop(.46, "rgba(2,6,10,.05)"); topShade.addColorStop(1, "#070b10"); c.fillStyle = topShade; c.fillRect(0, 0, W, 1080);
      const sideShade = c.createLinearGradient(0, 0, 680, 0); sideShade.addColorStop(0, "rgba(2,6,10,.88)"); sideShade.addColorStop(1, "rgba(2,6,10,0)"); c.fillStyle = sideShade; c.fillRect(0, 0, 760, 760);
      c.fillStyle = "#070b10"; c.fillRect(0, 1030, W, H - 1030);
      logoRaw(62, 54, 270, 142);
      rounded(62, 245, 92, 8, 4, colors.accent);
      fit("CARTA", 62, 340, 67, "#fff", 450, 400); fit("CONTEMPLADA", 62, 430, 75, "#fff", 680, 900);
      fit(category, 66, 485, 24, colors.accent, 420, 800);
      rounded(52, 780, 976, 400, 34, "rgba(7,12,17,.96)", colors.accent, 4);
      fit("CRÉDITO DISPONÍVEL", 96, 850, 24, "#cfd6dc", 470, 650); fit(money(summary.creditTotal), 96, 942, 62, "#fff", 830, 900);
      c.fillStyle = "#45515c"; c.fillRect(92, 990, 896, 2);
      fit("ENTRADA", 96, 1043, 22, "#cfd6dc", 260, 650); fit(`POR: ${money(summary.finalEntryTotal)}`, 96, 1125, 54, colors.accent, 830, 900);
      fit("CONDIÇÕES", 76, 1260, 30, "#fff", 250, 500); c.fillStyle = colors.accent; c.fillRect(286, 1248, 720, 3);
      small(70, 1305, 456, 188, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`); small(550, 1305, 458, 188, "PRIMEIRA PARCELA", money(values.firstInstallment));
      fit(`COTAS ${quote.quotas.map(q => q.code).join(" • ")}`, 82, 1582, 17, "#97a3ad", 480, 650); fit(administrator.toUpperCase(), 82, 1618, 19, "#fff", 480, 800);
      fit(property ? "SEU NOVO ENDEREÇO COMEÇA COM PLANEJAMENTO." : "FORÇA PARA O TRABALHO. INTELIGÊNCIA PARA A CONQUISTA.", 218, 1770, 20, "#fff", 790, 550);
      c.fillStyle = colors.accent; c.beginPath(); c.moveTo(0, 1845); c.lineTo(520, 1920); c.lineTo(0, 1920); c.closePath(); c.fill();
      c.fillStyle = colors.deep; c.beginPath(); c.moveTo(1080, 1818); c.lineTo(1080, 1920); c.lineTo(600, 1920); c.closePath(); c.fill();
    } else {
      cover(photo, 0, 0, W, 800, .46);
      const photoShade = c.createLinearGradient(0, 0, 0, 820); photoShade.addColorStop(0, "rgba(3,8,12,.62)"); photoShade.addColorStop(.65, "rgba(3,8,12,.02)"); photoShade.addColorStop(1, "rgba(3,8,12,.45)"); c.fillStyle = photoShade; c.fillRect(0, 0, W, 820);
      const neutralBase = c.createLinearGradient(0, 790, 0, H); neutralBase.addColorStop(0, "#0d1217"); neutralBase.addColorStop(1, "#06090c"); c.fillStyle = neutralBase; c.fillRect(0, 790, W, H - 790);
      const headerShade = c.createLinearGradient(0, 0, 0, 235); headerShade.addColorStop(0, "rgba(3,7,11,.76)"); headerShade.addColorStop(1, "rgba(3,7,11,0)"); c.fillStyle = headerShade; c.fillRect(0, 0, W, 250);
      rounded(58, 58, 10, 132, 6, colors.accent);
      fit("CARTA CONTEMPLADA", 96, 119, 48, "#fff", 650, 850); fit(category, 98, 166, 22, colors.accent, 420, 800); logoRaw(800, 62, 190, 92);
      rounded(54, 735, 972, 380, 30, "#10171d", "#3b4852", 2);
      fit("CRÉDITO", 96, 812, 23, colors.accent, 260, 800); fit(money(summary.creditTotal), 96, 910, 61, "#ffffff", 820, 900);
      rounded(88, 958, 904, 122, 20, colors.deep); fit("ENTRADA", 122, 1002, 19, "#fff", 220, 700); fit(`POR: ${money(summary.finalEntryTotal)}`, 122, 1053, 40, "#fff", 800, 900);
      fit("CONDIÇÕES DA COTA", 70, 1220, 28, "#eef2f5", 360, 700); c.fillStyle = colors.accent; c.fillRect(400, 1208, 608, 3);
      rounded(70, 1260, 456, 186, 22, "#0d141a", "#35424c", 2); rounded(550, 1260, 458, 186, 22, "#0d141a", "#35424c", 2);
      rounded(70, 1283, 9, 140, 6, colors.accent); rounded(550, 1283, 9, 140, 6, colors.accent);
      fit("PRAZO MÉDIO", 108, 1320, 22, colors.accent, 350, 800); fit(`${promoAverageTerm(values.averageTerm)} meses`, 108, 1390, 40, "#ffffff", 350, 850);
      fit("PRIMEIRA PARCELA", 588, 1320, 22, colors.accent, 365, 800); fit(money(values.firstInstallment), 588, 1390, 40, "#ffffff", 365, 850);
      fit(`COTAS ${quote.quotas.map(q => q.code).join(" • ")}  •  ${administrator.toUpperCase()}`, 78, 1545, 17, "#98a5af", 900, 700);
      fit(property ? "UM NOVO LUGAR PARA VIVER SEUS MELHORES PLANOS." : "PRODUTIVIDADE PARA IR MAIS LONGE.", 258, 1750, 20, "#e9edf0", 750, 600);
      c.fillStyle = colors.deep; c.beginPath(); c.moveTo(0, 1845); c.lineTo(530, 1920); c.lineTo(0, 1920); c.closePath(); c.fill();
      c.fillStyle = colors.accent; c.beginPath(); c.moveTo(1080, 1810); c.lineTo(1080, 1920); c.lineTo(610, 1920); c.closePath(); c.fill();
    }
  } else if (alternativeVersion && square) {
    cover(photo, 0, 0, W, 575, .46); const shade = c.createLinearGradient(0, 0, 0, 600); shade.addColorStop(0, "rgba(2,7,12,.68)"); shade.addColorStop(.6, "rgba(2,7,12,.04)"); shade.addColorStop(1, "#080d12"); c.fillStyle = shade; c.fillRect(0, 0, W, 610);
    rounded(42, 38, 9, 112, 6, colors.accent); fit("CARTA CONTEMPLADA", 76, 91, 38, "#fff", 610, 850); fit(category, 76, 130, 18, colors.accent, 410, 750); logoAt(840, 54, 155, 65);
    rounded(34, 440, 1012, 605, 30, "#080d12", "#394550", 2); fit("CRÉDITO", 70, 503, 19, "#b8c1c9", 250, 750); fit(money(summary.creditTotal), 70, 575, 51, "#fff", 890, 900);
    rounded(60, 615, 960, 132, 20, colors.deep, colors.accent, 2); fit("ENTRADA", 91, 660, 18, "#fff", 210, 750); fit(`POR: ${money(summary.finalEntryTotal)}`, 91, 718, 39, "#fff", 850, 900);
    small(60, 780, 450, 140, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`, true); small(534, 780, 486, 140, "PRIMEIRA PARCELA", money(values.firstInstallment), true);
    fit(`COTAS ${quote.quotas.map(q => q.code).join(" • ")} • ${administrator.toUpperCase()}`, 64, 995, 15, "#96a2ad", 920, 650); c.fillStyle = colors.accent; c.fillRect(34, 1033, 1012, 13);
  } else if (secondVehicleVersion && !square) {
    cover(photo, 0, 0, W, 920, .48);
    const shade = c.createLinearGradient(0, 0, 0, 940); shade.addColorStop(0, "rgba(2,7,13,.7)"); shade.addColorStop(.48, "rgba(2,7,13,.02)"); shade.addColorStop(1, "#07101a"); c.fillStyle = shade; c.fillRect(0, 0, W, 950);
    rounded(52, 52, 625, 148, 24, "rgba(4,11,19,.78)", "rgba(255,255,255,.14)"); rounded(52, 52, 11, 148, 7, colors.accent);
    fit("CARTA CONTEMPLADA", 91, 111, 45, "#fff", 545, 850); fit("VEÍCULO PESADO", 91, 164, 25, colors.accent, 500, 750); logoAt(808, 72, 190, 80);

    const info = c.createLinearGradient(0, 790, 0, H); info.addColorStop(0, "#0b1724"); info.addColorStop(1, "#05090e");
    rounded(42, 790, 996, 1082, 34, info, "rgba(255,255,255,.11)");
    fit(administrator.toUpperCase(), 82, 862, 25, colors.accent, 880, 800);
    metric(72, 900, 936, 235, "CRÉDITO DISPONÍVEL", money(summary.creditTotal), true);
    rounded(72, 1167, 936, 190, 24, "#101c28", colors.accent, 3); fit("ENTRADA", 112, 1225, 24, "#b8c3ce", 260, 750); fit(`POR: ${money(summary.finalEntryTotal)}`, 112, 1305, 51, "#fff", 820, 850);
    const period = summary.installmentCascade[0];
    small(72, 1390, 452, 175, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`); small(548, 1390, 460, 175, "PARCELAS", period ? `${period.to}x de ${money(period.amount)}` : "Não disponível");
    c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(72, 1602, 936, 2);
    fit("SALDO DEVEDOR", 80, 1650, 18, muted, 270, 700); fit(money(summary.outstandingBalanceTotal), 80, 1693, 29, "#fff", 285, 800);
    fit("TRANSFERÊNCIA", 390, 1650, 18, muted, 260, 700); fit(money(summary.transferFeeTotal), 390, 1693, 29, "#fff", 275, 800);
    fit("SEGURO DE VIDA", 700, 1650, 18, muted, 250, 700); fit(money(summary.insuranceTotal), 700, 1693, 29, "#fff", 275, 800);
    fit(`COTAS  ${quote.quotas.map(q => q.code).join("  •  ")}`, 76, 1817, 18, "#8795a4", 900, 600); c.fillStyle = colors.accent; c.fillRect(42, 1858, 996, 14);
  } else if (secondVehicleVersion && square) {
    cover(photo, 0, 0, W, 570, .48); const shade = c.createLinearGradient(0, 0, 0, 590); shade.addColorStop(0, "rgba(2,7,13,.72)"); shade.addColorStop(.5, "rgba(2,7,13,.02)"); shade.addColorStop(1, "#07101a"); c.fillStyle = shade; c.fillRect(0, 0, W, 600);
    rounded(42, 38, 600, 110, 20, "rgba(4,11,19,.78)", "rgba(255,255,255,.14)"); rounded(42, 38, 9, 110, 6, colors.accent); fit("CARTA CONTEMPLADA", 75, 88, 36, "#fff", 530, 850); fit("VEÍCULO PESADO", 75, 125, 18, colors.accent, 480, 750); logoAt(846, 51, 145, 61);
    const info = c.createLinearGradient(0, 430, 0, H); info.addColorStop(0, "#0b1724"); info.addColorStop(1, "#05090e"); rounded(34, 430, 1012, 618, 30, info, "rgba(255,255,255,.11)");
    fit(administrator.toUpperCase(), 68, 482, 18, colors.accent, 900, 800); metric(58, 506, 964, 158, "CRÉDITO DISPONÍVEL", money(summary.creditTotal), true, true);
    rounded(58, 686, 964, 124, 18, "#101c28", colors.accent, 2); fit("ENTRADA", 88, 728, 18, "#b8c3ce", 230, 750); fit(`POR: ${money(summary.finalEntryTotal)}`, 88, 780, 37, "#fff", 850, 850);
    const period = summary.installmentCascade[0]; small(58, 832, 460, 125, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`, true); small(538, 832, 484, 125, "PARCELAS", period ? `${period.to}x de ${money(period.amount)}` : "Não disponível", true);
    fit(`COTAS  ${quote.quotas.map(q => q.code).join("  •  ")}`, 62, 1010, 15, "#8795a4", 920, 600); c.fillStyle = colors.accent; c.fillRect(34, 1036, 1012, 12);
  } else if (!square) {
    const photoHeight = layout === "editorial" ? 900 : layout === "essential" ? 780 : 850;
    cover(photo, 0, 0, W, photoHeight, photoName === "tractor" ? .4 : .5);
    const shade = c.createLinearGradient(0, 0, 0, photoHeight); shade.addColorStop(0, "rgba(2,8,14,.72)"); shade.addColorStop(.35, "rgba(2,8,14,.08)"); shade.addColorStop(1, light ? "rgba(2,8,14,.22)" : "#080b0e"); c.fillStyle = shade; c.fillRect(0, 0, W, photoHeight); heading(56);
    const start = layout === "editorial" ? 760 : 750;
    metric(54, start, 972, 250, "CRÉDITO", money(summary.creditTotal), true);
    metric(54, start + 278, 972, 205, "ENTRADA", `POR: ${money(summary.finalEntryTotal)}`);
    small(54, start + 511, 466, 180, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`);
    const period = summary.installmentCascade[0];
    small(546, start + 511, 480, 180, "PARCELAS", period ? `${period.to}x de ${money(period.amount)}` : "Não disponível");
    [["SALDO DEVEDOR", summary.outstandingBalanceTotal], ["TRANSFERÊNCIA", summary.transferFeeTotal], ["SEGURO DE VIDA", summary.insuranceTotal]].forEach(([label, value], i) => small(54 + i * 326, start + 719, 320, 155, String(label), money(Number(value))));
    fit(`${category}  •  Administradora: ${administrator}`, 58, 1845, 24, muted, 760, 600); fit(`Cotas: ${quote.quotas.map(q => q.code).join(" • ")}`, 58, 1882, 18, muted, 760, 500); c.fillStyle = colors.accent; c.fillRect(0, 1908, W, 12);
  } else {
    cover(photo, 0, 0, W, 490, photoName === "tractor" ? .4 : .5); const shade = c.createLinearGradient(0, 0, 0, 500); shade.addColorStop(0, "rgba(2,8,14,.75)"); shade.addColorStop(.55, "rgba(2,8,14,.05)"); shade.addColorStop(1, surface); c.fillStyle = shade; c.fillRect(0, 0, W, 510); heading(35, true);
    metric(42, 420, 996, 170, "CRÉDITO", money(summary.creditTotal), true, true); metric(42, 610, 996, 145, "ENTRADA", `POR: ${money(summary.finalEntryTotal)}`, false, true);
    const period = summary.installmentCascade[0]; small(42, 775, 480, 125, "PRAZO MÉDIO", `${promoAverageTerm(values.averageTerm)} meses`, true); small(546, 775, 492, 125, "PARCELAS", period ? `${period.to}x de ${money(period.amount)}` : "Não disponível", true);
    fit(`${category} • ${administrator}`, 45, 955, 21, muted, 620, 600); logoAt(865, 925, 135, 58); c.fillStyle = colors.accent; c.fillRect(0, 1068, W, 12);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível gerar o PNG")), "image/png"));
}
