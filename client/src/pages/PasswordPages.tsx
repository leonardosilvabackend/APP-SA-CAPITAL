import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AuthenticatedUser } from "@shared/contracts";

async function passwordApi(path: string, body?: Record<string, string>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a solicitação");
  return data;
}

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => passwordApi("forgot-password", { email }) });
  if (request.isSuccess) return <div className="password-success"><CheckCircle2 size={38} /><h2>Verifique seu e-mail</h2><p>Se o endereço estiver cadastrado e ativo, enviaremos um link válido por uma hora.</p><button className="text-button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao login</button></div>;
  return <>
    <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span><h2>Esqueci minha senha</h2><p>Informe o e-mail utilizado no cadastro.</p>
    <form onSubmit={event => { event.preventDefault(); request.mutate(); }}>
      <label>E-mail<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      {request.error && <div className="auth-error" role="alert">{request.error.message}</div>}
      <button className="auth-submit" disabled={request.isPending}>{request.isPending ? "Enviando…" : "Enviar link de recuperação"}</button>
      <button type="button" className="text-button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao login</button>
    </form>
  </>;
}

export function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const validity = useQuery<{ valid: boolean }>({
    queryKey: ["reset-token", token],
    queryFn: () => passwordApi(`reset-password/validate?token=${encodeURIComponent(token)}`),
    retry: false,
  });
  const reset = useMutation({ mutationFn: () => passwordApi("reset-password", { token, password }) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) return;
    reset.mutate();
  };
  const returnToLogin = () => { window.location.href = "/"; };

  return <div className="auth-page"><section className="auth-brand-panel"><div className="auth-brand"><div className="brand-mark">SA</div><strong>SA CAPITAL</strong></div><div><span className="eyebrow">ACESSO SEGURO</span><h1>Proteção para sua conta.</h1><p>Crie uma senha exclusiva que você não utilize em outros serviços.</p></div><small>Ambiente protegido • SA Capital</small></section><section className="auth-form-panel"><div className="auth-card">
    {validity.isLoading && <div className="password-success"><KeyRound size={34} /><p>Validando link…</p></div>}
    {!validity.isLoading && (!validity.data?.valid || validity.isError) && <div className="password-success"><KeyRound size={38} /><h2>Link inválido ou expirado</h2><p>Solicite um novo link na tela de login.</p><button className="auth-submit" onClick={returnToLogin}>Voltar ao login</button></div>}
    {validity.data?.valid && !reset.isSuccess && <form onSubmit={submit}><span className="eyebrow">NOVA SENHA</span><h2>Defina sua nova senha</h2><p>O link deixará de funcionar depois da alteração.</p><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>{confirmation && password !== confirmation && <div className="auth-error">As senhas não coincidem</div>}{reset.error && <div className="auth-error">{reset.error.message}</div>}<button className="auth-submit" disabled={reset.isPending || password !== confirmation}>{reset.isPending ? "Salvando…" : "Salvar nova senha"}</button></form>}
    {reset.isSuccess && <div className="password-success"><CheckCircle2 size={38} /><h2>Senha alterada</h2><p>Agora você já pode entrar utilizando a nova senha.</p><button className="auth-submit" onClick={returnToLogin}>Ir para o login</button></div>}
  </div></section></div>;
}

export function ChangePasswordPage({ user, mandatory, onChanged }: { user: AuthenticatedUser; mandatory?: boolean; onChanged: (user: AuthenticatedUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const change = useMutation({
    mutationFn: () => passwordApi("change-password", { currentPassword, newPassword }),
    onSuccess: data => onChanged(data.user),
  });
  const form = <form className="password-change-card panel" onSubmit={event => { event.preventDefault(); if (newPassword === confirmation) change.mutate(); }}><span className="eyebrow">SEGURANÇA</span><h2>{mandatory ? "Troque sua senha inicial" : "Alterar senha"}</h2><p>{mandatory ? `Olá, ${user.name.split(" ")[0]}. Antes de continuar, crie uma senha pessoal e exclusiva.` : "Ao alterar a senha, suas outras sessões serão encerradas."}</p><label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>{confirmation && newPassword !== confirmation && <div className="auth-error">As senhas não coincidem</div>}{change.error && <div className="auth-error">{change.error.message}</div>}{change.isSuccess && <div className="success-message">Senha alterada com sucesso.</div>}<button className="auth-submit" disabled={change.isPending || newPassword !== confirmation}>{change.isPending ? "Salvando…" : "Alterar senha"}</button></form>;
  if (!mandatory) return <section className="settings-page"><span className="eyebrow">CONFIGURAÇÕES</span><h1>Segurança da conta</h1><p>Gerencie sua senha de acesso.</p>{form}</section>;
  return <div className="mandatory-password-page">{form}</div>;
}
