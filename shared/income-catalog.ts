import { z } from "zod";
import { pjIncomeTypes } from "./business";
export type IncomeConfiguration = { incomeDocuments: Record<string,string[]>; incomeTypes?: Record<string,"PF"|"PJ"> | null };
export function incomeCatalog(settings: IncomeConfiguration) {
  return Object.entries(settings.incomeDocuments).map(([name,documents])=>({name,documents,customerType:settings.incomeTypes?.[name] ?? (pjIncomeTypes.includes(name) ? "PJ" : "PF") as "PF"|"PJ"}));
}
const name = z.string().trim().min(2).max(60).refine(v=>!["__proto__","constructor","prototype"].includes(v));
export const incomeDocumentsSchema = z.record(name,z.array(z.string().trim().min(1).max(100)).min(1,"Inclua pelo menos um documento").max(50).refine(v=>new Set(v).size===v.length)).refine(v=>Object.keys(v).length>0 && Object.keys(v).length<=60 && new Set(Object.keys(v).map(k=>k.toLocaleLowerCase("pt-BR"))).size===Object.keys(v).length,"Informe tipos únicos de renda e documentos válidos");
export const incomeTypesSchema = z.record(name,z.enum(["PF","PJ"])).nullable().optional();
