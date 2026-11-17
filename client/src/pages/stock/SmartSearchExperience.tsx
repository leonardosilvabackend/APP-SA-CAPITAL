import { useState } from "react";
import type { StockFilters } from "./contracts";
import SmartSearchModal from "./SmartSearchModal";
type Version="fast"|"wide"|"specific";
export default function SmartSearchExperience({filters,onUse,onClose}:{filters?:StockFilters;onUse:(ids:string[])=>void;onClose:()=>void}){
 const [version,setVersion]=useState<Version>("fast");
 return <><SmartSearchModal key={version} initialVersion={version} filters={filters} onUse={onUse} onClose={onClose}/><nav className="smart-search-floating-switcher" aria-label="Alternar mecanismo de busca"><button className={version==="fast"?"active":""} onClick={()=>setVersion("fast")}>1 · Busca rápida</button><button className={version==="wide"?"active":""} onClick={()=>setVersion("wide")}>2 · Busca ampla</button><button className={version==="specific"?"active":""} onClick={()=>setVersion("specific")}>3 · Pedido específico</button></nav></>
}
