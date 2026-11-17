import { Image, ShieldCheck } from "lucide-react";
import "../essential-storage.css";

export const essentialStorageKey = "sa-essential-storage-v1";

export default function EssentialStorageGate({ onAccept, onLogout }: { onAccept: () => void; onLogout: () => void }) {
  return <main className="essential-storage-page">
    <section className="essential-storage-card" role="dialog" aria-modal="true" aria-labelledby="essential-storage-title">
      <span className="essential-storage-icon"><ShieldCheck size={30}/></span>
      <span className="eyebrow">ARMAZENAMENTO ESSENCIAL</span>
      <h1 id="essential-storage-title">Imagens mais rápidas e menor consumo de dados</h1>
      <p>A plataforma precisa armazenar temporariamente no seu dispositivo arquivos essenciais, como logos das administradoras e imagens de perfil.</p>
      <div className="essential-storage-detail"><Image size={21}/><div><strong>Somente logos e imagens necessárias</strong><span>Não utilizamos essa autorização para publicidade, rastreamento ou cookies de marketing.</span></div></div>
      <p className="essential-storage-required">A aceitação é necessária para utilizar a área autenticada da plataforma.</p>
      <button className="primary-button" onClick={onAccept}>Aceitar armazenamento essencial e continuar</button>
      <button className="secondary-button" onClick={onLogout}>Sair</button>
    </section>
  </main>;
}
