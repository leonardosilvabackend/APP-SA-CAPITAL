export default function HistoryPagination({ page, hasNext, busy, onPage }: { page: number; hasNext?: boolean; busy?: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="Paginacao" className="form-actions">
    <button className="secondary-button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Pagina {page}</span>
    <button className="secondary-button" disabled={busy || !hasNext} onClick={() => onPage(page + 1)}>Proxima</button>
  </nav>;
}
