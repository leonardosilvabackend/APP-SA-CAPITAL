import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
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

const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/estoque", label: "Estoque de cotas", icon: PackageSearch },
  { href: "/cotacoes", label: "Cotações", icon: WalletCards },
  { href: "/pre-analises", label: "Pré-análises", icon: FileSearch },
  { href: "/usuarios", label: "Usuários", icon: Users },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
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
          <div className="brand-mark">SA</div>
          <div><strong>SA CAPITAL</strong><span>Crédito inteligente</span></div>
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav>
          <p className="nav-caption">PLATAFORMA</p>
          {navigation.filter(item => user.role === "admin" || item.href !== "/usuarios").map(item => {
            const Icon = item.icon;
            const active = location === item.href;
            return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`nav-link ${active ? "nav-link-active" : ""}`}><Icon size={19} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="profile-card">
          <div className="avatar">{user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div>
          <div><strong>{user.name}</strong><span>{user.role === "admin" ? "Administrador" : "Parceiro"}</span></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="topbar-title"><span>SA Capital</span><small>Portal comercial</small></div>
          <button className="icon-button" aria-label="Notificações"><Bell size={20} /></button>
          <button className="icon-button" onClick={onLogout} aria-label="Sair"><LogOut size={20} /></button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Dashboard({ user }: { user: AuthenticatedUser }) {
  const health = useQuery<HealthResponse>({
    queryKey: ["health"],
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

  const integer = (value?: number) => metrics.isLoading ? "…" : new Intl.NumberFormat("pt-BR").format(value ?? 0);
  const currency = (value?: number) => metrics.isLoading ? "…" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value ?? 0);

  const cards = [
    { label: "Cotas disponíveis", value: integer(metrics.data?.availableQuotas), detail: "Condições prontas para cotação", icon: PackageSearch, tone: "blue" },
    { label: "Cotações salvas", value: integer(metrics.data?.savedQuotes), detail: user.role === "admin" ? "Histórico de toda a equipe" : "Seu histórico de cotações", icon: WalletCards, tone: "gold" },
    { label: "Parceiros ativos", value: integer(metrics.data?.activePartners), detail: "Acessos ativos na plataforma", icon: Users, tone: "green" },
    { label: "Volume disponível", value: currency(metrics.data?.availableCredit), detail: "Crédito total em estoque", icon: BarChart3, tone: "navy" },
  ];

  return <>
    <section className="hero">
      <div><span className="eyebrow">{user.role === "admin" ? "PAINEL ADMINISTRATIVO" : "PAINEL DO PARCEIRO"}</span><h1>Olá, {user.name.split(" ")[0]}</h1><p>Acompanhe a operação comercial da SA Capital em um só lugar.</p></div>
      <Link href="/estoque" className="primary-button">Consultar estoque <ChevronRight size={18} /></Link>
    </section>
    <section className="metrics-grid">
      {cards.map(card => <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><card.icon size={21} /></div><span>{card.label}</span><strong>{card.value}</strong><small>{metrics.isError ? "Indicador temporariamente indisponível" : card.detail}</small></article>)}
    </section>
    <section className="content-grid">
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ATALHOS</span><h2>Operação comercial</h2></div></div>
        <div className="quick-grid">
          {navigation.slice(1, 5).map(item => <Link href={item.href} className="quick-link" key={item.href}><span className="quick-icon"><item.icon size={21} /></span><span><strong>{item.label}</strong><small>Acessar módulo</small></span><ChevronRight size={18} /></Link>)}
        </div>
      </article>
      <article className="panel status-panel">
        <span className="eyebrow">AMBIENTE</span><h2>Status da nova aplicação</h2>
        <div className="status-line"><span className={`status-dot ${health.isSuccess ? "online" : ""}`} /><div><strong>{health.isLoading ? "Verificando servidor" : health.isSuccess ? "Servidor conectado" : "Servidor indisponível"}</strong><small>API local</small></div></div>
        <div className="status-line"><span className={`status-dot ${health.data?.databaseConfigured ? "online" : ""}`} /><div><strong>{health.data?.databaseConfigured ? "Banco configurado" : "Banco ainda não configurado"}</strong><small>PostgreSQL independente</small></div></div>
      </article>
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
      <div className="auth-brand"><div className="brand-mark">SA</div><strong>SA CAPITAL</strong></div>
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

  return <AppShell user={me.data} onLogout={logout}><Switch><Route path="/">{() => <Dashboard user={me.data!} />}</Route><Route path="/estoque">{() => <StockPage user={me.data!} />}</Route><Route path="/cotacoes" component={QuotesPage} /><Route path="/pre-analises">{() => <PreAnalysesPage user={me.data!} />}</Route><Route path="/usuarios">{() => me.data!.role === "admin" ? <UsersPage currentUser={me.data!} /> : <StockPage user={me.data!} />}</Route><Route path="/configuracoes">{() => <ChangePasswordPage user={me.data!} onChanged={user => queryClient.setQueryData(["current-user"], user)} />}</Route>{Object.keys(pageContent).filter(path => !["/estoque", "/cotacoes", "/pre-analises", "/usuarios", "/configuracoes"].includes(path)).map(path => <Route key={path} path={path}>{() => <ModulePage path={path} />}</Route>)}<Route><StockPage user={me.data!} /></Route></Switch></AppShell>;
}

export default App;
