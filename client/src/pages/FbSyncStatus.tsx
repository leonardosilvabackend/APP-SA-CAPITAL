import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, History, Power, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { dismissBackdrop } from "../lib/dismissBackdrop";

type Run = { startedAt: string; finishedAt: string | null; error?: string; result?: { received: number; created: number; updated: number; reserved: number; reactivated: number } };
type Status = { alert: string | null; lastSuccessAt: string | null; environment: string; enabled: boolean; apiOnline: boolean; intervalMinutes: number; running: boolean; nextRunAt: string | null; history: Run[] };
const time = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";

export default function FbSyncStatus() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const query = useQuery<Status>({ queryKey: ["fb-sync-status"], refetchInterval: 15_000, queryFn: async () => { const response = await fetch("/api/stock/sync-fb/status"); if (!response.ok) throw new Error("Não foi possível consultar a atualização do estoque."); return response.json(); } });
  const changeMode = useMutation({ mutationFn: async (online: boolean) => { const response = await fetch("/api/stock/sync-fb/mode", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ online }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível alterar a API FB"); return data; }, onSuccess: async (_data, online) => { await qc.invalidateQueries({ queryKey: ["fb-sync-status"] }); toast.success(`API FB ${online ? "ligada" : "desligada"}`); }, onError: error => toast.error(error.message) });
  const data = query.data;
  return <>
    <button type="button" className="metric-card fb-summary-card" onClick={() => setOpen(true)} disabled={!data}>
      <div className="metric-icon navy"><DatabaseZap size={21} /></div><span>Estoque API FB</span><strong>{data?.apiOnline === false ? "Offline" : data?.running ? "Atualizando…" : data?.lastSuccessAt ? "Sincronizado" : "Aguardando"}</strong><small>{query.error ? query.error.message : data ? `Última confirmação: ${time(data.lastSuccessAt)}` : "Carregando status…"}</small><em><History size={14} /> Abrir histórico</em>
    </button>
    {open && data && <div className="modal-backdrop" {...dismissBackdrop(() => setOpen(false))}><section className="stock-modal fb-history-modal" role="dialog" aria-modal="true" aria-labelledby="fb-history-title">
      <div className="modal-heading"><div><span className="eyebrow">INTEGRAÇÃO DE ESTOQUE</span><h2 id="fb-history-title">Histórico Fraga &amp; Bitello</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar histórico"><X size={19} /></button></div>
      <div className="fb-mode-control"><div><strong>API FB {data.apiOnline ? "online" : "offline"}</strong><small>{data.apiOnline ? "Novos códigos são adicionados; ausentes passam a reservados." : "Ao substituir o estoque, cotas FB disponíveis também serão substituídas."}</small></div><button type="button" className={data.apiOnline ? "danger-button" : "primary-button"} disabled={changeMode.isPending} onClick={() => { if (window.confirm(`${data.apiOnline ? "Desligar" : "Ligar"} a API FB?`)) changeMode.mutate(!data.apiOnline); }}><Power size={16}/>{data.apiOnline ? "Desligar API" : "Ligar API"}</button></div>
      <div className="fb-current-status"><strong>{data.environment.toUpperCase()} · atualização a cada {data.intervalMinutes} minutos</strong>{data.alert && <p role="alert">{data.alert}</p>}<p>Última atualização confirmada: {time(data.lastSuccessAt)}</p><p>{data.apiOnline ? data.running ? "Atualizando estoque…" : `Próxima atualização: ${time(data.nextRunAt)}` : "Sincronização pausada pelo administrador."}</p></div>
      <div className="fb-history-list">{data.history.length ? data.history.map(run => <article key={run.startedAt} className={run.error ? "fb-run-error" : ""}><time>{time(run.finishedAt)}</time>{run.error ? <p role="alert">{run.error}</p> : run.result && <p>{run.result.received} recebidas; {run.result.created} novas; {run.result.updated} atualizadas; {run.result.reserved} reservadas; {run.result.reactivated} liberadas.</p>}</article>) : <p>Nenhuma execução registrada.</p>}</div><small>Histórico persistente. Cotas de negociações e cotas vendidas são preservadas.</small>
    </section></div>}
  </>;
}
