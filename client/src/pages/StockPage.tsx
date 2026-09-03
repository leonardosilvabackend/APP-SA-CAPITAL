import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Plus, Search, Star, Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";
import QuotePanel from "./QuotePanel";

type QuotaRecord = {
  id: string; code: string; category: string; administrator: string; supplier: string | null;
  creditAmount: string; entryAmount: string; installmentCount: number; installmentAmount: string;
  outstandingBalance: string; status: "available" | "reserved" | "sold"; featured: boolean;
};
type StockResponse = { items: QuotaRecord[]; page: number; pageSize: number; total: number; totalPages: number };
type PreviewRow = { row: number; valid: boolean; error?: string; data?: unknown };

const emptyForm = { code: "", category: "", administrator: "", supplier: "", creditAmount: "", entryAmount: "", installmentCount: "", installmentAmount: "", outstandingBalance: "", status: "available", featured: false };

async function stockApi(path = "", options?: RequestInit) {
  const response = await fetch(`/api/stock${path}`, { credentials: "same-origin", ...options, headers: options?.body ? { "Content-Type": "application/json", ...options.headers } : options?.headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação");
  return data;
}

function currency(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function QuotaForm({ quota, onClose }: { quota?: QuotaRecord; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(quota ? { ...quota, supplier: quota.supplier ?? "", creditAmount: String(quota.creditAmount), entryAmount: String(quota.entryAmount), installmentCount: String(quota.installmentCount), installmentAmount: String(quota.installmentAmount), outstandingBalance: String(quota.outstandingBalance) } : emptyForm);
  const save = useMutation({
    mutationFn: () => stockApi(quota ? `/${quota.id}` : "", { method: quota ? "PATCH" : "POST", body: JSON.stringify(form) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["stock"] }); void queryClient.invalidateQueries({ queryKey: ["stock-filters"] }); toast.success(quota ? "Cota atualizada" : "Cota cadastrada"); onClose(); },
  });
  const remove = useMutation({ mutationFn: () => stockApi(`/${quota!.id}`, { method: "DELETE" }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["stock"] }); toast.success("Cota excluída"); onClose(); } });
  const field = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  return <div className="modal-backdrop"><form className="stock-modal" onSubmit={event => { event.preventDefault(); save.mutate(); }}><div className="modal-heading"><div><span className="eyebrow">{quota ? "EDITAR COTA" : "NOVA COTA"}</span><h2>{quota ? quota.code : "Cadastrar no estoque"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="quota-form-grid">
    <label>Código<input value={form.code} onChange={event => field("code", event.target.value)} required /></label>
    <label>Categoria<input value={form.category} onChange={event => field("category", event.target.value)} placeholder="Imóvel, veículo…" required /></label>
    <label>Administradora<input value={form.administrator} onChange={event => field("administrator", event.target.value)} required /></label>
    <label>Fornecedor<input value={form.supplier} onChange={event => field("supplier", event.target.value)} /></label>
    <label>Crédito<input value={form.creditAmount} onChange={event => field("creditAmount", event.target.value)} placeholder="150.000,00" required /></label>
    <label>Entrada<input value={form.entryAmount} onChange={event => field("entryAmount", event.target.value)} placeholder="30.000,00" required /></label>
    <label>Nº parcelas<input type="number" min="1" value={form.installmentCount} onChange={event => field("installmentCount", event.target.value)} required /></label>
    <label>Valor da parcela<input value={form.installmentAmount} onChange={event => field("installmentAmount", event.target.value)} placeholder="1.250,00" required /></label>
    <label>Saldo devedor<input value={form.outstandingBalance} onChange={event => field("outstandingBalance", event.target.value)} required /></label>
    <label>Situação<select value={form.status} onChange={event => field("status", event.target.value)}><option value="available">Disponível</option><option value="reserved">Reservada</option></select></label>
    <label className="featured-check"><input type="checkbox" checked={form.featured} onChange={event => field("featured", event.target.checked)} /> Destacar esta condição</label>
  </div>{save.error && <div className="auth-error">{save.error.message}</div>}<div className="form-actions">{quota && <button type="button" className="danger-button" disabled={remove.isPending} onClick={() => { if (window.confirm(`Excluir permanentemente a cota ${quota.code}?`)) remove.mutate(); }}>Excluir</button>}<button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button button-reset" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar cota"}</button></div></form></div>;
}

function normalizedHeader(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function rowValue(row: Record<string, unknown>, aliases: string[]) {
  const entry = Object.entries(row).find(([key]) => aliases.includes(normalizedHeader(key)));
  return entry?.[1] ?? "";
}
function normalizeSpreadsheetRow(row: Record<string, unknown>) {
  const rawStatus = String(rowValue(row, ["situacao", "status"])).toLowerCase();
  return {
    code: String(rowValue(row, ["codcota", "codigocota", "codigo", "cota"])),
    category: String(rowValue(row, ["categoria"])),
    administrator: String(rowValue(row, ["administradora"])),
    supplier: String(rowValue(row, ["fornecedor"])),
    creditAmount: rowValue(row, ["credito", "valorcredito"]),
    entryAmount: rowValue(row, ["entrada", "valorentrada"]),
    installmentCount: rowValue(row, ["nparcelas", "numeroparcelas", "parcelas"]),
    installmentAmount: rowValue(row, ["vlrparcela", "valorparcela"]),
    outstandingBalance: rowValue(row, ["saldodevedor", "saldo"]),
    status: rawStatus.includes("vend") ? "sold" : rawStatus.includes("reserv") ? "reserved" : "available",
    featured: ["sim", "true", "1", "destaque"].includes(String(rowValue(row, ["destaque", "destacada"])).toLowerCase()),
  };
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<unknown[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const preview = useMutation({ mutationFn: (data: unknown[]) => stockApi("/import/preview", { method: "POST", body: JSON.stringify({ rows: data }) }) });
  const commit = useMutation({ mutationFn: () => stockApi("/import/commit", { method: "POST", body: JSON.stringify({ rows, mode }) }), onSuccess: data => { void queryClient.invalidateQueries({ queryKey: ["stock"] }); void queryClient.invalidateQueries({ queryKey: ["stock-filters"] }); toast.success(`${data.imported} cotas processadas`); onClose(); } });
  async function chooseFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const normalized = raw.map(normalizeSpreadsheetRow);
      setRows(normalized);
      preview.mutate(normalized);
    } catch { toast.error("Não foi possível ler a planilha"); }
  }
  const result = preview.data as { rows: PreviewRow[]; valid: number; invalid: number } | undefined;
  return <div className="modal-backdrop"><div className="stock-modal import-modal"><div className="modal-heading"><div><span className="eyebrow">IMPORTAR ESTOQUE</span><h2>Prévia da planilha</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><label className="file-drop"><FileSpreadsheet size={30} /><strong>{fileName || "Selecionar XLSX, XLS ou CSV"}</strong><span>A primeira linha deve conter os nomes das colunas.</span><input type="file" accept=".xlsx,.xls,.csv" onChange={event => void chooseFile(event.target.files?.[0])} /></label>
    {preview.isPending && <div className="table-message">Validando planilha…</div>}{preview.error && <div className="auth-error">{preview.error.message}</div>}{result && <><div className="import-summary"><span className="valid-count">{result.valid} válidas</span><span className={result.invalid ? "invalid-count" : "valid-count"}>{result.invalid} inválidas</span></div><div className="import-mode"><label><input type="radio" checked={mode === "add"} onChange={() => setMode("add")} /> Adicionar cotas ao estoque</label><label><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Substituir e apagar o estoque atual</label></div>{result.invalid > 0 && <div className="import-errors">{result.rows.filter(row => !row.valid).slice(0, 12).map(row => <p key={row.row}><strong>Linha {row.row}:</strong> {row.error}</p>)}</div>}<div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button button-reset" disabled={result.invalid > 0 || commit.isPending} onClick={() => { if (mode === "replace" && !window.confirm("Esta ação apagará permanentemente o estoque atual. Deseja continuar?")) return; commit.mutate(); }}><Upload size={17} /> {commit.isPending ? "Importando…" : "Confirmar importação"}</button></div></>}
  </div></div>;
}

function SmartSearchModal({ filters, onUse, onClose }: { filters?: { categories: string[]; administrators: string[] }; onUse: (ids: string[]) => void; onClose: () => void }) {
  const [form, setForm] = useState({ category: "", administrator: "", targetCredit: "", priority: "entry" });
  const search = useMutation({ mutationFn: () => stockApi("/smart-search", { method: "POST", body: JSON.stringify({ ...form, targetCredit: Number(form.targetCredit), priority: form.priority }) }) });
  const result = search.data as { items: QuotaRecord[]; creditTotal: number; difference: number } | undefined;
  return <div className="modal-backdrop"><div className="stock-modal"><div className="modal-heading"><div><span className="eyebrow">BUSCA INTELIGENTE</span><h2>Encontrar combinação</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="quota-form-grid"><label>Categoria<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">Selecione</option>{filters?.categories.map(value => <option key={value}>{value}</option>)}</select></label><label>Administradora<select value={form.administrator} onChange={e => setForm({ ...form, administrator: e.target.value })}><option value="">Selecione</option>{filters?.administrators.map(value => <option key={value}>{value}</option>)}</select></label><label>Crédito desejado<input type="number" min="1" value={form.targetCredit} onChange={e => setForm({ ...form, targetCredit: e.target.value })} /></label><label>Priorizar<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option value="entry">Menor entrada</option><option value="installment">Menor parcela</option><option value="balance">Menor saldo devedor</option></select></label></div><div className="form-actions"><button className="secondary-button" onClick={() => search.mutate()} disabled={!form.category || !form.administrator || !form.targetCredit || search.isPending}>{search.isPending ? "Calculando…" : "Buscar combinação"}</button></div>{search.error && <div className="auth-error">{search.error.message}</div>}{result && <div className="smart-result"><strong>{result.items.length} cotas • {currency(result.creditTotal)}</strong><span>Diferença para o alvo: {currency(result.difference)}</span><button className="primary-button button-reset" disabled={!result.items.length} onClick={() => onUse(result.items.map(item => item.id))}>Usar esta combinação</button></div>}</div></div>;
}

export default function StockPage({ user }: { user: AuthenticatedUser }) {
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
  const [quoting, setQuoting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => JSON.parse(sessionStorage.getItem("sa-capital-selected-quotas") ?? "[]"));
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(search ? { search } : {}), ...(category ? { category } : {}), ...(administrator ? { administrator } : {}), ...(status ? { status } : {}) });
  const stock = useQuery<StockResponse>({ queryKey: ["stock", page, pageSize, search, category, administrator, status], queryFn: () => stockApi(`?${params}`) });
  const filters = useQuery<{ categories: string[]; administrators: string[] }>({ queryKey: ["stock-filters"], queryFn: () => stockApi("/filters") });
  const settings = useQuery<{ settings: { legalNotice: string } }>({ queryKey: ["settings"], queryFn: async () => { const response = await fetch("/api/settings"); if (!response.ok) throw new Error("Configurações indisponíveis"); return response.json(); } });
  const isAdmin = ["admin", "administrative"].includes(user.role);
  function toggleSelection(id: string) {
    setSelectedIds(current => {
      const quota = stock.data?.items.find(item => item.id === id);
      const first = stock.data?.items.find(item => current.includes(item.id));
      if (!current.includes(id) && first && quota && (first.category !== quota.category || first.administrator !== quota.administrator)) { toast.error("A junção deve ter a mesma categoria e administradora"); return current; }
      const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
      sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(next));
      return next;
    });
  }
  return <section className="stock-page"><div className="page-heading-row"><div><span className="eyebrow">OPERAÇÃO COMERCIAL</span><h1>Estoque de cotas</h1><p>{stock.data?.total ?? 0} condições encontradas.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setSmartSearching(true)}><Search size={17} /> Busca inteligente</button>{isAdmin && <><button className="secondary-button" onClick={() => setImporting(true)}><Upload size={17} /> Importar planilha</button><button className="primary-button button-reset" onClick={() => setCreating(true)}><Plus size={18} /> Nova cota</button></>}</div></div>
    <div className="stock-filters panel"><label className="search-field"><Search size={18} /><input placeholder="Buscar ou colar vários códigos" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{filters.data?.categories.map(value => <option key={value}>{value}</option>)}</select><select value={administrator} onChange={event => { setAdministrator(event.target.value); setPage(1); }}><option value="">Todas as administradoras</option>{filters.data?.administrators.map(value => <option key={value}>{value}</option>)}</select>{isAdmin && <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option><option value="available">Disponíveis</option><option value="reserved">Reservadas</option></select>}<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="20">20 por página</option><option value="50">50 por página</option><option value="100">100 por página</option></select></div>
    <div className="stock-table-wrap panel">{stock.isLoading && <div className="table-message">Carregando estoque…</div>}{stock.error && <div className="auth-error">{stock.error.message}</div>}{stock.data && <table className="stock-table"><thead><tr><th>Selecionar</th><th>Cota</th><th>Crédito</th><th>Entrada</th><th>Parcelas</th><th>Saldo devedor</th><th>Situação</th>{isAdmin && <th />}</tr></thead><tbody>{stock.data.items.map(quota => <tr key={quota.id} className={quota.featured ? "featured-row" : ""}><td><input className="quota-checkbox" type="checkbox" aria-label={`Selecionar cota ${quota.code}`} disabled={quota.status !== "available"} checked={selectedIds.includes(quota.id)} onChange={() => toggleSelection(quota.id)} /></td><td><div className="quota-code"><strong>{quota.code}{quota.featured && <Star size={14} fill="currentColor" />}</strong><small>{quota.category} • {quota.administrator}{quota.supplier ? ` • ${quota.supplier}` : ""}</small></div></td><td><strong>{currency(quota.creditAmount)}</strong></td><td>{currency(quota.entryAmount)}</td><td>{quota.installmentCount} × {currency(quota.installmentAmount)}</td><td>{currency(quota.outstandingBalance)}</td><td><span className={`quota-status ${quota.status}`}>{quota.status === "available" ? "Disponível" : quota.status === "reserved" ? "Reservada" : "Vendida"}</span></td>{isAdmin && <td><button className="icon-button table-edit" onClick={() => setEditing(quota)}><Pencil size={16} /></button></td>}</tr>)}</tbody></table>}{stock.data?.items.length === 0 && <div className="table-message">Nenhuma cota encontrada.</div>}</div>
    {stock.data && stock.data.totalPages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /> Anterior</button><span>Página {page} de {stock.data.totalPages}</span><button disabled={page >= stock.data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima <ChevronRight size={17} /></button></div>}
    {selectedIds.length > 0 && <div className="selection-bar"><div><strong>{selectedIds.length} cota{selectedIds.length === 1 ? "" : "s"} selecionada{selectedIds.length === 1 ? "" : "s"}</strong><span>Junção sem limite de quantidade</span></div><button className="secondary-button" onClick={() => { setSelectedIds([]); sessionStorage.removeItem("sa-capital-selected-quotas"); }}>Limpar</button><button className="primary-button button-reset" onClick={() => setQuoting(true)}>Ver cotação <ChevronRight size={18} /></button></div>}
    {quoting && <QuotePanel ids={selectedIds} onClose={() => setQuoting(false)} />}
    {smartSearching && <SmartSearchModal filters={filters.data} onClose={() => setSmartSearching(false)} onUse={ids => { setSelectedIds(ids); sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(ids)); setSmartSearching(false); setQuoting(true); }} />}
    {creating && <QuotaForm onClose={() => setCreating(false)} />}{editing && <QuotaForm quota={editing} onClose={() => setEditing(null)} />}{importing && <ImportModal onClose={() => setImporting(false)} />}
    <footer className="legal-notice">{settings.data?.settings.legalNotice ?? "A SA CAPITAL se isenta de qualquer responsabilidade sobre alteração de valores, fica a responsabilidade do parceiro verificar junto ao seu assessor os valores atualizados antes de qualquer negociação."}</footer>
  </section>;
}
