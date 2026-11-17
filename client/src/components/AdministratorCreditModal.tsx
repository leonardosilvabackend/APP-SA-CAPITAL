import { useEffect, useRef } from "react";
import { BarChart3, Building2, CarFront, Layers3, X } from "lucide-react";
import AdministratorLogo from "./AdministratorLogo";

type CreditItem = { administrator: string; total: number; categories: { category: string; credit: number }[] };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export default function AdministratorCreditModal({ items, loading, error, onClose, onRetry }: { items: CreditItem[]; loading: boolean; error: boolean; onClose: () => void; onRetry: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  return <dialog ref={dialog} className="credit-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="credit-title">
    <div className="credit-dialog-content">
      <header className="credit-header">
        <div className="credit-heading-icon"><BarChart3 size={24} /></div>
        <div><span className="credit-eyebrow">RELAÇÃO DO ESTOQUE</span><h2 id="credit-title">Crédito por administradora</h2><p>Explore o volume disponível em cada categoria.</p></div>
        <button autoFocus type="button" className="credit-close" aria-label="Fechar relação do estoque" onClick={onClose}><X size={20} /></button>
      </header>
      {!loading && !error && items.length > 0 && <div className="credit-overview"><div><span>VOLUME TOTAL DISPONÍVEL</span><strong>{money(total)}</strong></div><span className="credit-count"><Building2 size={16} />{items.length} administradoras</span></div>}
      <div className="credit-body">
        {loading ? <p className="credit-message" role="status">Carregando o estoque disponível…</p> : error ? <div className="credit-message" role="alert"><p>Não foi possível carregar os valores.</p><button className="secondary-button" onClick={onRetry}>Tentar novamente</button></div> : !items.length ? <p className="credit-message">Nenhum crédito disponível no momento.</p> : <div className="credit-grid">{items.map(item => <article className="credit-tile" key={item.administrator}>
          <div className="credit-tile-heading"><div className="credit-logo-frame"><AdministratorLogo name={item.administrator} /></div><div><h3>{item.administrator}</h3><span>{item.categories.length} {item.categories.length === 1 ? "categoria disponível" : "categorias disponíveis"}</span></div></div>
          <div className="credit-tile-total"><span>Crédito disponível</span><strong>{money(item.total)}</strong></div>
          <div className="credit-categories">{item.categories.map(category => {
            const key = category.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const Icon = key.includes("veiculo") ? CarFront : key.includes("imove") || key.includes("imovel") ? Building2 : Layers3;
            return <div className="credit-category" key={category.category}><span><Icon size={16} />{category.category}</span><strong>{money(category.credit)}</strong></div>;
          })}</div>
        </article>)}</div>}
      </div>
      <footer className="credit-footer">Valores referentes às cotas disponíveis no estoque.</footer>
    </div>
  </dialog>;
}
