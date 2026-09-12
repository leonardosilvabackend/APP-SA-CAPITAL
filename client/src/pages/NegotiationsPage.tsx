import HistoryPagination from "../components/HistoryPagination";
import { dismissBackdrop } from "../lib/dismissBackdrop";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Handshake, Plus, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { selectionSurface } from "../lib/selectionSurface";
import type { AuthenticatedUser } from "@shared/contracts";
import { buildInstallmentCascade } from "@shared/quote";
import { canEditNegotiation, negotiationStatusLabels, negotiationStatuses, type Negotiation, type NegotiationDetail, type NegotiationPayment, type ReceiptInput } from "@shared/negotiations";

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR");
async function api(path = "", options?: RequestInit) {
  const response = await fetch(`/api/negotiations${path}`, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação");
  return data;
}
async function readReceipt(file: File, id: string): Promise<ReceiptInput> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
    throw new Error("Selecione um PDF, JPEG ou PNG de até 10 MB");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o comprovante"));
    reader.onload = () => resolve({ id, name: file.name, mimeType: file.type as ReceiptInput["mimeType"], base64: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}
function localDate(value = new Date().toISOString()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Status({ status }: { status: Negotiation["status"] }) {
  return <span className={`negotiation-status negotiation-status-${status}`}>{statusLabel(status)}</span>;
}
function statusLabel(status: Negotiation["status"]) {
  const label = negotiationStatusLabels[status].toLocaleLowerCase("pt-BR");
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function NegotiationRow({ item, onOpen }: { item: Negotiation; onOpen: () => void }) {
  return <tr {...selectionSurface(onOpen)} aria-label={`Abrir negociação ${item.code}`}>
    <td className="negotiation-identity" data-label="Nº negociação"><button className="negotiation-open" onClick={onOpen}>{item.code}<ChevronRight size={15} /></button></td>
    <td data-label="Cliente"><strong>{item.clientName}</strong></td>
    <td data-label="Administradora">{Array.from(new Set(item.selectedQuotas.map(quota => quota.administrator))).join(" / ")}</td>
    <td data-label="Categoria">{Array.from(new Set(item.selectedQuotas.map(quota => quota.category))).join(" / ")}</td>
    <td className="negotiation-money" data-label="Crédito">{money(item.creditAmount)}</td>
  </tr>;
}
function AmountField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label>{label}<input type="number" min="0" max="999999999999.99" step="0.01" required value={value} onChange={event => onChange(event.target.value)} disabled={disabled} /></label>;
}

function PaymentForm({ item, payment, onSaved, onClose }: { item: NegotiationDetail; payment?: NegotiationPayment; onSaved: () => Promise<void>; onClose: () => void }) {
  const [id] = useState(() => payment?.id ?? crypto.randomUUID());
  const [receiptId] = useState(() => crypto.randomUUID());
  const [version, setVersion] = useState(item.version);
  const [amount, setAmount] = useState(payment?.amount ?? "");
  const [kind, setKind] = useState(payment?.kind ?? "signal");
  const [paidAt, setPaidAt] = useState(localDate(payment?.paidAt));
  const [file, setFile] = useState<File>();
  const save = useMutation({
    mutationKey: ["negotiation-write", item.id],
    mutationFn: async () => api(`/${item.id}/payments${payment ? `/${id}` : ""}`, {
      method: payment ? "PATCH" : "POST",
      body: JSON.stringify({ id, version, amount, kind, paidAt: new Date(paidAt).toISOString(), receipt: file ? await readReceipt(file, receiptId) : undefined }),
    }),
    onSuccess: async () => { await onSaved(); toast.success("Pagamento salvo"); onClose(); },
    onError: () => { void onSaved(); },
  });
  return <form className="negotiation-payment-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <h3>{payment ? "Editar pagamento" : "Registrar pagamento"}</h3>
    <div className="negotiation-fields">
      <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as typeof kind)} disabled={save.isPending}><option value="signal">Sinal</option><option value="payment">Pagamento da entrada</option></select></label>
      <AmountField label="Valor (R$)" value={amount} onChange={setAmount} disabled={save.isPending} />
      <label>Data e horário do pagamento<input type="datetime-local" required value={paidAt} onChange={event => setPaidAt(event.target.value)} disabled={save.isPending} /></label>
      <label>Comprovante (opcional)<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0])} disabled={save.isPending} /><small>PDF, JPEG ou PNG, até 10 MB.</small></label>
    </div>
    {save.error && <p className="auth-error" role="alert">{save.error.message}</p>}
    {version !== item.version && <p role="alert">Há uma atualização nesta negociação. Confira o saldo antes de <button className="text-button" type="button" onClick={() => setVersion(item.version)}>manter os valores informados</button>.</p>}
    <div className="form-actions"><button type="button" className="secondary-button" disabled={save.isPending} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={save.isPending || version !== item.version}>{save.isPending ? "Salvando…" : "Salvar pagamento"}</button></div>
  </form>;
}

