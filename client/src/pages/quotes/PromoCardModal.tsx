import { useEffect, useState } from "react";
import { Download, ImageIcon, X } from "lucide-react";
import type { QuoteResponse } from "../QuotePanel";
import { dismissBackdrop } from "../../lib/dismissBackdrop";
import { renderPromoCard, promoDesigns, type PromoDesign, type PromoFormat } from "./promo-card";

export default function PromoCardModal({ quote, onClose }: { quote: QuoteResponse; onClose: () => void }) {
  const [design,setDesign]=useState<PromoDesign>("modern"),[format,setFormat]=useState<PromoFormat>("portrait"),[url,setUrl]=useState<string>(),[error,setError]=useState("");
  useEffect(()=>{let cancelled=false,objectUrl="";setError("");void renderPromoCard(quote,design,format).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(reason=>{if(!cancelled)setError((reason as Error).message);});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[quote,design,format]);
  const changeDesign=(value:PromoDesign)=>{if(value!==design){setUrl(undefined);setDesign(value);}};
  return <div className="nested-modal-backdrop" {...dismissBackdrop(onClose)}><section className="promo-card-modal" role="dialog" aria-modal="true" aria-labelledby="promo-card-title">
    <div className="modal-heading"><div><span className="eyebrow">ARTE PROMOCIONAL</span><h2 id="promo-card-title">Card contemplado</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar card"><X size={18}/></button></div>
    <div className="promo-card-workspace"><aside className="promo-card-controls"><div><strong>Escolha a arte</strong><p>A imagem e a composição acompanham a categoria da cota.</p></div><div className="promo-designs" aria-label="Escolha da arte">{promoDesigns(quote).map(option=><button type="button" className="secondary-button" key={option.id} aria-pressed={design===option.id} onClick={()=>changeDesign(option.id)}>{option.label}</button>)}</div><label className="promo-format">Formato<select value={format} onChange={event=>{setUrl(undefined);setFormat(event.target.value as PromoFormat);}}><option value="portrait">Vertical — Status / Stories</option><option value="square">Quadrado — publicação</option></select></label><div className="promo-card-note"><ImageIcon size={18}/><span>O arquivo final é gerado em alta resolução, pronto para compartilhar.</span></div></aside>
      <div className={`promo-preview-stage ${format}`}>{error&&<p className="auth-error">{error}</p>}{!url&&!error&&<p className="promo-generating" role="status">Gerando sua arte…</p>}{url&&<img className="promo-card-preview" src={url} alt="Prévia do card com as condições da cotação"/>}</div>
    </div>
    {url&&<a className="primary-button promo-download" href={url} download={`sa-capital-${design}-${format}-${quote.quotas.map(quota=>quota.code).join("-").slice(0,80)}.png`}><Download size={17}/> Baixar PNG em alta resolução</a>}
  </section></div>;
}
