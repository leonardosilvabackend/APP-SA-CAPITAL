import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Star, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { type StockSort } from "@shared/stock-sort";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";
import QuotePanel, { type QuoteResponse } from "./QuotePanel";
import { selectionSurface } from "../lib/selectionSurface";
import AdministratorLogo from "../components/AdministratorLogo";
import StockOpportunitiesModal from "./stock/StockOpportunitiesModal";
import QuotaFormModal from "./stock/QuotaFormModal";
import StockImportModal from "./stock/StockImportModal";
import StockSmartSearchModal from "./stock/SmartSearchModal";
import { stockApi, stockCurrency as currency, type Opportunity, type QuotaRecord, type StockFilters, type StockResponse } from "./stock/contracts";

export default function StockPage({ user }: { user: AuthenticatedUser }) {
  const [sort, setSort] = useState<StockSort>("default");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [administrator, setAdministrator] = useState("");
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<QuotaRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [smartSearching, setSmartSearching] = useState(false);
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => JSON.parse(sessionStorage.getItem("sa-capital-selected-quotas") ?? "[]"));
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, ...(search ? { search } : {}), ...(category ? { category } : {}), ...(administrator ? { administrator } : {}), ...(status ? { status } : {}) });
  const stock = useQuery<StockResponse>({ refetchInterval: 30_000, queryKey: ["stock", page, pageSize, search, category, administrator, status, sort], queryFn: () => stockApi(`?${params}`) });
  const filters = useQuery<StockFilters>({ queryKey: ["stock-filters"], queryFn: () => stockApi("/filters") });
  const opportunities = useQuery<{ items: Opportunity[] }>({ queryKey: ["opportunities"], queryFn: async () => { const response = await fetch("/api/quotes/opportunities"); if (!response.ok) throw new Error("Não foi possível carregar oportunidades"); return response.json(); }, refetchInterval: 30_000 });
  const selectionSummary = useQuery<QuoteResponse>({ queryKey: ["selection-credit", selectedIds], queryFn: async () => { const response = await fetch("/api/quotes/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotaIds: selectedIds, commissionRate: 0 }) }); if (!response.ok) throw new Error("Não foi possível calcular o crédito selecionado"); return response.json(); }, enabled: selectedIds.length > 0, retry: false });
  const settings = useQuery<{ settings: { legalNotice: string } }>({ queryKey: ["settings"], queryFn: async () => { const response = await fetch("/api/settings"); if (!response.ok) throw new Error("Configurações indisponíveis"); return response.json(); } });
  const isAdmin = ["admin", "administrative"].includes(user.role);
  useEffect(() => {
    const codes = search.split(/[\s,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
    if (codes.length < 2 || !stock.data) return;
    const found = codes.map(code => stock.data!.items.find(item => item.code.toLowerCase() === code)).filter((item): item is QuotaRecord => !!item && item.status === "available");
    if (!found.length) return;
    const compatible = found.filter(item => item.category === found[0].category && item.administrator === found[0].administrator);
    const ids = compatible.map(item => item.id);
    setSelectedIds(ids); sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(ids));
    if (compatible.length !== codes.length) toast.error("Algumas cotas não foram encontradas, estão indisponíveis ou não podem ser unidas");
  }, [search, stock.data]);
  function sortControl(label: string, ascending: StockSort, descending: StockSort) {
    const active = sort === ascending || sort === descending;
    const next = sort === ascending ? descending : ascending;
    return <button type="button" className="stock-column-sort" data-active={active} title={`Ordenar ${label}: ${next === ascending ? "menor para maior" : "maior para menor"}`} aria-label={`Ordenar ${label}: ${next === ascending ? "menor para maior" : "maior para menor"}`} onClick={() => { setSort(next); setPage(1); }}>
      {label}{sort === ascending ? <ArrowUp size={14} /> : sort === descending ? <ArrowDown size={14} /> : <ArrowUpDown size={14} />}
    </button>;
  }
  function sortDirection(ascending: StockSort, descending: StockSort) {
    return sort === ascending ? "ascending" as const : sort === descending ? "descending" as const : undefined;
  }
  function toggleSelection(id: string) {
    setSelectedIds(current => {
      const quota = stock.data?.items.find(item => item.id === id);
      if (!quota || quota.status !== "available") return current;
      const first = stock.data?.items.find(item => current.includes(item.id));
      if (!current.includes(id) && first && quota && (first.category !== quota.category || first.administrator !== quota.administrator)) { toast.error("A junção deve ter a mesma categoria e administradora"); return current; }
      const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
      sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(next));
      return next;
    });
  }
  const selectedCredit = selectionSummary.data?.summary.creditTotal ?? selectedIds.reduce((total, id) => total + Number(stock.data?.items.find(item => item.id === id)?.creditAmount ?? 0), 0);
  return <section className="stock-page"><div className="page-heading-row"><div><span className="eyebrow">OPERAÇÃO COMERCIAL</span><h1>Estoque de cotas</h1><p>{stock.data?.total ?? 0} condições encontradas.</p></div><div className="heading-actions">{!!opportunities.data?.items.length && <button className="opportunity-button" onClick={() => setShowOpportunities(true)}><Star size={18} fill="currentColor" /> Oportunidades do dia!</button>}<button className="primary-button button-reset smart-order-button" onClick={() => setSmartSearching(true)}><Sparkles size={19} /> Pedido Inteligente</button>{isAdmin && <><button className="secondary-button" onClick={() => setImporting(true)}><Upload size={17} /> Importar planilha</button><button className="primary-button button-reset" onClick={() => setCreating(true)}><Plus size={18} /> Nova cota</button></>}</div></div>
    <div className="stock-filters panel"><label className={`search-field ${search ? "filter-active" : ""}`}><Search size={18} /><input placeholder="Buscar ou colar vários códigos" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select className={category ? "filter-active" : ""} value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{filters.data?.categories.map(value => <option key={value}>{value}</option>)}</select><select className={administrator ? "filter-active" : ""} value={administrator} onChange={event => { setAdministrator(event.target.value); setPage(1); }}><option value="">Todas as administradoras</option>{filters.data?.administrators.map(value => <option key={value}>{value}</option>)}</select>{isAdmin && <select className={status ? "filter-active" : ""} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option><option value="available">Disponíveis</option><option value="reserved">Reservadas</option></select>}<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="20">20 por página</option><option value="50">50 por página</option><option value="100">100 por página</option></select></div>
    <div className="stock-table-wrap panel">{stock.isLoading && <div className="table-message">Carregando estoque…</div>}{stock.error && <div className="auth-error">{stock.error.message}</div>}{stock.data && <table className="stock-table"><thead><tr><th>Administradora</th><th>Cota</th><th aria-sort={sortDirection("credit_asc", "credit_desc")}>{sortControl("Crédito", "credit_asc", "credit_desc")}</th><th aria-sort={sortDirection("entry_asc", "entry_desc")}>{sortControl("Entrada", "entry_asc", "entry_desc")}</th><th aria-sort={sortDirection("entry_percent_asc", "entry_percent_desc")}>{sortControl("%", "entry_percent_asc", "entry_percent_desc")}</th><th aria-sort={sortDirection("term_asc", "term_desc")}>{sortControl("Prazo", "term_asc", "term_desc")}</th><th aria-sort={sortDirection("installment_asc", "installment_desc")}>{sortControl("Parcela", "installment_asc", "installment_desc")}</th><th aria-sort={sortDirection("balance_asc", "balance_desc")}>{sortControl("Saldo devedor", "balance_asc", "balance_desc")}</th><th>Situação</th>{isAdmin && <th />}</tr></thead><tbody>{stock.data.items.map(quota => <tr key={quota.id} {...selectionSurface(() => toggleSelection(quota.id), quota.status !== "available")} aria-selected={selectedIds.includes(quota.id)} aria-label={`Selecionar cota ${quota.code}`} className={[quota.featured ? "featured-row" : "", selectedIds.includes(quota.id) ? "selection-active" : ""].filter(Boolean).join(" ")}><td><AdministratorLogo name={quota.administrator} /></td><td><div className="quota-code"><strong>{quota.code}{quota.featured && <Star size={14} fill="currentColor" />}</strong><small>{quota.category} • {quota.administrator}{quota.supplier ? ` • ${quota.supplier}` : ""}</small></div></td><td><strong>{currency(quota.creditAmount)}</strong></td><td>{currency(quota.entryAmount)}</td><td><strong>{(Number(quota.entryAmount) / Number(quota.creditAmount) * 100).toFixed(2).replace(".", ",")}%</strong></td><td>{quota.installmentCount}</td><td>{Number(quota.installmentAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>{currency(quota.outstandingBalance)}</td><td><span className={`quota-status ${quota.status}`}>{quota.status === "available" ? "Disponível" : quota.status === "reserved" ? "Reservada" : "Vendida"}</span></td>{isAdmin && <td><button className="icon-button table-edit" onClick={event => { event.stopPropagation(); setEditing(quota); }}><Pencil size={16} /></button></td>}</tr>)}</tbody></table>}{stock.data?.items.length === 0 && <div className="table-message">Nenhuma cota encontrada.</div>}</div>
    {stock.data && stock.data.totalPages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /> Anterior</button><span>Página {page} de {stock.data.totalPages}</span><button disabled={page >= stock.data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima <ChevronRight size={17} /></button></div>}
    {selectedIds.length > 0 && <div className="selection-bar"><div><strong>{selectedIds.length} cota{selectedIds.length === 1 ? "" : "s"} selecionada{selectedIds.length === 1 ? "" : "s"}</strong><span className="selection-credit">Crédito {selectedIds.length > 1 ? "total " : ""}{currency(selectedCredit)}</span></div><button className="secondary-button" onClick={() => { setSelectedIds([]); setSearch(""); setPage(1); sessionStorage.removeItem("sa-capital-selected-quotas"); }}>Limpar</button><button className="primary-button button-reset" onClick={() => setQuoting(true)}>Ver cotação <ChevronRight size={18} /></button></div>}
    {quoting && <QuotePanel ids={selectedIds} onClose={() => setQuoting(false)} />}
    {smartSearching && <StockSmartSearchModal filters={filters.data} onClose={() => setSmartSearching(false)} onUse={ids => { setSelectedIds(ids); sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(ids)); setSmartSearching(false); setQuoting(true); }} />}
    {showOpportunities && <StockOpportunitiesModal items={opportunities.data?.items ?? []} onClose={() => setShowOpportunities(false)} onChoose={ids => { setSelectedIds(ids); sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(ids)); setShowOpportunities(false); setQuoting(true); }} />}
    {creating && <QuotaFormModal onClose={() => setCreating(false)} />}{editing && <QuotaFormModal quota={editing} onClose={() => setEditing(null)} />}{importing && <StockImportModal onClose={() => setImporting(false)} />}
    <footer className="legal-notice">{settings.data?.settings.legalNotice ?? "A SA CAPITAL se isenta de qualquer responsabilidade sobre alteração de valores, fica a responsabilidade do parceiro verificar junto ao seu assessor os valores atualizados antes de qualquer negociação."}</footer>
  </section>;
}