function ReceiptForm({ item, paymentId, onSaved, onClose }: { item: NegotiationDetail; paymentId: string; onSaved: () => Promise<void>; onClose: () => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [file, setFile] = useState<File>();
  const upload = useMutation({
    mutationKey: ["negotiation-write", item.id],
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um comprovante");
      return api(`/${item.id}/payments/${paymentId}/receipts`, { method: "POST", body: JSON.stringify(await readReceipt(file, id)) });
    },
    onSuccess: async () => { await onSaved(); toast.success("Comprovante anexado"); onClose(); },
  });
  return <form className="negotiation-payment-form" onSubmit={event => { event.preventDefault(); upload.mutate(); }}>
    <label>Adicionar comprovante ao pagamento<input type="file" required accept="application/pdf,image/jpeg,image/png" disabled={upload.isPending} onChange={event => setFile(event.target.files?.[0])} /><small>PDF, JPEG ou PNG, até 10 MB.</small></label>
    {upload.error && <p className="auth-error" role="alert">{upload.error.message}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" disabled={upload.isPending} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={upload.isPending}>{upload.isPending ? "Enviando…" : "Anexar comprovante"}</button></div>
  </form>;
}

function NegotiationContent({ item, editable, canDelete, onSaved, onDeleted }: { item: NegotiationDetail; editable: boolean; canDelete: boolean; onSaved: () => Promise<void>; onDeleted: () => void }) {
  const busy = useIsMutating({ mutationKey: ["negotiation-write", item.id] }) > 0;
  type Draft = Pick<NegotiationDetail, "version" | "status" | "entryAmount" | "transferFee" | "registrationFee" | "commissionAmount">;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paymentForm, setPaymentForm] = useState<"new" | NegotiationPayment | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<string | null>(null);
  const values: Draft = draft ?? { version: item.version, status: item.status, entryAmount: item.entryAmount, transferFee: item.transferFee, registrationFee: item.registrationFee, commissionAmount: item.commissionAmount };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...values, [key]: value });
  const save = useMutation({
    mutationKey: ["negotiation-write", item.id],
    mutationFn: () => api(`/${item.id}`, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: async () => { setDraft(null); await onSaved(); toast.success("Negociação atualizada"); },
    onError: () => { void onSaved(); },
  });
  const lifecycle = useMutation({
    mutationKey: ["negotiation-write", item.id],
    mutationFn: (action: "cancel" | "delete") => api(`/${item.id}${action === "cancel" ? "/cancel" : ""}`, { method: action === "cancel" ? "POST" : "DELETE", body: JSON.stringify({ version: item.version }) }),
    onSuccess: async (data, action) => { if (action === "delete") onDeleted(); await onSaved(); toast.success(data.message); },
    onError: error => { toast.error(error.message); void onSaved(); },
  });
  const closed = ["finalized", "cancelled"].includes(item.status);
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  return <>
    <p className="detail-meta">{item.clientName} • Responsável: {item.ownerName} • Criada em {dateTime(item.createdAt)}</p>
    <Status status={item.status} />
    {editable && <div className="form-actions">
      <button className="secondary-button" disabled={busy || closed} onClick={() => { if (window.confirm("Cancelar esta negociação? Ela ficará no histórico e as cotas serão liberadas.")) lifecycle.mutate("cancel"); }}>Cancelar negociação</button>
      {canDelete && <button className="danger-button" disabled={busy} onClick={() => { if (window.confirm("Excluir permanentemente esta negociação e seu histórico de pagamentos? As cotas serão devolvidas ao estoque. Esta ação não pode ser desfeita.")) lifecycle.mutate("delete"); }}>Excluir negociação</button>}
    </div>}
    <div className="negotiation-totals">
      <div><span>Entrada</span><strong>{money(item.entryAmount)}</strong></div>
      <div><span>Sinais pagos</span><strong>{money(item.signalAmount)}</strong></div>
      <div><span>Total pago</span><strong>{money(item.paidAmount)}</strong></div>
      <div className="negotiation-remaining"><span>Valor a pagar</span><strong>{money(item.remainingAmount)}</strong></div>
    </div>
    <p className="negotiation-help">Valor a pagar = entrada − sinais e demais pagamentos. Taxas exibidas separadamente.</p>
    <div className="negotiation-detail-columns">
      <section><h3>Cotas reservadas</h3>{item.selectedQuotas.map(quota => <div className="detail-quota" key={quota.id}><span><strong>{quota.code}</strong><small>{quota.administrator} • {quota.category}</small></span><strong>{money(quota.creditAmount)}</strong></div>)}
        <h3>Prazo e parcelas</h3>{buildInstallmentCascade(item.selectedQuotas).map(period => <div className="cascade-row" key={period.from}><span>{period.from}ª à {period.to}ª parcela</span><strong>{money(period.amount)}</strong></div>)}
        <div className="summary-list"><p><span>Crédito total</span><strong>{money(item.creditAmount)}</strong></p><p><span>Seguro</span><strong>{money(item.insuranceAmount)}</strong></p><p><span>Saldo devedor</span><strong>{money(item.outstandingBalance)}</strong></p></div>
      </section>
      <section><h3>Condições da negociação</h3>{editable && !closed ? <form onSubmit={submit}>
        <label>Status<select value={values.status} disabled={busy || closed} onChange={event => set("status", event.target.value as Negotiation["status"])}>{negotiationStatuses.filter(status => status !== "cancelled").map(status => <option key={status} value={status}>{negotiationStatusLabels[status]}</option>)}</select></label>
        <div className="negotiation-fields">
          <AmountField label="Entrada (R$)" value={values.entryAmount} onChange={value => set("entryAmount", value)} disabled={save.isPending} />
          <AmountField label="Taxa de transferência (R$)" value={values.transferFee} onChange={value => set("transferFee", value)} disabled={save.isPending} />
          <AmountField label="Taxa de cadastro (R$)" value={values.registrationFee} onChange={value => set("registrationFee", value)} disabled={save.isPending} />
          <AmountField label="Comissão (R$)" value={values.commissionAmount} onChange={value => set("commissionAmount", value)} disabled={save.isPending} />
        </div><p className="negotiation-help">A comissão é um valor em reais. Alterá-la não recalcula a entrada automaticamente.</p>
        {save.error && <p className="auth-error" role="alert">{save.error.message}</p>}
        {draft && draft.version !== item.version && <p role="alert">Há alterações mais recentes. <button type="button" className="text-button" onClick={() => setDraft(null)}>Recarregar condições</button></p>}
        <div className="form-actions"><button className="primary-button" disabled={busy || !!draft && draft.version !== item.version}>{save.isPending ? "Salvando…" : "Salvar condições e status"}</button></div>
      </form> : <div className="summary-list"><p><span>Taxa de transferência</span><strong>{money(item.transferFee)}</strong></p><p><span>Taxa de cadastro</span><strong>{money(item.registrationFee)}</strong></p></div>}</section>
    </div>
    <section className="negotiation-payments"><div className="modal-heading"><h3>Sinais e pagamentos da entrada</h3>{editable && !closed && !paymentForm && <button className="secondary-button" disabled={busy} onClick={() => { setReceiptPayment(null); setPaymentForm("new"); }}><Plus size={16} /> Registrar pagamento</button>}</div>
      {closed && editable && <p className="negotiation-help">Negociações encerradas não permitem novos pagamentos ou mudança de etapa.</p>}
      {paymentForm && <PaymentForm key={paymentForm === "new" ? "new" : paymentForm.id} item={item} payment={paymentForm === "new" ? undefined : paymentForm} onSaved={onSaved} onClose={() => setPaymentForm(null)} />}
      {receiptPayment && <ReceiptForm key={receiptPayment} item={item} paymentId={receiptPayment} onSaved={onSaved} onClose={() => setReceiptPayment(null)} />}
      {!item.payments.length && <p className="table-message">Nenhum pagamento registrado.</p>}
      {item.payments.map(payment => <article className="negotiation-payment" key={payment.id} {...selectionSurface(() => { setReceiptPayment(null); setPaymentForm(payment); }, !editable || closed || busy)} aria-label={editable && !closed ? `Editar pagamento de ${money(payment.amount)}` : undefined}>
        <div className="negotiation-payment-heading"><div><strong>{payment.kind === "signal" ? "Sinal" : "Pagamento da entrada"} • {money(payment.amount)}</strong><small>Pago em {dateTime(payment.paidAt)}</small><small>Registrado por {payment.recordedByName} em {dateTime(payment.createdAt)}</small>{payment.updatedAt !== payment.createdAt && <small>Atualizado em {dateTime(payment.updatedAt)}</small>}</div>
          {editable && <div className="negotiation-payment-actions">{!closed && <button className="secondary-button" disabled={busy} onClick={() => { setReceiptPayment(null); setPaymentForm(payment); }}>Editar pagamento</button>}<button className="secondary-button" disabled={busy} onClick={() => { setPaymentForm(null); setReceiptPayment(payment.id); }}><FileText size={15} /> Anexar comprovante</button></div>}
        </div>
        {payment.receipts.length ? <ul className="negotiation-receipts">{payment.receipts.map(receipt => <li key={receipt.id}><a href={receipt.url} target="_blank" rel="noreferrer"><FileText size={15} /> {receipt.fileName}</a></li>)}</ul> : <small>Sem comprovante anexado.</small>}
      </article>)}
    </section>
  </>;
}

