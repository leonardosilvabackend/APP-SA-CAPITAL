import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@shared/contracts";

type UserRecord = AuthenticatedUser & {
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

async function userApi(path = "", options?: RequestInit) {
  const response = await fetch(`/api/users${path}`, {
    credentials: "same-origin",
    ...options,
    headers: options?.body ? { "Content-Type": "application/json", ...options.headers } : options?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação");
  return data;
}

export default function UsersPage({ currentUser }: { currentUser: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "partner" });
  const usersQuery = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: async () => (await userApi()).users,
  });
  const createUser = useMutation({
    mutationFn: () => userApi("", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ name: "", email: "", phone: "", password: "", role: "partner" });
      setShowForm(false);
      toast.success("Usuário criado com sucesso");
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Record<string, string> }) => userApi(`/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário atualizado");
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createUser.mutate();
  }

  const records = usersQuery.data ?? [];
  return <section className="users-page">
    <div className="page-heading-row">
      <div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Usuários</h1><p>Cadastre parceiros e controle os acessos à plataforma.</p></div>
      <button className="primary-button button-reset" onClick={() => setShowForm(value => !value)}><Plus size={18} /> Novo usuário</button>
    </div>

    {showForm && <form className="user-form panel" onSubmit={submit}>
      <div className="form-heading"><div><h2>Novo acesso</h2><p>A senha inicial deve ser entregue ao usuário por um canal seguro.</p></div></div>
      <div className="form-grid">
        <label>Nome completo<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} minLength={3} required /></label>
        <label>E-mail<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label>
        <label>Telefone<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
        <label>Perfil<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="partner">Parceiro</option><option value="admin">Administrador</option></select></label>
        <label>Senha inicial<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} minLength={8} autoComplete="new-password" required /></label>
      </div>
      {createUser.error && <div className="auth-error" role="alert">{createUser.error.message}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary-button button-reset" disabled={createUser.isPending}>{createUser.isPending ? "Criando…" : "Criar usuário"}</button></div>
    </form>}

    <div className="user-summary">
      <span><Users size={18} /> {records.length} usuário{records.length === 1 ? "" : "s"}</span>
      <span><UserCheck size={18} /> {records.filter(user => user.status === "active").length} ativo{records.filter(user => user.status === "active").length === 1 ? "" : "s"}</span>
    </div>

    <div className="users-table-wrap panel">
      {usersQuery.isLoading && <div className="table-message">Carregando usuários…</div>}
      {usersQuery.error && <div className="auth-error">{usersQuery.error.message}</div>}
      {!usersQuery.isLoading && !usersQuery.error && <table className="users-table">
        <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Cadastrado em</th></tr></thead>
        <tbody>{records.map(user => {
          const isSelf = user.id === currentUser.id;
          return <tr key={user.id}>
            <td><div className="user-cell"><span className="table-avatar">{user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span><span><strong>{user.name}{isSelf ? " (você)" : ""}</strong><small>{user.email}{user.phone ? ` • ${user.phone}` : ""}</small></span></div></td>
            <td><select aria-label={`Perfil de ${user.name}`} disabled={isSelf || updateUser.isPending} value={user.role} onChange={event => updateUser.mutate({ id: user.id, changes: { role: event.target.value } })}><option value="partner">Parceiro</option><option value="admin">Administrador</option></select></td>
            <td><button className={`status-button ${user.status}`} disabled={isSelf || updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, changes: { status: user.status === "active" ? "inactive" : "active" } })}>{user.status === "active" ? <UserCheck size={15} /> : <UserX size={15} />}{user.status === "active" ? "Ativo" : "Inativo"}</button></td>
            <td>{new Intl.DateTimeFormat("pt-BR").format(new Date(user.createdAt))}</td>
          </tr>;
        })}</tbody>
      </table>}
      {!usersQuery.isLoading && records.length === 0 && <div className="table-message"><ShieldCheck size={26} /> Nenhum usuário encontrado.</div>}
    </div>
  </section>;
}
