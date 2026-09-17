import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { dismissBackdrop } from "../../lib/dismissBackdrop";
import type { QuoteResponse } from "../QuotePanel";
import { renderPromoCard, promoDesigns, type PromoDesign, type PromoFormat } from "./promo-card";

export default function PromoCardModal({ quote, onClose }: { quote: QuoteResponse; onClose: () => void }) {
  const [url, setUrl] = useState<string>(), [error, setError] = useState<string>();
  const [design,setDesign]=useState<PromoDesign>("modern"),[format,setFormat]=useState<PromoFormat>("portrait");
  useEffect(() => { let cancelled = false, objectUrl: string | undefined; setUrl(undefined); setError(undefined);
    void renderPromoCard(quote,design,format).then(blob => { if (cancelled) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [quote,design,format]);
  return <div className="nested-modal-backdrop" {...dismissBackdrop(onClose)}><section className="promo-card-modal" role="dialog" aria-modal="true" aria-label="Card promocional"><div className="modal-heading"><h2>Card promocional</h2><button className="icon-button" onClick={onClose} aria-label="Fechar card"><X size={18} /></button></div><div className="promo-designs" aria-label="Escolha da arte">{promoDesigns(quote).map(option=><button type="button" className="secondary-button" key={option.id} aria-pressed={design===option.id} onClick={()=>{if(design!==option.id){setUrl(undefined);setDesign(option.id);}}}>{option.label}</button>)}</div><label className="promo-format">Formato<select value={format} onChange={e=>{setUrl(undefined);setFormat(e.target.value as PromoFormat);}}><option value="portrait">Vertical — Status / Stories</option><option value="square">Quadrado — publicação</option></select></label>{error && <p className="auth-error">{error}</p>}{!url && !error && <p role="status">Gerando seu card…</p>}{url && <><img className="promo-card-preview" src={url} alt="Prévia do card com as condições da cotação" /><a className="primary-button" href={url} download={`sa-capital-${design}-${format}-${quote.quotas.map(q => q.code).join("-").slice(0, 80)}.png`}><Download size={17} /> Baixar PNG</a></>}</section></div>;
}