export default function NegotiationsPage({ user }: { user: AuthenticatedUser }) {
  const saving = useIsMutating({ mutationKey: ["negotiation-write"] }) > 0;
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery<{ items: Negotiation[]; hasNext: boolean }>({ queryKey: ["negotiations", user.id, page, status, search], queryFn: () => api(`?page=${page}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`), refetchInterval: 30000 });
  const detail = useQuery<{ item: NegotiationDetail }>({ queryKey: ["negotiation", user.id, selected], queryFn: () => api(`/${selected}`), enabled: !!selected });
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const items = list.data?.items ?? [];
  async function refreshed() {
    for (const key of ["stock", "saved-quotes", "saved-quote", "dashboard-metrics"]) void queryClient.invalidateQueries({ queryKey: [key] });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["negotiations"] }), queryClient.invalidateQueries({ queryKey: ["negotiation", user.id, selected] })]);
  }
  return <section className="negotiations-page"><HistoryPagination page={page} hasNext={list.data?.hasNext} busy={list.isFetching} onPage={setPage}/>
    <div className="page-heading-row"><div><span className="eyebrow">ACOMPANHAMENTO COMERCIAL</span><h1>Negociações</h1><p>Acompanhe as reservas aprovadas, as etapas e os pagamentos da entrada.</p></div></div>
    <div className="negotiation-toolbar panel">
      <label className="negotiation-filter">Buscar negociação
        <span className="negotiation-search"><Search size={18} aria-hidden="true" /><input placeholder="Código, cliente, administradora ou cota…" value={search} onChange={event => (setPage(1), setSearch(event.target.value))} /></span>
      </label>
      <label className="negotiation-filter negotiation-status-filter">Status
        <select value={status} onChange={event => (setPage(1), setStatus(event.target.value))}><option value="">Todos os status</option>{negotiationStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
      </label>
    </div>
    {list.isLoading ? <p role="status">Carregando negociações…</p> : list.error ? <div className="auth-error" role="alert">{list.error.message} <button className="secondary-button" onClick={() => void list.refetch()}>Tentar novamente</button></div> : !items.length ? <div className="empty-state"><span><Handshake size={30} /></span><h2>Nenhuma negociação encontrada</h2><p>{search || status ? "Ajuste a busca ou o status para consultar outros registros." : "A negociação aparecerá aqui quando a solicitação de reserva de uma cotação for aprovada."}</p>{user.role !== "administrative" && <Link href="/cotacoes" className="secondary-button">Consultar cotações</Link>}</div> : <section className="panel negotiation-results">
      <div className="negotiation-results-heading"><h2>Reservas aprovadas</h2><span>{items.length} {items.length === 1 ? "negociação" : "negociações"}</span></div>
      <div className="negotiation-table-wrap"><table className="negotiation-table" aria-label="Negociações de reservas aprovadas">
        <thead><tr><th scope="col">Nº negociação</th><th scope="col">Cliente</th><th scope="col">Administradora</th><th scope="col">Categoria</th><th scope="col" className="negotiation-money">Crédito</th></tr></thead>
        <tbody>{items.map(item => <NegotiationRow key={item.id} item={item} onOpen={() => setSelected(item.id)} />)}</tbody>
      </table></div>
    </section>}
    {selected && <div className="modal-backdrop" {...dismissBackdrop(() => setSelected(null), saving)}><div className="negotiation-modal" role="dialog" aria-modal="true" aria-labelledby="negotiation-title"><div className="modal-heading"><div><span className="eyebrow">DETALHES DA NEGOCIAÇÃO</span><h2 id="negotiation-title">{detail.data?.item.code ?? "Carregando…"}</h2></div><button className="icon-button" aria-label="Fechar negociação" disabled={saving} onClick={() => setSelected(null)}><X size={20} /></button></div>{detail.isLoading && <p role="status">Carregando dados…</p>}{detail.error && <p className="auth-error" role="alert">{detail.error.message} <button className="secondary-button" onClick={() => void detail.refetch()}>Tentar novamente</button></p>}{detail.data && <NegotiationContent key={detail.data.item.id} item={detail.data.item} editable={canEditNegotiation(user.role)} canDelete={user.role === "admin"} onSaved={refreshed} onDeleted={() => setSelected(null)} />}</div></div>}
  </section>;
}
