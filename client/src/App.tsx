import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Handshake,
  LayoutDashboard,
  Menu,
  PackageSearch,
  Settings,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import type { HealthResponse } from "@shared/contracts";

const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/estoque", label: "Estoque de cotas", icon: PackageSearch },
  { href: "/simulador", label: "Simulador", icon: Calculator },
  { href: "/cotacoes", label: "Cotações", icon: WalletCards },
  { href: "/propostas", label: "Propostas", icon: Handshake },
  { href: "/pre-analises", label: "Pré-análises", icon: FileSearch },
  { href: "/usuarios", label: "Usuários", icon: Users },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const pageContent: Record<string, { title: string; description: string; icon: typeof PackageSearch }> = {
  "/estoque": { title: "Estoque de cotas", description: "Consulta, filtros e importação do estoque contemplado.", icon: PackageSearch },
  "/simulador": { title: "Simulador", description: "Composição de condições e comissão comercial.", icon: Calculator },
  "/cotacoes": { title: "Cotações", description: "Histórico de cotações salvas e compartilhadas.", icon: WalletCards },
  "/propostas": { title: "Propostas", description: "Acompanhamento do funil comercial.", icon: Handshake },
  "/pre-analises": { title: "Pré-análises", description: "Documentos e etapas da análise cadastral.", icon: FileSearch },
  "/usuarios": { title: "Usuários", description: "Administradores, parceiros, papéis e acessos.", icon: Users },
  "/configuracoes": { title: "Configurações", description: "Dados da empresa e integrações da plataforma.", icon: Settings },
};

function AppShell({ children }: { children: ReactNode }) {
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
          {navigation.map(item => {
            const Icon = item.icon;
            const active = location === item.href;
            return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`nav-link ${active ? "nav-link-active" : ""}`}><Icon size={19} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="profile-card">
          <div className="avatar">AD</div>
          <div><strong>Administrador</strong><span>Ambiente inicial</span></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="topbar-title"><span>SA Capital</span><small>Portal comercial</small></div>
          <button className="icon-button" aria-label="Notificações"><Bell size={20} /></button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Dashboard() {
  const health = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("API indisponível");
      return response.json();
    },
  });

  const cards = [
    { label: "Cotas disponíveis", value: "—", icon: PackageSearch, tone: "blue" },
    { label: "Propostas em análise", value: "—", icon: ClipboardCheck, tone: "gold" },
    { label: "Parceiros ativos", value: "—", icon: Users, tone: "green" },
    { label: "Volume disponível", value: "—", icon: BarChart3, tone: "navy" },
  ];

  return <>
    <section className="hero">
      <div><span className="eyebrow">PAINEL ADMINISTRATIVO</span><h1>Bom dia, Administrador</h1><p>Acompanhe a operação comercial da SA Capital em um só lugar.</p></div>
      <Link href="/estoque" className="primary-button">Consultar estoque <ChevronRight size={18} /></Link>
    </section>
    <section className="metrics-grid">
      {cards.map(card => <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><card.icon size={21} /></div><span>{card.label}</span><strong>{card.value}</strong><small>Aguardando conexão com o banco</small></article>)}
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

function App() {
  return <AppShell><Switch><Route path="/" component={Dashboard} />{Object.keys(pageContent).map(path => <Route key={path} path={path}>{() => <ModulePage path={path} />}</Route>)}<Route><ModulePage path="/estoque" /></Route></Switch></AppShell>;
}

export default App;
