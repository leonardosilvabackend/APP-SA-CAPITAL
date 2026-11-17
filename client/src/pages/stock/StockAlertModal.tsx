import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import CurrencyInput from "../../components/CurrencyInput";
import { currencyInputValue } from "../../lib/currencyInput";
import type { StockFilters } from "./contracts";

type Form={administrator:string;category:string;desiredCredit:string;maxEntryPercent:string;maxInstallment:string;outstandingBalanceRelation:string};
type Wish={id:string;administrator:string;category:string;targetCredit:string|null};
export default function StockAlertModal({filters,onClose}:{filters?:StockFilters;onClose:()=>void}){
 const qc=useQueryClient(),[form,setForm]=useState<Form>({administrator:"",category:"",desiredCredit:"",maxEntryPercent:"",maxInstallment:"",outstandingBalanceRelation:""});
 const wishes=useQuery<{items:Wish[]}>({queryKey:["stock-wishes"],queryFn:async()=>{const response=await fetch("/api/profile/stock-wishes");if(!response.ok)throw new Error("Não foi possível carregar seus pedidos");return response.json()}});
 const field=(key:keyof Form,value:string)=>setForm(old=>({...old,[key]:value}));
 const save=useMutation({mutationFn:async()=>{const body={administrator:form.administrator||null,category:form.category||null,desiredCredit:form.desiredCredit?currencyInputValue(form.desiredCredit):null,maxEntryPercent:form.maxEntryPercent?Number(form.maxEntryPercent):null,maxInstallment:form.maxInstallment?currencyInputValue(form.maxInstallment):null,outstandingBalanceRelation:form.outstandingBalanceRelation||null,active:true};const response=await fetch("/api/profile/stock-alert",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error)},onSuccess:()=>{void qc.invalidateQueries({queryKey:["stock"]});toast.success("Alerta ativado");onClose()},onError:e=>toast.error(e.message)});
 const cancelWish=async(id:string)=>{const response=await fetch(`/api/profile/stock-wishes/${id}`,{method:"DELETE"});if(!response.ok)return toast.error("Não foi possível cancelar o pedido");await qc.invalidateQueries({queryKey:["stock-wishes"]});toast.success("Pedido cancelado")};
 return <div className="modal-backdrop"><form className="stock-modal stock-alert-modal" onSubmit={e=>{e.preventDefault();save.mutate()}}>
  <div className="modal-heading"><div><span className="eyebrow">ME AVISE!</span><h2>Deixe aqui o tipo de cota que você gosta</h2></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div>
  <p>Vou notificá-lo(a) quando ela chegar no estoque e também deixarei ela em destaque.</p>
  <div className="quota-form-grid">
   <label>Administradora<select value={form.administrator} onChange={e=>field("administrator",e.target.value)}><option value="">Todas administradoras</option>{filters?.administrators.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Categoria<select value={form.category} onChange={e=>field("category",e.target.value)}><option value="">Todas</option>{filters?.categories.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Crédito desejado<CurrencyInput value={form.desiredCredit} onChange={value=>field("desiredCredit",value)}/><small>Considera uma faixa de ±2%.</small></label>
   <label>% máxima de entrada<input type="number" min="0" max="100" value={form.maxEntryPercent} onChange={e=>field("maxEntryPercent",e.target.value)}/></label>
   <label>Parcela máxima<CurrencyInput value={form.maxInstallment} onChange={value=>field("maxInstallment",value)}/></label>
   <label>Saldo devedor<select value={form.outstandingBalanceRelation} onChange={e=>field("outstandingBalanceRelation",e.target.value)}><option value="">Sem preferência</option><option value="below_credit">Abaixo do crédito</option><option value="above_credit">Acima do crédito</option></select></label>
  </div>
  <button className="primary-button button-reset" disabled={save.isPending}>Ativar alerta</button>
  {Boolean(wishes.data?.items.length)&&<section className="stock-wish-list"><h3>Pedidos específicos ativos</h3>{wishes.data!.items.map(item=><div key={item.id}><span><strong>{item.administrator}</strong> · {item.category}{item.targetCredit?` · crédito R$ ${Number(item.targetCredit).toLocaleString("pt-BR")}`:""}</span><button type="button" className="text-button" onClick={()=>void cancelWish(item.id)}>Cancelar</button></div>)}</section>}
 </form></div>
}
