import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BellRing, SearchX, X } from "lucide-react";
import { specificSearchInputSchema, type SpecificSearchInput } from "@shared/stock";
import CurrencyInput from "../../components/CurrencyInput";
import { currencyInputValue } from "../../lib/currencyInput";
import { dismissBackdrop } from "../../lib/dismissBackdrop";
import { stockApi, stockCurrency, type QuotaRecord, type StockFilters } from "./contracts";

const MONEY_MAX = { targetCredit: 5_000_000, maxEntry: 3_500_000, maxInstallment: 200_000, maxBalance: 8_000_000 } as const;
const moneyKeys = new Set(["targetCredit", "maxEntry", "maxInstallment", "maxBalance"]);
type MoneyKey = keyof typeof MONEY_MAX;
type Form = Record<"administrator" | "category" | MoneyKey, string>;
type Result = { items: QuotaRecord[]; summary: { creditTotal: number; entryTotal: number; installmentTotal: number; balanceTotal: number } | null; savedWish: boolean };

export default function SpecificSearchModal({ filters, onUse, onClose }: { filters?: StockFilters; onUse: (ids: string[]) => void; onClose: () => void }) {
  const [form, setForm] = useState<Form>({ administrator: "", category: "", targetCredit: "R$ 0,00", maxEntry: "R$ 0,00", maxInstallment: "R$ 0,00", maxBalance: "R$ 0,00" });
  const [showNotFound, setShowNotFound] = useState(false);
  const input = Object.fromEntries(Object.entries(form).map(([key, value]) => {
    if (key === "administrator" || key === "category") return [key, value];
    const number = moneyKeys.has(key) ? currencyInputValue(value) : Number(value);
    return [key, value === "" || number === 0 ? undefined : number];
  })) as SpecificSearchInput;
  const parsed = specificSearchInputSchema.safeParse(input);
  const search = useMutation<Result, Error, SpecificSearchInput>({ mutationFn: value => stockApi("/smart-search/specific", { method: "POST", body: JSON.stringify(value) }), onSuccess: data => setShowNotFound(data.savedWish) });
  const change = (key: keyof Form, value: string) => setForm(old => ({ ...old, [key]: value }));
  const moneyField = (key: MoneyKey, label: string, optional = false) => {
    const maximum = MONEY_MAX[key], value = Math.min(maximum, currencyInputValue(form[key]));
    return <label>{label} {optional && <small>(Opcional)</small>}<CurrencyInput value={form[key]} onChange={text => change(key, currencyInputValue(text) > maximum ? stockCurrency(maximum) : text)} /><input type="range" min="0" max={maximum} step="1000" value={value} onChange={event => change(key, stockCurrency(Number(event.target.value)))} /><span className="range-scale"><b>R$ 0,00</b><b>{stockCurrency(maximum)}</b></span></label>;
  };

  return <>
    <div className="modal-backdrop" {...dismissBackdrop(onClose)}><section className="stock-modal specific-search-modal" role="dialog" aria-modal="true" aria-labelledby="specific-search-title">
      <div className="modal-heading"><div><span className="eyebrow">PEDIDO ESPECÍFICO</span><h2 id="specific-search-title">Encontre exatamente o que procura</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></div>
      <form onSubmit={event => { event.preventDefault(); if (parsed.success) search.mutate(parsed.data); }}><div className="specific-grid">
        <label>Administradora<select required value={form.administrator} onChange={event => change("administrator", event.target.value)}><option value="">Selecione</option>{filters?.administrators.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Categoria<select required value={form.category} onChange={event => change("category", event.target.value)}><option value="">Selecione</option>{filters?.categories.map(value => <option key={value}>{value}</option>)}</select></label>
        {moneyField("targetCredit", "Crédito")}{moneyField("maxEntry", "Entrada máxima")}{moneyField("maxInstallment", "Parcela máxima")}
        {moneyField("maxBalance", "Saldo devedor máximo", true)}
      </div><button className="primary-button" disabled={!parsed.success || search.isPending}>{search.isPending ? "Buscando combinações…" : "Buscar no estoque"}</button></form>
      {search.error && <div className="auth-error" role="alert">{search.error.message}</div>}
      {search.data?.items.length ? <article className="specific-combination"><div><span className="eyebrow">COMBINAÇÃO ENCONTRADA</span><h3>{search.data.items.length} {search.data.items.length === 1 ? "cota" : "cotas"} de {form.administrator}</h3></div>{search.data.summary && <dl><div><dt>Crédito total</dt><dd>{stockCurrency(search.data.summary.creditTotal)}</dd></div><div><dt>Entrada total</dt><dd>{stockCurrency(search.data.summary.entryTotal)}</dd></div><div><dt>Parcela total</dt><dd>{stockCurrency(search.data.summary.installmentTotal)}</dd></div><div><dt>Saldo devedor</dt><dd>{stockCurrency(search.data.summary.balanceTotal)}</dd></div></dl>}<div className="specific-combination-items">{search.data.items.map(quota => <span key={quota.id}><strong>Cota {quota.code}</strong> · Crédito {stockCurrency(quota.creditAmount)}</span>)}</div><button className="primary-button" onClick={() => onUse(search.data!.items.map(quota => quota.id))}>Ver cotação completa</button></article> : null}
    </section></div>
    {showNotFound && <div className="modal-backdrop specific-feedback-backdrop"><section className="specific-feedback-card" role="alertdialog" aria-modal="true" aria-labelledby="specific-not-found-title"><button type="button" className="icon-button specific-feedback-close" onClick={() => setShowNotFound(false)} aria-label="Fechar aviso"><X /></button><div className="specific-feedback-figure"><SearchX /><BellRing /></div><span className="eyebrow">ME AVISE ATIVADO</span><h2 id="specific-not-found-title">Ainda não encontramos essa combinação</h2><p>Seu pedido foi salvo com segurança. Assim que uma combinação dentro dos critérios estiver disponível, você receberá uma notificação.</p><button type="button" className="primary-button" onClick={() => setShowNotFound(false)}>Entendi</button></section></div>}
  </>;
}
