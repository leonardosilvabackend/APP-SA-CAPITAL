import { administratorKey } from "@shared/administrator-name";
import { administratorLogoPath } from "../../components/AdministratorLogo";
import type { QuoteResponse } from "../QuotePanel";
import { promoAverageTerm, promoCardValues } from "./promo-values";
export type PromoDesign = "modern"|"highlight"|"truck";
export type PromoFormat = "portrait"|"square";
export function promoDesigns(quote:QuoteResponse) {
  const property=quote.quotas.some(q=>administratorKey(q.category).includes("imovel"));
  return [{id:"modern" as const,label:`Moderno — ${property?"imóvel":"veículo"}`},{id:"highlight" as const,label:`Destaque — ${property?"imóvel":"veículo"}`},...(!property?[{id:"truck" as const,label:"Moderno — caminhão"}]:[])];
}
const money=(value:number)=>value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Não foi possível carregar a arte"));img.src=src;});
export async function renderPromoCard(quote:QuoteResponse,design:PromoDesign="modern",format:PromoFormat="portrait"):Promise<Blob> {
  const property=quote.quotas.some(q=>administratorKey(q.category).includes("imovel"));
  if(property&&design==="truck")throw new Error("Selecione uma arte de imóvel");
  const administrator=Array.from(new Set(quote.quotas.map(q=>q.administrator))).join(" / "),path=administratorLogoPath(administrator);
  const [photo,logo]=await Promise.all([load(`/promo/${property?"property":design==="truck"?"truck":"vehicle"}.png`),path?load(path).catch(()=>null):Promise.resolve(null)]);
  await document.fonts.ready;
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=format==="square"?1080:1920;
  const c=canvas.getContext("2d");if(!c)throw new Error("Seu navegador não suporta gerar o card");
  const accent="#b59bff",muted="#c4cee0",background="#09182f",values=promoCardValues(quote),s=quote.summary;
  const entry=`POR ${money(s.finalEntryTotal)} — ${s.entryPercentage.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  const footer=`*${quote.quotas.length} cota${quote.quotas.length===1?"":"s"} — consulte a cotação completa`;
  const text=(value:string,x:number,y:number,size:number,color="#fff",width=940,weight=700)=>{let chosen=size;c.font=`${weight} ${chosen}px Arial`;while(c.measureText(value).width>width&&chosen>16){c.font=`${weight} ${--chosen}px Arial`;}c.fillStyle=color;c.fillText(value,x,y);};
  const box=(x:number,y:number,w:number,h:number,color:string,border=false)=>{c.beginPath();c.roundRect(x,y,w,h,24);c.fillStyle=color;c.fill();if(border){c.strokeStyle="#554486";c.lineWidth=1.5;c.stroke();}};
  const cover=(x:number,y:number,w:number,h:number)=>{const scale=Math.max(w/photo.width,h/photo.height);c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.drawImage(photo,x+(w-photo.width*scale)/2,y+(h-photo.height*scale)/2,photo.width*scale,photo.height*scale);c.restore();};
  const logoAt=(x:number,y:number,w:number,h:number)=>{if(logo){const scale=Math.min(w/logo.width,h/logo.height);c.drawImage(logo,x,y,logo.width*scale,logo.height*scale);}};
  c.fillStyle=background;c.fillRect(0,0,canvas.width,canvas.height);
  if(format==="square") {
    cover(0,0,520,1080);const shade=c.createLinearGradient(0,0,0,1080);shade.addColorStop(0,"rgba(9,24,47,.15)");shade.addColorStop(1,background);c.fillStyle=shade;c.fillRect(0,0,520,1080);
    text("Carta",40,850,76,"#fff",450);text("contemplada",40,940,65,accent,450);
    box(540,30,510,1020,design==="highlight"?"#17173e":"#101f39",true);logoAt(580,65,180,100);text(`${administrator} • ${property?"IMÓVEL":"VEÍCULO"}`,580,205,25,muted,425);
    const row=(label:string,value:string,y:number,size=43)=>{text(label,580,y,24,muted,425,500);text(value,580,y+60,size,label==="ENTRADA:"?accent:"#fff",425);};
    row("CRÉDITO:",money(s.creditTotal),275,56);row("ENTRADA:",entry,430,44);row("PRAZO MÉDIO:",promoAverageTerm(values.averageTerm),580,42);row("PRIMEIRA PARCELA:",money(values.firstInstallment),725,40);row("SALDO DEVEDOR:",money(s.outstandingBalanceTotal),865,40);text(footer,580,1010,21,muted,425,400);
  } else {
    cover(0,0,1080,900);const shade=c.createLinearGradient(0,0,0,960);shade.addColorStop(0,"rgba(9,24,47,.4)");shade.addColorStop(.58,"rgba(9,24,47,0)");shade.addColorStop(1,background);c.fillStyle=shade;c.fillRect(0,0,1080,960);
    logoAt(65,45,210,150);text(`${administrator} • ${property?"IMÓVEL":"VEÍCULO"}`,65,230,27,"#fff",930,500);
    if(design==="highlight") {
      const left=c.createLinearGradient(0,0,1080,0);left.addColorStop(0,"rgba(9,24,47,.9)");left.addColorStop(1,"rgba(9,24,47,0)");c.fillStyle=left;c.fillRect(0,260,1080,400);
      text("Carta",60,420,112);text("contemplada",60,550,112,accent);
      const row=(label:string,value:string,y:number,h:number,size:number)=>{box(55,y,970,h,"rgba(18,24,56,.96)",true);c.fillStyle=accent;c.fillRect(55,y+18,10,h-36);text(label,100,y+55,33,muted,875);text(value,100,y+h-35,size,label==="ENTRADA:"?accent:"#fff",875);};
      row("CRÉDITO:",money(s.creditTotal),690,230,116);row("ENTRADA:",entry,945,205,85);
      const compact=(label:string,value:string,y:number)=>{box(55,y,970,125,"rgba(18,24,56,.96)",true);c.fillStyle=accent;c.fillRect(55,y+18,10,89);text(`${label} ${value}`,100,y+80,46,"#fff",875);};
      compact("PRAZO MÉDIO:",promoAverageTerm(values.averageTerm),1190);compact("PRIMEIRA PARCELA:",money(values.firstInstallment),1345);compact("SALDO DEVEDOR:",money(s.outstandingBalanceTotal),1500);text(footer,70,1725,30,muted,940,400);
    } else {
      text("Carta contemplada",65,865,91,accent);
      box(40,935,1000,920,"rgba(10,24,48,.98)",true);
      const icon=(y:number,index:number)=>{c.beginPath();c.arc(120,y,45,0,Math.PI*2);c.fillStyle="#292b61";c.fill();c.strokeStyle=accent;c.lineWidth=3;c.strokeRect(105,y-16,30,32);c.beginPath();c.moveTo(109,y-5);c.lineTo(131,y-5);c.moveTo(109,y+6);c.lineTo(126,y+6);c.stroke();};
      icon(1050,0);text("CRÉDITO:",205,1010,30,muted,790);text(money(s.creditTotal),205,1100,87,"#fff",790);
      icon(1250,1);text("ENTRADA:",205,1205,30,muted,790);text(entry,205,1290,68,"#fff",790);
      icon(1440,2);text(`PRAZO MÉDIO: ${promoAverageTerm(values.averageTerm)}`,205,1455,43,"#fff",790);
      icon(1580,3);text(`PRIMEIRA PARCELA: ${money(values.firstInstallment)}`,205,1595,43,"#fff",790);
      icon(1720,4);text(`SALDO DEVEDOR: ${money(s.outstandingBalanceTotal)}`,205,1735,43,"#fff",790);text(footer,75,1815,27,muted,940,400);
    }
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Não foi possível gerar o PNG")),"image/png"));
}
