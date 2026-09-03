import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, PackageSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type CalculationQuota = { id: string; code: string; category: string; administrator: string; creditAmount: string; entryAmount: string; installmentCount: number; installmentAmount: string; outstandingBalance: string };
type QuoteResponse = { quotas: CalculationQuota[]; summary: { creditTotal: number; baseEntryTotal: number; commissionRate: number; commissionTotal: number; finalEntryTotal: number; entryPercentage: number; outstandingBalanceTotal: number; transferFeeTotal: number; insuranceTotal: number; installmentCascade: { from: number; to: number; amount: number }[] }; commercialText: string };

const money = (value: number | string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));

async function calculate(ids: string[], commissionRate: number) {
  const response = await fetch("/api/quotes/calculate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotaIds: ids, commissionRate }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível calcular a cotação");
  return data;
}

export default function SimulatorPage() {
  const [ids, setIds] = useState<string[]>(() => JSON.parse(sessionStorage.getItem("sa-capital-selected-quotas") ?? "[]"));
  const [commissionRate, setCommissionRate] = useState(() => Number(sessionStorage.getItem("sa-capital-commission-rate") ?? 0));
  const quote = useQuery<QuoteResponse>({ queryKey: ["quote-calculation", ids, commissionRate], queryFn: () => calculate(ids, commissionRate), enabled: ids.length > 0, retry: false });
  function remove(id: string) { const next = ids.filter(value => value !== id); setIds(next); sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(next)); }
  function updateCommission(value: number) { setCommissionRate(value); sessionStorage.setItem("sa-capital-commission-rate", String(value)); }
  async function copyCommercial() { if (!quote.data) return; await navigator.clipboard.writeText(quote.data.commercialText); toast.success("Cotação comercial copiada"); }
  if (!ids.length) return <section className="simulator-page"><span className="eyebrow">SIMULADOR</span><h1>Componha uma cotação</h1><div className="empty-state"><span><PackageSearch size={30} /></span><h2>Nenhuma cota selecionada</h2><p>Escolha até 12 cotas disponíveis no estoque para montar uma condição comercial.</p><Link href="/estoque" className="primary-button"><ArrowLeft size={17} /> Ir para o estoque</Link></div></section>;
  return <section className="simulator-page"><div className="page-heading-row"><div><span className="eyebrow">SIMULADOR</span><h1>Composição da cotação</h1><p>{ids.length} cota{ids.length === 1 ? "" : "s"} na composição.</p></div><Link href="/estoque" className="secondary-button back-link"><ArrowLeft size={17} /> Alterar seleção</Link></div>
    {quote.error && <div className="auth-error quote-error">{quote.error.message}</div>}{quote.isLoading && <div className="table-message">Calculando no servidor…</div>}{quote.data && <div className="simulator-grid"><div className="simulator-main"><div className="panel selected-quotas"><div className="panel-heading"><div><span className="eyebrow">COTAS SELECIONADAS</span><h2>Composição</h2></div></div>{quote.data.quotas.map(quota => <div className="selected-quota" key={quota.id}><div><strong>{quota.code}</strong><small>{quota.category} • {quota.administrator}</small></div><span>{money(quota.creditAmount)}</span><button className="icon-button" onClick={() => remove(quota.id)} aria-label={`Remover ${quota.code}`}><Trash2 size={16} /></button></div>)}</div>
      <div className="panel cascade-panel"><span className="eyebrow">PRAZO E PARCELAS</span><h2>Cascata de pagamento</h2>{quote.data.summary.installmentCascade.map(period => <div className="cascade-row" key={`${period.from}-${period.to}`}><span>{period.from}ª à {period.to}ª parcela</span><strong>{money(period.amount)}</strong></div>)}</div></div>
      <aside className="panel quote-summary"><span className="eyebrow">RESUMO PRIVADO</span><h2>Condição calculada</h2><div className="summary-highlight"><span>Crédito total</span><strong>{money(quote.data.summary.creditTotal)}</strong></div><label className="commission-control"><span>Comissão <strong>{commissionRate.toFixed(1).replace(".", ",")}%</strong></span><input type="range" min="0" max="8" step="0.1" value={commissionRate} onChange={event => updateCommission(Number(event.target.value))} /><small>Permitida entre 0% e 8%</small></label><div className="summary-list"><p><span>Entrada original</span><strong>{money(quote.data.summary.baseEntryTotal)}</strong></p><p><span>Comissão</span><strong>{money(quote.data.summary.commissionTotal)}</strong></p><p className="final-entry"><span>Entrada final</span><strong>{money(quote.data.summary.finalEntryTotal)}</strong><small>{quote.data.summary.entryPercentage.toFixed(2).replace(".", ",")}% do crédito</small></p><p><span>Saldo devedor</span><strong>{money(quote.data.summary.outstandingBalanceTotal)}</strong></p><p><span>Taxa de transferência</span><strong>{money(quote.data.summary.transferFeeTotal)}</strong></p><p><span>Seguro estimado</span><strong>{money(quote.data.summary.insuranceTotal)}</strong></p></div><button className="copy-button" onClick={() => void copyCommercial()}><Copy size={18} /> Copiar cotação comercial</button><div className="privacy-note"><Check size={15} /><span>O texto copiado não informa comissão, fornecedor ou dados administrativos.</span></div></aside></div>}
  </section>;
}
