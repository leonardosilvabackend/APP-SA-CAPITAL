import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  BarChart3,
  Bell,
  CircleUser,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import type { AuthenticatedUser, DashboardMetrics, HealthResponse } from "@shared/contracts";
import UsersPage from "./pages/UsersPage";
import { ChangePasswordPage, ForgotPasswordForm, ResetPasswordPage } from "./pages/PasswordPages";
import StockPage from "./pages/StockPage";
import QuotesPage from "./pages/QuotesPage";
import PreAnalysesPage from "./pages/PreAnalysesPage";
import SettingsPage from "./pages/SettingsPage";
import { AdministradorasPage } from "./pages/AdministradorasPage";
import NegotiationsPage from "./pages/NegotiationsPage";
import { toast } from "sonner";
import { selectionSurface } from "./lib/selectionSurface";


const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, roles: ["admin", "advisor", "user"] },
  { href: "/estoque", label: "Estoque de cotas", icon: PackageSearch, roles: ["admin", "administrative", "advisor", "user"] },
  { href: "/cotacoes", label: "Cotações", icon: WalletCards, roles: ["admin", "advisor", "user"] },
  { href: "/negociacoes", label: "Negociações", icon: WalletCards, roles: ["admin", "administrative", "advisor", "user"] },
  { href: "/administradoras", label: "Administradoras", icon: Building2, roles: ["admin", "administrative", "advisor", "user"] },
  { href: "/pre-analises", label: "Pré-análises", icon: FileSearch, roles: ["admin", "administrative", "advisor", "user"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["admin", "advisor"] },
  { href: "/perfil", label: "Perfil", icon: CircleUser, roles: ["admin", "administrative", "advisor", "user"] },
  { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin", "administrative", "advisor", "user"] },
];

const pageContent: Record<string, { title: string; description: string; icon: typeof PackageSearch }> = {
  "/estoque": { title: "Estoque de cotas", description: "Consulta, filtros e importação do estoque contemplado.", icon: PackageSearch },
  "/cotacoes": { title: "Cotações", description: "Histórico de cotações salvas e compartilhadas.", icon: WalletCards },
  "/pre-analises": { title: "Pré-análises", description: "Documentos e etapas da análise cadastral.", icon: FileSearch },
  "/usuarios": { title: "Usuários", description: "Administradores, parceiros, papéis e acessos.", icon: Users },
  "/configuracoes": { title: "Configurações", description: "Dados da empresa e integrações da plataforma.", icon: Settings },
};

function AppShell({ children, user, onLogout }: { children: ReactNode; user: AuthenticatedUser; onLogout: () => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <img className="sidebar-logo-mark" src="/brand/sa-capital-mark.jpeg" alt="SA Capital" />
          <div><strong>SA CAPITAL</strong><span>Soluções em créditos</span></div>
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav>
          <p className="nav-caption">PLATAFORMA</p>
          {navigation.filter(item => item.roles.includes(user.role)).map(item => {
            const Icon = item.icon;
            const active = location === item.href;
            return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`nav-link ${active ? "nav-link-active" : ""}`}><Icon size={19} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="profile-card">
          <div className="avatar">{user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div>
          <div><strong>{user.name}</strong><span>{{ admin: "Administrador", administrative: "Administrativo", advisor: "Assessor", user: "Usuário" }[user.role]}</span></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="topbar-title"><span>Portal SA Capital</span><small>Soluções em créditos</small></div>
          <button className="icon-button" aria-label="Notificações"><Bell size={20} /></button>
          <button className="icon-button" onClick={onLogout} aria-label="Sair"><LogOut size={20} /></button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Dashboard({ user }: { user: AuthenticatedUser }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const showInternalDashboard = user.role !== "user";
  const health = useQuery<HealthResponse>({
    queryKey: ["health"],
    enabled: showInternalDashboard,
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("API indisponível");
      return response.json();
    },
  });

  const metrics = useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics", user.id],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/metrics", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Não foi possível carregar os indicadores");
      return response.json();
    },
  });
  const reservations = useQuery<{ items: { id: string; quoteId: string; clientName: string; requesterName: string; createdAt: string }[] }>({ queryKey: ["pending-reservations"], queryFn: async () => { const response = await fetch("/api/dashboard/reservations"); if (!response.ok) throw new Error("Não foi possível carregar reservas"); return response.json(); }, enabled: user.role === "admin" });
  const reviewReservation = useMutation({ mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => { const response = await fetch(`/api/quotes/reservations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Falha ao revisar a reserva"); return data; }, onSuccess: data => { void reservations.refetch(); void metrics.refetch(); void queryClient.invalidateQueries({ queryKey: ["negotiations"] }); void queryClient.invalidateQueries({ queryKey: ["saved-quotes"] }); void queryClient.invalidateQueries({ queryKey: ["stock"] }); toast.success(data.negotiation ? `Reserva aprovada. ${data.negotiation.code} criada em Negocia\u00e7\u00f5es` : "Reserva recusada"); }, onError: error => toast.error(error.message) });

  const integer = (value?: number) => metrics.isLoading ? "…" : new Intl.NumberFormat("pt-BR").format(value ?? 0);
  const currency = (value?: number) => metrics.isLoading ? "…" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value ?? 0);

  const cards = [
    { label: "Cotas disponíveis", value: integer(metrics.data?.availableQuotas), detail: "Condições prontas para cotação", icon: PackageSearch, tone: "blue" },
    { label: "Cotações salvas", value: integer(metrics.data?.savedQuotes), detail: user.role === "admin" ? "Histórico de toda a equipe" : "Seu histórico de cotações", icon: WalletCards, tone: "gold" },
    ...(showInternalDashboard ? [{ label: "Parceiros ativos", value: integer(metrics.data?.activePartners), detail: "Acessos ativos na plataforma", icon: Users, tone: "green" }] : []),
    { label: "Volume disponível", value: currency(metrics.data?.availableCredit), detail: "Crédito total em estoque", icon: BarChart3, tone: "navy" },
    ...(user.role === "admin" ? [
      { label: "Pré-análises", value: integer(metrics.data?.preAnalyses), detail: "Registros recebidos", icon: FileSearch, tone: "green" },
      { label: "Pedidos de reserva", value: integer(metrics.data?.pendingReservations), detail: "Aguardando aprovação", icon: Bell, tone: "gold" },
    ] : []),
  ];

  return <>
    <section className="hero">
      <div><span className="eyebrow">{user.role === "admin" ? "PAINEL ADMINISTRATIVO" : "PAINEL DO PARCEIRO"}</span><h1>Olá, {user.name.split(" ")[0]}</h1><p>Acompanhe a operação comercial da SA Capital em um só lugar.</p></div>
      <Link href="/estoque" className="primary-button">Consultar estoque <ChevronRight size={18} /></Link>
    </section>
    <section className="metrics-grid">
      {cards.map(card => <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><card.icon size={21} /></div><span>{card.label}</span><strong>{card.value}</strong><small>{metrics.isError ? "Indicador temporariamente indisponível" : card.detail}</small></article>)}
    </section>
    {user.role === "admin" && reservations.data?.items.length ? <section className="panel reservation-panel"><span className="eyebrow">PEDIDOS DE RESERVA</span><h2>Aguardando aprovação</h2>{reservations.data.items.map(item => <div className="reservation-row" key={item.id} {...selectionSurface(() => navigate(`/cotacoes?id=${item.quoteId}`))} aria-label={`Consultar reserva de ${item.clientName}`}><div><strong>{item.clientName}</strong><small>{item.requesterName} • {new Date(item.createdAt).toLocaleString("pt-BR")}</small></div><button className="secondary-button" disabled={reviewReservation.isPending} onClick={() => reviewReservation.mutate({ id: item.id, status: "rejected" })}>Recusar</button><button className="primary-button button-reset" disabled={reviewReservation.isPending} onClick={() => reviewReservation.mutate({ id: item.id, status: "approved" })}>Aprovar e reservar</button></div>)}</section> : null}
    <section className={`content-grid${showInternalDashboard ? "" : " content-grid-user"}`}>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ATALHOS</span><h2>Operação comercial</h2></div></div>
        <div className="quick-grid">
          {navigation.filter(item => item.href !== "/" && item.roles.includes(user.role)).slice(0, 4).map(item => <Link href={item.href} className="quick-link" key={item.href}><span className="quick-icon"><item.icon size={21} /></span><span><strong>{item.label}</strong><small>Acessar módulo</small></span><ChevronRight size={18} /></Link>)}
        </div>
      </article>
      {showInternalDashboard && <article className="panel status-panel">
        <span className="eyebrow">AMBIENTE</span><h2>Status da nova aplicação</h2>
        <div className="status-line"><span className={`status-dot ${health.isSuccess ? "online" : ""}`} /><div><strong>{health.isLoading ? "Verificando servidor" : health.isSuccess ? "Servidor conectado" : "Servidor indisponível"}</strong><small>API local</small></div></div>
        <div className="status-line"><span className={`status-dot ${health.data?.databaseConfigured ? "online" : ""}`} /><div><strong>{health.data?.databaseConfigured ? "Banco configurado" : "Banco ainda não configurado"}</strong><small>PostgreSQL independente</small></div></div>
      </article>}
    </section>
  </>;
}

function ModulePage({ path }: { path: string }) {
  const data = pageContent[path];
  const Icon = data.icon;
  return <section className="module-page"><span className="eyebrow">MÓDULO INICIAL</span><h1>{data.title}</h1><p>{data.description}</p><div className="empty-state"><span><Icon size={30} /></span><h2>Estrutura preparada</h2><p>Este módulo será implementado em etapas, após definirmos as regras e prioridades da primeira versão.</p></div></section>;
}

async function authRequest(path: string, body?: Record<string, string>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a solicitação");
  return data;
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (user: AuthenticatedUser) => void }) {
  const setup = useQuery<{ needsSetup: boolean }>({ queryKey: ["setup-status"], queryFn: () => authRequest("setup-status"), retry: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const isSetup = setup.data?.needsSetup === true;
  const submit = useMutation({
    mutationFn: () => authRequest(isSetup ? "setup-admin" : "login", { ...(isSetup ? { name } : {}), email, password }),
    onSuccess: data => onAuthenticated(data.user),
  });

  if (setup.isLoading) return <div className="auth-loading">Preparando acesso seguro…</div>;
  return <div className="auth-page">
    <section className="auth-brand-panel">
      <div className="auth-brand"><img src="/brand/LOGOSA.png" alt="SA Capital — Soluções em créditos" /></div>
      <div><span className="eyebrow">CRÉDITO INTELIGENTE</span><h1>Decisões comerciais com clareza e segurança.</h1><p>Gestão de cotas contempladas, cotações e análises em uma plataforma independente.</p></div>
      <small>Ambiente protegido • SA Capital</small>
    </section>
    <section className="auth-form-panel">
      <div className="auth-card">
        {forgotPassword && !isSetup ? <ForgotPasswordForm onBack={() => setForgotPassword(false)} /> : <form onSubmit={event => { event.preventDefault(); submit.mutate(); }}>
        <span className="eyebrow">{isSetup ? "CONFIGURAÇÃO INICIAL" : "ACESSO À PLATAFORMA"}</span>
        <h2>{isSetup ? "Criar administrador" : "Bem-vindo de volta"}</h2>
        <p>{isSetup ? "Este cadastro é único e terá controle administrativo do sistema." : "Entre com seu e-mail e sua senha."}</p>
        {isSetup && <label>Nome completo<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} minLength={3} required /></label>}
        <label>E-mail<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete={isSetup ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={8} required /></label>
        {isSetup && <small className="password-help">Use pelo menos 8 caracteres. Prefira uma frase longa e exclusiva.</small>}
        {submit.error && <div className="auth-error" role="alert">{submit.error.message}</div>}
        {setup.isError && <div className="auth-error" role="alert">Não foi possível consultar o banco de dados.</div>}
        <button className="auth-submit" disabled={submit.isPending || setup.isError}>{submit.isPending ? "Aguarde…" : isSetup ? "Criar acesso administrativo" : "Entrar"}</button>
        {!isSetup && <button type="button" className="text-button" onClick={() => setForgotPassword(true)}>Esqueci minha senha</button>}
        </form>}
      </div>
    </section>
  </div>;
}

function App() {
  const queryClient = useQueryClient();
  const me = useQuery<AuthenticatedUser | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Não foi possível validar sua sessão");
      return (await response.json()).user;
    },
    retry: false,
  });
  const logout = async () => {
    await authRequest("logout", {});
    queryClient.setQueryData(["current-user"], null);
  };

  const resetToken = window.location.pathname === "/reset-password" ? new URLSearchParams(window.location.search).get("token") : null;

  if (resetToken) return <ResetPasswordPage token={resetToken} />;
  if (me.isLoading) return <div className="auth-loading">Validando sessão…</div>;
  if (!me.data) return <AuthPage onAuthenticated={user => queryClient.setQueryData(["current-user"], user)} />;
  if (me.data.mustChangePassword) return <ChangePasswordPage user={me.data} mandatory onChanged={user => queryClient.setQueryData(["current-user"], user)} />;

  return <AppShell user={me.data} onLogout={logout}><Switch><Route path="/">{() => <Dashboard user={me.data!} />}</Route><Route path="/estoque">{() => <StockPage user={me.data!} />}</Route><Route path="/cotacoes" component={QuotesPage} /><Route path="/negociacoes">{() => <NegotiationsPage user={me.data!} />}</Route> <Route path="/administradoras">
  {() => (
    <AdministradorasPage isAdmin={me.data!.role === "admin"} />
  )}
</Route><Route path="/pre-analises">{() => <PreAnalysesPage user={me.data!} />}</Route><Route path="/usuarios">{() => ["admin", "advisor"].includes(me.data!.role) ? <UsersPage currentUser={me.data!} /> : <StockPage user={me.data!} />}</Route><Route path="/perfil">{() => <ChangePasswordPage user={me.data!} onChanged={user => queryClient.setQueryData(["current-user"], user)} />}</Route><Route path="/configuracoes">{() => <SettingsPage user={me.data!} onChanged={user => queryClient.setQueryData(["current-user"], user)} />}</Route>{Object.keys(pageContent).filter(path => !["/estoque", "/cotacoes", "/pre-analises", "/usuarios", "/configuracoes"].includes(path)).map(path => <Route key={path} path={path}>{() => <ModulePage path={path} />}</Route>)}<Route><StockPage user={me.data!} /></Route></Switch></AppShell>;
}

export default App;
