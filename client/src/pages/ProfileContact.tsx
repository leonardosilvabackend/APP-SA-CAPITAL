import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";

async function profileRequest(path = "", options?: RequestInit) {
  const r = await fetch(`/api/profile${path}`, { credentials: "same-origin", ...options }); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil"); return data;
}
export default function ProfileContact({ user }: { user: AuthenticatedUser }) {
  const qc = useQueryClient(), [phone, setPhone] = useState<string>(), [photo, setPhoto] = useState<File>();
  const profile = useQuery<{ phone: string | null; photoUrl: string }>({ queryKey: ["own-profile", user.id], queryFn: () => profileRequest() });
  const save = useMutation({ mutationFn: async () => {
    if (photo) { if (!["image/png", "image/jpeg"].includes(photo.type) || photo.size > 2 * 1024 * 1024) throw new Error("Envie uma foto JPG ou PNG de até 2 MB"); await profileRequest("/photo", { method: "POST", headers: { "Content-Type": photo.type }, body: photo }); }
    await profileRequest("", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone ?? profile.data?.phone ?? "" }) });
  }, onSuccess: () => { setPhoto(undefined); void qc.invalidateQueries({ queryKey: ["own-profile"] }); void qc.invalidateQueries({ queryKey: ["advisor-contact"] }); toast.success("Contato atualizado"); }, onError: error => toast.error(error.message) });
  return <section className="panel profile-contact-panel"><h2>Foto e contato</h2><p>Seu contato será exibido aos usuários vinculados a você.</p>{profile.error && <p className="auth-error">{profile.error.message}</p>}<form onSubmit={e => { e.preventDefault(); save.mutate(); }}><label>Telefone<input type="tel" maxLength={32} value={phone ?? profile.data?.phone ?? ""} onChange={e => setPhone(e.target.value)} /></label><label>Foto de perfil (JPG/PNG, até 2 MB)<input type="file" accept=".jpg,.jpeg,.png" onChange={e => setPhoto(e.target.files?.[0])} /></label><button className="primary-button button-reset" disabled={save.isPending || !profile.isSuccess}>{save.isPending ? "Salvando…" : "Salvar contato"}</button></form></section>;
}
