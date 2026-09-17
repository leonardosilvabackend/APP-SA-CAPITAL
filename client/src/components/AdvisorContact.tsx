import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import type { AdvisorContact as Contact } from "@shared/profile";

export default function AdvisorContact() {
  const [failed, setFailed] = useState(false);
  const contact = useQuery<{ advisor: Contact | null }>({ queryKey: ["advisor-contact"], queryFn: async () => { const r = await fetch("/api/profile/advisor"); if (!r.ok) throw new Error("Contato indisponível"); return r.json(); }, staleTime: 60_000 });
  useEffect(() => { setFailed(false); }, [contact.dataUpdatedAt]);
  const advisor = contact.data?.advisor;
  if (contact.isLoading) return <div className="advisor-contact" role="status">Carregando assessor…</div>;
  if (!advisor) return <div className="advisor-contact"><small>{contact.error ? "Contato temporariamente indisponível" : "Contato do assessor ainda não configurado"}</small></div>;
  return <aside className="advisor-contact" aria-label="Contato do seu assessor"><div className="advisor-portrait">{!failed ? <img src={`${advisor.photoUrl}?v=${contact.dataUpdatedAt}`} alt={`Foto de ${advisor.name}`} onError={() => setFailed(true)} /> : advisor.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div className="advisor-details"><small>{advisor.fallback ? "Seu contato • Administração" : "Seu assessor"}</small><strong>{advisor.name}</strong>{advisor.phone ? <a href={`tel:${advisor.phone.replace(/[^+\d]/g, "")}`}><Phone size={14} aria-hidden="true" />{advisor.phone}</a> : <span>Telefone não cadastrado</span>}</div></aside>;
}
