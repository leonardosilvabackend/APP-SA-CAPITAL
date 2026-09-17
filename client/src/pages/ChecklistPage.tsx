import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { incomeCatalog } from "@shared/income-catalog";
import type { Settings } from "@shared/settings";
import type { AuthenticatedUser } from "@shared/contracts";
import { toast } from "sonner";
import IncomeTypeEditor, {saveIncomeSettings} from "./checklist/IncomeTypeEditor";
import { checklistText } from "@shared/checklist";
import { copyText } from "../lib/share-text";

export default function ChecklistPage({user}:{user:AuthenticatedUser}) {
  const [editor,setEditor]=useState<{original:string|null}|null>(null),qc=useQueryClient();
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const settings = useQuery<{settings:Settings}>({ queryKey: ["settings"], queryFn: async () => { const r = await fetch("/api/settings"); if (!r.ok) throw new Error("Não foi possível carregar o check-list"); return r.json(); } });
  const catalog=settings.data?incomeCatalog(settings.data.settings):[];
  const remove=useMutation({mutationFn:async(name:string)=>{const current=settings.data!.settings;const incomeDocuments={...current.incomeDocuments},incomeTypes=Object.fromEntries(incomeCatalog(current).map(t=>[t.name,t.customerType]));delete incomeDocuments[name];delete incomeTypes[name];return saveIncomeSettings({...current,incomeDocuments,incomeTypes});},onSuccess:()=>{void qc.invalidateQueries({queryKey:["settings"]});toast.success("Tipo de renda excluído; histórico preservado");},onError:error=>toast.error(error.message)});
  return <section className="checklist-page"><span className="eyebrow">DOCUMENTAÇÃO</span><h1>Check-list</h1><p>Consulte os documentos da pré-análise e copie a lista para compartilhar no WhatsApp. As marcações são apenas desta consulta.</p>
    {settings.isLoading && <p role="status">Carregando documentação…</p>}{settings.error && <p className="auth-error">{settings.error.message}</p>}
    {user.role==="admin"&&settings.data&&<button className="primary-button" onClick={()=>setEditor({original:null})}><Plus size={17}/> Novo tipo de renda</button>}
    <div className="checklist-grid">{catalog.map(({name:income,documents,customerType}) => {
      const personal = customerType==="PF", Icon = personal ? UserRound : Building2;
      const selection = checked[income] ?? [];
      return <article className="panel checklist-card" key={income} data-income={income}>
        <header><div className="checklist-card-icon"><Icon size={24} aria-hidden="true" /></div><div><small>{personal ? "Pessoa física" : "Pessoa jurídica"}</small><h2>{income}</h2></div></header>
        <div className="checklist-documents">{documents.map(doc => <label className="checklist-item" key={doc}><input type="checkbox" checked={selection.includes(doc)} onChange={e => { const selected = e.target.checked; setChecked(current => ({ ...current, [income]: selected ? [...(current[income] ?? []), doc] : (current[income] ?? []).filter(value => value !== doc) })); }} /><span>{doc}</span></label>)}
        {settings.isSuccess && !documents.length && <p>Nenhum documento definido para este tipo. Consulte o administrador.</p>}</div>
        <footer><button className="secondary-button" disabled={!documents.length || !settings.isSuccess} onClick={() => void copyText(checklistText(income, documents, selection.filter(doc => documents.includes(doc)),customerType))}><Copy size={17} /> Copiar check-list</button>{user.role==="admin"&&<div className="checklist-edit-actions"><button className="secondary-button" disabled={remove.isPending} onClick={()=>setEditor({original:income})}><Pencil size={15}/> Editar</button><button className="danger-button" disabled={remove.isPending||catalog.length<=1} onClick={()=>{if(window.confirm(`Excluir o tipo de renda ${income}? As pré-análises existentes serão preservadas.`))remove.mutate(income);}}><Trash2 size={15}/> Excluir</button></div>}</footer>
      </article>;
    })}</div>
    <p className="checklist-guidance">Informe nome / razão social, CPF / CNPJ e tipo de renda. O envio exige autorização do titular. Arquivos: PDF, JPG ou PNG.</p>
    {editor&&settings.data&&<IncomeTypeEditor settings={settings.data.settings} original={editor.original} onClose={()=>setEditor(null)}/>}
  </section>;
}
