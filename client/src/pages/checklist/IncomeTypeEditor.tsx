import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { incomeCatalog, incomeDocumentsSchema } from "@shared/income-catalog";
import type { Settings } from "@shared/settings";
import { dismissBackdrop } from "../../lib/dismissBackdrop";
export async function saveIncomeSettings(settings:Settings) {
  const r=await fetch("/api/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings,companyEmail:settings.companyEmail??"",companyPhone:settings.companyPhone??""})});
  const data=await r.json();if(!r.ok)throw new Error(data.error??"Não foi possível salvar os tipos de renda");return data;
}
export default function IncomeTypeEditor({settings,original,onClose}:{settings:Settings;original:string|null;onClose:()=>void}) {
  const definition=incomeCatalog(settings).find(t=>t.name===original);
  const [name,setName]=useState(original??""),[type,setType]=useState<"PF"|"PJ">(definition?.customerType??"PF"),[documents,setDocuments]=useState(definition?.documents.join("\n")??"");
  const qc=useQueryClient();
  const save=useMutation({mutationFn:async()=>{
    const normalized=name.trim(), docs=documents.split("\n").map(v=>v.trim()).filter(Boolean);
    if(!docs.length)throw new Error("Inclua pelo menos um documento");
    if(Object.keys(settings.incomeDocuments).some(key=>key!==original&&key.toLocaleLowerCase("pt-BR")===normalized.toLocaleLowerCase("pt-BR")))throw new Error("Já existe um tipo de renda com esse nome");
    const incomeDocuments={...settings.incomeDocuments}, incomeTypes=Object.fromEntries(incomeCatalog(settings).map(t=>[t.name,t.customerType]));
    if(original){delete incomeDocuments[original];delete incomeTypes[original];}
    incomeDocuments[normalized]=docs;incomeTypes[normalized]=type;
    const parsed=incomeDocumentsSchema.safeParse(incomeDocuments);if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??"Dados inválidos");
    return saveIncomeSettings({...settings,incomeDocuments:parsed.data,incomeTypes});
  },onSuccess:()=>{void qc.invalidateQueries({queryKey:["settings"]});toast.success("Tipo de renda salvo");onClose();},onError:error=>toast.error(error.message)});
  return <div className="modal-backdrop" {...dismissBackdrop(()=>{if(!save.isPending)onClose();})}><form className="stock-modal income-type-editor" onSubmit={(e:FormEvent)=>{e.preventDefault();save.mutate();}}><div className="modal-heading"><h2>{original?"Editar tipo de renda":"Novo tipo de renda"}</h2><button type="button" disabled={save.isPending} className="icon-button" aria-label="Fechar edição" onClick={onClose}><X size={18}/></button></div><fieldset disabled={save.isPending}><label>Nome<input required minLength={2} maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><label>Classificação<select value={type} onChange={e=>setType(e.target.value as "PF"|"PJ")}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label><label>Documentos exigidos (um por linha)<textarea required value={documents} onChange={e=>setDocuments(e.target.value)} /></label></fieldset><p>As pré-análises existentes preservam seu tipo de renda e documentos exigidos.</p><div className="form-actions"><button type="button" className="secondary-button" disabled={save.isPending} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={save.isPending}>{save.isPending?"Salvando…":"Salvar tipo de renda"}</button></div></form></div>;
}
