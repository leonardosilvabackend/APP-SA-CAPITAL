import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Plus, Search, Star, Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";

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
    <label>Situação<select value={form.status} onChange={event => field("status", event.target.value)}><option value="available">Disponível</option><option value="reserved">Reservada</option><option value="sold">Vendida</option></select></label>
    <label className="featured-check"><input type="checkbox" checked={form.featured} onChange={event => field("featured", event.target.checked)} /> Destacar esta condição</label>
  </div>{save.error && <div className="auth-error">{save.error.message}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button button-reset" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar cota"}</button></div></form></div>;
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
  const preview = useMutation({ mutationFn: (data: unknown[]) => stockApi("/import/preview", { method: "POST", body: JSON.stringify({ rows: data }) }) });
  const commit = useMutation({ mutationFn: () => stockApi("/import/commit", { method: "POST", body: JSON.stringify({ rows }) }), onSuccess: data => { void queryClient.invalidateQueries({ queryKey: ["stock"] }); void queryClient.invalidateQueries({ queryKey: ["stock-filters"] }); toast.success(`${data.imported} cotas processadas`); onClose(); } });
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
    {preview.isPending && <div className="table-message">Validando planilha…</div>}{preview.error && <div className="auth-error">{preview.error.message}</div>}{result && <><div className="import-summary"><span className="valid-count">{result.valid} válidas</span><span className={result.invalid ? "invalid-count" : "valid-count"}>{result.invalid} inválidas</span></div>{result.invalid > 0 && <div className="import-errors">{result.rows.filter(row => !row.valid).slice(0, 12).map(row => <p key={row.row}><strong>Linha {row.row}:</strong> {row.error}</p>)}</div>}<div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button button-reset" disabled={result.invalid > 0 || commit.isPending} onClick={() => commit.mutate()}><Upload size={17} /> {commit.isPending ? "Importando…" : "Confirmar importação"}</button></div></>}
  </div></div>;
}

export default function StockPage({ user }: { user: AuthenticatedUser }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [administrator, setAdministrator] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<QuotaRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => JSON.parse(sessionStorage.getItem("sa-capital-selected-quotas") ?? "[]"));
  const params = new URLSearchParams({ page: String(page), pageSize: "25", ...(search ? { search } : {}), ...(category ? { category } : {}), ...(administrator ? { administrator } : {}), ...(status ? { status } : {}) });
  const stock = useQuery<StockResponse>({ queryKey: ["stock", page, search, category, administrator, status], queryFn: () => stockApi(`?${params}`) });
  const filters = useQuery<{ categories: string[]; administrators: string[] }>({ queryKey: ["stock-filters"], queryFn: () => stockApi("/filters") });
  const isAdmin = user.role === "admin";
  function toggleSelection(id: string) {
    setSelectedIds(current => {
      const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id].slice(0, 12);
      sessionStorage.setItem("sa-capital-selected-quotas", JSON.stringify(next));
      return next;
    });
  }
  return <section className="stock-page"><div className="page-heading-row"><div><span className="eyebrow">OPERAÇÃO COMERCIAL</span><h1>Estoque de cotas</h1><p>{stock.data?.total ?? 0} condições encontradas.</p></div>{isAdmin && <div className="heading-actions"><button className="secondary-button" onClick={() => setImporting(true)}><Upload size={17} /> Importar planilha</button><button className="primary-button button-reset" onClick={() => setCreating(true)}><Plus size={18} /> Nova cota</button></div>}</div>
    <div className="stock-filters panel"><label className="search-field"><Search size={18} /><input placeholder="Buscar código, categoria ou administradora" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{filters.data?.categories.map(value => <option key={value}>{value}</option>)}</select><select value={administrator} onChange={event => { setAdministrator(event.target.value); setPage(1); }}><option value="">Todas as administradoras</option>{filters.data?.administrators.map(value => <option key={value}>{value}</option>)}</select>{isAdmin && <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option><option value="available">Disponíveis</option><option value="reserved">Reservadas</option><option value="sold">Vendidas</option></select>}</div>
    <div className="stock-table-wrap panel">{stock.isLoading && <div className="table-message">Carregando estoque…</div>}{stock.error && <div className="auth-error">{stock.error.message}</div>}{stock.data && <table className="stock-table"><thead><tr><th>Selecionar</th><th>Cota</th><th>Crédito</th><th>Entrada</th><th>Parcelas</th><th>Saldo devedor</th><th>Situação</th>{isAdmin && <th />}</tr></thead><tbody>{stock.data.items.map(quota => <tr key={quota.id} className={quota.featured ? "featured-row" : ""}><td><input className="quota-checkbox" type="checkbox" aria-label={`Selecionar cota ${quota.code}`} disabled={quota.status !== "available"} checked={selectedIds.includes(quota.id)} onChange={() => toggleSelection(quota.id)} /></td><td><div className="quota-code"><strong>{quota.code}{quota.featured && <Star size={14} fill="currentColor" />}</strong><small>{quota.category} • {quota.administrator}{quota.supplier ? ` • ${quota.supplier}` : ""}</small></div></td><td><strong>{currency(quota.creditAmount)}</strong></td><td>{currency(quota.entryAmount)}</td><td>{quota.installmentCount} × {currency(quota.installmentAmount)}</td><td>{currency(quota.outstandingBalance)}</td><td><span className={`quota-status ${quota.status}`}>{quota.status === "available" ? "Disponível" : quota.status === "reserved" ? "Reservada" : "Vendida"}</span></td>{isAdmin && <td><button className="icon-button table-edit" onClick={() => setEditing(quota)}><Pencil size={16} /></button></td>}</tr>)}</tbody></table>}{stock.data?.items.length === 0 && <div className="table-message">Nenhuma cota encontrada.</div>}</div>
    {stock.data && stock.data.totalPages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /> Anterior</button><span>Página {page} de {stock.data.totalPages}</span><button disabled={page >= stock.data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima <ChevronRight size={17} /></button></div>}
    {selectedIds.length > 0 && <div className="selection-bar"><div><strong>{selectedIds.length} cota{selectedIds.length === 1 ? "" : "s"} selecionada{selectedIds.length === 1 ? "" : "s"}</strong><span>Máximo de 12 cotas por simulação</span></div><button className="secondary-button" onClick={() => { setSelectedIds([]); sessionStorage.removeItem("sa-capital-selected-quotas"); }}>Limpar</button><button className="primary-button button-reset" onClick={() => { window.location.href = "/simulador"; }}>Simular cotação <ChevronRight size={18} /></button></div>}
    {creating && <QuotaForm onClose={() => setCreating(false)} />}{editing && <QuotaForm quota={editing} onClose={() => setEditing(null)} />}{importing && <ImportModal onClose={() => setImporting(false)} />}
  </section>;
}
