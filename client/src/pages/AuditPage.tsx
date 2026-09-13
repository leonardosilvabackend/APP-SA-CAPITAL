import { useQuery } from "@tanstack/react-query";
import { Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import HistoryPagination from "../components/HistoryPagination";
import { dismissBackdrop } from "../lib/dismissBackdrop";

type AuditItem = { id: string; action: string; entityId: string | null; details: Record<string, unknown>; createdAt: string; actor: { id: string; name: string } | null };
async function loadAudit(page: number, search: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search.trim()) params.set("search", search.trim());
  const response = await fetch(`/api/audit?${params}`, { credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível consultar a auditoria");
  return data as { items: AuditItem[]; page: number; pageSize: number; hasNext: boolean };
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const audit = useQuery({ queryKey: ["audit", page, appliedSearch], queryFn: () => loadAudit(page, appliedSearch) });
  return <section className="module-page audit-page">
    <span className="eyebrow">ADMINISTRAÇÃO</span><h1>Auditoria operacional</h1><p>Consulte ações sensíveis registradas pelo sistema. Os eventos são somente leitura.</p>
    <form className="audit-toolbar" onSubmit={event => { event.preventDefault(); setPage(1); setAppliedSearch(search); }}><label><span>Buscar por ação, responsável ou ID</span><div><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} maxLength={80} placeholder="Ex.: negotiation.cancelled" /></div></label><button className="primary-button" type="submit">Buscar</button></form>
    {audit.isError && <div className="auth-error" role="alert">{audit.error.message}</div>}
    <div className="audit-list" aria-busy={audit.isLoading}>{audit.data?.items.map(item => <button key={item.id} type="button" onClick={() => setSelected(item)}><ShieldCheck size={20} /><span><strong>{item.action}</strong><small>{item.actor?.name ?? "Sistema"} · {new Date(item.createdAt).toLocaleString("pt-BR")}</small></span><code>{item.entityId ?? "—"}</code></button>)}{!audit.isLoading && !audit.data?.items.length && <div className="empty-state"><h2>Nenhum evento encontrado</h2><p>Ajuste a busca ou aguarde novos registros operacionais.</p></div>}</div>
    <HistoryPagination page={page} hasNext={audit.data?.hasNext} busy={audit.isFetching} onPage={setPage} />
    {selected && <div className="modal-backdrop" {...dismissBackdrop(() => setSelected(null))}><section className="modal-card audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-title"><div className="modal-heading"><div><span className="eyebrow">EVENTO DE AUDITORIA</span><h2 id="audit-title">{selected.action}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar"><X size={20} /></button></div><dl><div><dt>Responsável</dt><dd>{selected.actor?.name ?? "Sistema"}</dd></div><div><dt>Data</dt><dd>{new Date(selected.createdAt).toLocaleString("pt-BR")}</dd></div><div><dt>ID da entidade</dt><dd>{selected.entityId ?? "Não informado"}</dd></div></dl><h3>Detalhes registrados</h3><pre>{JSON.stringify(selected.details, null, 2)}</pre></section></div>}
  </section>;
}
