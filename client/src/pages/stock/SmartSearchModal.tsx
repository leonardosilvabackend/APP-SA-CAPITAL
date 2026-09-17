import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { smartSearchInputSchema, type SmartSearchInput } from "@shared/stock";
import type { SmartResult, SmartOptionKind } from "@shared/smart-result";
import { dismissBackdrop } from "../../lib/dismissBackdrop";
import { stockApi, stockCurrency as currency, type QuotaRecord, type StockFilters } from "./contracts";
import CurrencyInput from "../../components/CurrencyInput";
import { currencyInputValue } from "../../lib/currencyInput";

const labels = { entry: "Menor entrada", installment: "Menor parcela", balance: "Menor saldo devedor" };

export default function SmartSearchModal({ filters, onUse, onClose }: { filters?: StockFilters; onUse: (ids: string[]) => void; onClose: () => void }) {
  const [form, setForm] = useState({ category: "", administrator: "", targetCredit: "", priority: "", secondaryAmount: "" });
  const search = useMutation<SmartResult<QuotaRecord>, Error, SmartSearchInput>({ mutationFn: input => stockApi("/smart-search", { method: "POST", body: JSON.stringify(input) }) });
  function change(field: keyof typeof form, value: string) { if(form[field]===value)return;setForm(current => ({ ...current, [field]: value, ...(field === "priority" ? { secondaryAmount: "" } : {}) })); search.reset(); }
  const parsed = smartSearchInputSchema.safeParse({ ...form, targetCredit: currencyInputValue(form.targetCredit), secondaryAmount: form.secondaryAmount === "" ? undefined : currencyInputValue(form.secondaryAmount) });
  const primary = form.priority as keyof typeof labels;
  const secondary = primary === "entry" ? "installment" : "entry";
  const headings: Record<SmartOptionKind,string> = { request:"Pedido do cliente",primary:labels[primary] ?? "",secondary:`${labels[secondary]} para o crédito desejado`,...labels };
  const grouped = new Map<string, { option: NonNullable<typeof search.data>["options"][number]; kinds: SmartOptionKind[] }>();
  for (const option of search.data?.options ?? []) { const key = option.items.map(q => q.id).sort().join(","); const existing = grouped.get(key); if (existing) existing.kinds.push(option.kind); else grouped.set(key, { option, kinds: [option.kind] }); }
  return <div className="modal-backdrop" {...dismissBackdrop(onClose)}><section className="stock-modal smart-order-modal" role="dialog" aria-modal="true" aria-labelledby="smart-order-title">
    <div className="modal-heading"><div><span className="eyebrow"><Sparkles size={16} /> PEDIDO INTELIGENTE</span><h2 id="smart-order-title">Encontre a melhor oportunidade</h2></div><button type="button" className="icon-button" aria-label="Fechar pedido inteligente" onClick={onClose}><X size={19} /></button></div>
    <form onSubmit={e => { e.preventDefault(); if (parsed.success && !search.isPending) search.mutate(parsed.data); }}><fieldset className="quota-form-grid smart-order-fields" disabled={search.isPending}>
      <label>Administradora<select value={form.administrator} onChange={e => change("administrator", e.target.value)}><option value="">Todas as administradoras</option>{filters?.administrators.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Categoria<select required value={form.category} onChange={e => change("category", e.target.value)}><option value="">Selecione a categoria</option>{filters?.categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Crédito desejado (R$)<CurrencyInput required value={form.targetCredit} onChange={value => change("targetCredit", value)} /></label>
      <label>Critério decisor<select required value={form.priority} onChange={e => change("priority", e.target.value)}><option value="">Selecione o critério</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {form.priority && <label>{form.priority === "entry" ? "Parcela máxima (R$)" : "Entrada sugerida (R$)"} <small>(Opcional)</small><CurrencyInput key={form.priority} value={form.secondaryAmount} onChange={value => change("secondaryAmount", value)} /></label>}
    </fieldset>
    <div className="form-actions"><button className="primary-button button-reset smart-order-button" disabled={!parsed.success || search.isPending}><Sparkles size={17} /> {search.isPending ? "Buscando…" : "Encontrar oportunidades"}</button></div></form>
    {search.error && <div className="auth-error" role="alert">{search.error.message}</div>}
    {search.data && !search.data.complete && <p className="smart-order-empty" role="status">Resultado parcial. Confira as alternativas encontradas ou selecione uma administradora para refinar a busca.</p>}
    {search.data && (form.secondaryAmount ? !search.data.options.some(o => o.kind === "request") : !search.data.options.length) && <p className="smart-order-empty" role="status">{search.data.complete ? "Nenhuma condição atende ao pedido informado." : "Ainda não foi encontrada uma condição que atenda ao pedido."} As alternativas abaixo podem estar fora do pedido.</p>}
    <div className="smart-order-results">{Array.from(grouped.values()).map(({ option, kinds }) => <article className="smart-result smart-order-result" key={option.items.map(q => q.id).sort().join(",")}>
      <strong>{kinds.map(kind => headings[kind]).join(" / ")}</strong>
      {kinds.includes("request") && <span>{labels[primary]} {primary === "entry" ? `com parcela de até ${currency(currencyInputValue(form.secondaryAmount))}` : `com entrada próxima de ${currency(currencyInputValue(form.secondaryAmount))}`}</span>}
      <span>{search.data?.complete ? "Comparação concluída" : "Melhor alternativa encontrada até aqui"}</span>
      {!option.matchesRequest && <p className="auth-error">Esta alternativa está fora do orçamento informado.</p>}
      <dl><div><dt>Crédito total</dt><dd>{currency(option.summary.creditTotal)}</dd></div><div><dt>Entrada total</dt><dd>{currency(option.summary.entryTotal)}</dd></div><div><dt>Primeira parcela</dt><dd>{currency(option.summary.installmentTotal)}</dd></div><div><dt>Saldo devedor total</dt><dd>{currency(option.summary.balanceTotal)}</dd></div></dl>
      <div className="smart-order-quota-list" tabIndex={0} role="region" aria-label="Cotas desta alternativa">{option.items.map(item => <div className="smart-order-quota" key={item.id}><strong>Cota {item.code} • {item.administrator}</strong><span>Crédito: {currency(item.creditAmount)} • Entrada: {currency(item.entryAmount)}</span><span>{item.installmentCount} parcelas • Primeira parcela: {currency(item.installmentAmount)}</span></div>)}</div>
      <button className="primary-button button-reset" onClick={() => onUse(option.items.map(item => item.id))}>Ver cotação</button>
    </article>)}</div>
  </section></div>;
}
