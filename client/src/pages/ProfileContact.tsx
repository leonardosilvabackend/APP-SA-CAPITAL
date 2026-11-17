import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Percent, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";

async function api(path = "", options?: RequestInit) { const response = await fetch(`/api/profile${path}`, { credentials: "same-origin", ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil"); return data; }
type Profile = { firstName?: string; lastName?: string; gender?: string; phone?: string; email?: string; taxDocument?: string; companyName?: string; address?: string; interestedAdministrators?: string[] | string };
const profileFields = [["firstName","Nome"],["lastName","Sobrenome"],["phone","Telefone"],["email","E-mail"],["taxDocument","CPF/CNPJ"],["companyName","Razão Social"],["address","Endereço"],["interestedAdministrators","Administradoras de interesse"]] as const;

export default function ProfileContact({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const profile = useQuery<Profile>({ queryKey: ["own-profile", user.id], queryFn: () => api() });
  const [form, setForm] = useState<Profile>({});
  const [photo, setPhoto] = useState<File>();
  const [rate, setRate] = useState(0);
  const [newToken, setNewToken] = useState("");
  useEffect(() => { if (profile.data) setForm(profile.data); }, [profile.data]);
  const integration = useQuery<{ item: { prefix: string; commissionRate: number } | null }>({ queryKey: ["stock-api-key"], queryFn: async () => { const response = await fetch("/api/integrations/stock-api"); if (!response.ok) throw new Error("Integração indisponível"); return response.json(); } });
  useEffect(() => { if (integration.data?.item) setRate(integration.data.item.commissionRate); }, [integration.data?.item]);
  const save = useMutation({ mutationFn: async () => { if (photo) await api("/photo", { method: "POST", headers: { "Content-Type": photo.type }, body: photo }); await api("", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, interestedAdministrators: String(form.interestedAdministrators ?? "").split(",").map(value => value.trim()).filter(Boolean) }) }); }, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["own-profile"] }); toast.success("Perfil atualizado"); }, onError: error => toast.error(error.message) });
  const generate = useMutation({ mutationFn: async () => { const response = await fetch("/api/integrations/stock-api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commissionRate: rate }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as { token: string }; }, onSuccess: data => { setNewToken(data.token); void integration.refetch(); toast.success("Chave API gerada"); }, onError: error => toast.error(error.message) });
  const revoke = useMutation({ mutationFn: async () => { const response = await fetch("/api/integrations/stock-api", { method: "DELETE" }); if (!response.ok) throw new Error("Não foi possível revogar a chave"); }, onSuccess: () => { setNewToken(""); void integration.refetch(); toast.success("Chave API revogada"); }, onError: error => toast.error(error.message) });
  const field = (key: keyof Profile, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <>
    <section className="panel profile-contact-panel">
      <h2>Meu perfil</h2><p>Dados autodeclarados. Eles não alteram login, papel, assessor, status ou cadastro administrativo.</p>
      <form onSubmit={event => { event.preventDefault(); save.mutate(); }}><div className="quota-form-grid">
        <label>Sexo<select value={form.gender ?? ""} onChange={event => field("gender", event.target.value)}><option value="">Selecione</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Prefiro não dizer">Prefiro não dizer</option></select></label>
        {profileFields.map(([key,label]) => <label key={key}>{label}<input value={String(form[key] ?? "")} onChange={event => field(key,event.target.value)} /></label>)}
        <label>Foto<input type="file" accept=".jpg,.jpeg,.png" onChange={event => setPhoto(event.target.files?.[0])} /></label>
      </div><button className="primary-button button-reset" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar perfil"}</button></form>
    </section>
    <section className="panel api-stock-panel">
      <header className="api-stock-header"><span className="api-stock-icon"><KeyRound size={24}/></span><div><span className="eyebrow">INTEGRAÇÕES</span><h2>API de Estoque</h2><p>Espelhe as cotas disponíveis no seu sistema com acesso seguro e somente para consulta.</p></div>{integration.data?.item && <span className="api-key-status"><Check size={15}/> Chave ativa</span>}</header>
      {integration.data?.item && <div className="api-current-key"><ShieldCheck size={20}/><div><span>Identificação da chave atual</span><strong>{integration.data.item.prefix}…</strong></div><small>Comissão configurada: {integration.data.item.commissionRate ? `${integration.data.item.commissionRate}%` : "sem comissão"}</small></div>}
      <div className="api-commission-box"><div className="api-commission-heading"><span><Percent size={19}/></span><div><strong>Ajustar a entrada com sua comissão?</strong><p>A comissão é calculada sobre o crédito e somada à entrada apenas na resposta da API.</p></div></div>
        <div className="api-commission-choices" role="radiogroup" aria-label="Comissão na entrada">
          <label className={rate === 0 ? "selected" : ""}><input type="radio" name="api-commission" checked={rate === 0} onChange={() => setRate(0)}/><span><strong>Sem comissão</strong><small>Retornar a entrada original da SA</small></span></label>
          <label className={rate > 0 ? "selected" : ""}><input type="radio" name="api-commission" checked={rate > 0} onChange={() => setRate(integration.data?.item?.commissionRate || 1)}/><span><strong>Adicionar comissão</strong><small>Ajustar a entrada entre 1% e 8%</small></span></label>
        </div>
        {rate > 0 && <label className="api-rate-select">Percentual da comissão<select value={rate} onChange={event => setRate(Number(event.target.value))}>{[1,2,3,4,5,6,7,8].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>}
      </div>
      <div className="api-stock-actions"><button type="button" className="primary-button button-reset" disabled={generate.isPending} onClick={() => generate.mutate()}><KeyRound size={17}/>{generate.isPending ? "Gerando…" : integration.data?.item ? "Gerar nova chave" : "Gerar chave API"}</button>{integration.data?.item && <button type="button" className="danger-button" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{revoke.isPending ? "Revogando…" : "Revogar chave"}</button>}</div>
      {newToken && <div className="api-token-reveal" role="status"><strong>Copie a chave agora</strong><p>Por segurança, ela não será exibida novamente.</p><code>{newToken}</code></div>}
    </section>
  </>;
}
