import { describe, expect, it } from "vitest";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";
import { smartSearchInputSchema } from "../../shared/stock";
import { findSmartOptions } from "./smart-options";
const q = (id: string, credit = 100000, entry = 20000, installment = 1000, balance = 80000, administrator = "A", category = "Imóvel"): CalculationQuota => ({ id, code: id, category, administrator, creditAmount: credit, entryAmount: entry, installmentAmount: installment, outstandingBalance: balance, installmentCount: 120 });
const input: SmartSearchInput = { category: "Imóvel", administrator: "", targetCredit: 100000, priority: "entry" };
describe("nova regra do Pedido Inteligente", () => {
  it.each([undefined, "", "__all__"])("aceita todas administradoras com valor %s", administrator => expect(smartSearchInputSchema.parse({ ...input, administrator }).administrator).toBe(""));
  it("seleciona as três melhores entre administradoras sem misturar cotas", async () => {
    const stock = [q("a",100000,30000,1000,80000,"A"), q("b",100000,20000,1000,80000,"B"), q("c",100000,10000,1000,80000,"C"), q("d",100000,25000,1000,80000,"D")];
    const result = await findSmartOptions(stock, input);
    expect(result.options.map(option => option.items[0].administrator)).toEqual(["C", "B", "D"]);
    const specific = await findSmartOptions(stock, { ...input, administrator: "A" });
    expect(specific.options.map(option => option.items[0].administrator)).toEqual(["A"]);
  });
  it.each([98000, 102000])("aceita o limite inclusivo de crédito %s", async credit => expect((await findSmartOptions([q("x", credit)], input)).options).toHaveLength(1));
  it("recusa valores fora da margem sem inventar resultado", async () => expect((await findSmartOptions([q("a", 97999), q("b", 102001)], input)).options).toEqual([]));
  it("filtra administradora, categoria e não mistura administradoras", async () => { const result = await findSmartOptions([q("a", 40000), q("b", 60000, 10000, 500, 50000, "B"), q("c", 60000, 10000, 500, 50000, "A", "Veículo")], input); expect(result.options).toEqual([]); });
  it("aceita uma cota e combina várias sem repetição", async () => { const one = await findSmartOptions([q("one")], input); expect(one.options[0].items).toHaveLength(1); const a=q("a",40000), b=q("b",60000); const many=await findSmartOptions([a,b,a],input); expect(many.options[0].items.map(item=>item.id).sort()).toEqual(["a","b"]); });
  it("ordena pelo percentual agregado de entrada, não pelo valor absoluto", async () => { const result=await findSmartOptions([q("absolute",98000,24000),q("ratio",102000,24500)],input); expect(result.options[0].items[0].id).toBe("ratio"); });
  it("ordena pelo percentual agregado de parcela", async () => { const result=await findSmartOptions([q("absolute",98000,20000,950),q("ratio",102000,20000,970)],{...input,priority:"installment"}); expect(result.options[0].items[0].id).toBe("ratio"); });
  it("ordena saldo pela diferença em reais e prefere negativo", async () => { const result=await findSmartOptions([q("positive",100000,0,0,101000),q("negative",100000,0,0,92000)],{...input,priority:"balance"}); expect(result.options[0].items[0].id).toBe("negative"); expect(result.options[0].summary.balanceDifference).toBe(-8000); });
  it("calcula combinação por totais, nunca por média simples", async () => { const result=await findSmartOptions([q("single",98000,35000),q("small",20000,0),q("large",80000,36000)],input); expect(result.options[0].items[0].id).toBe("single"); });
  it("usa parcela máxima somente como restrição da menor entrada", async () => { const result=await findSmartOptions([q("best-entry-over",100000,10000,1001),q("valid-low-entry",100000,15000,990),q("valid-low-parcel",100000,20000,500)],{...input,secondaryAmount:1000}); expect(result.options[0].items[0].id).toBe("valid-low-entry"); expect(result.fallback).toBe(false); });
  it("aplica fallback pelo menor excesso e desempata por entrada", async () => { const result=await findSmartOptions([q("far",100000,5000,1080,80000,"A"),q("near-high-entry",100000,20000,1020,80000,"B"),q("near-low-entry",100000,15000,1020,80000,"C")],{...input,secondaryAmount:1000}); expect(result.fallback).toBe(true); expect(result.options.map(option=>option.items[0].id)).toEqual(["near-low-entry","near-high-entry","far"]); });
  it("aplica desempate por proximidade e depois total financeiro", async () => { const result=await findSmartOptions([q("far",98000,19600,1000,80000,"A"),q("close",100000,20000,1000,80000,"B"),q("upper",102000,20400,1000,80000,"C")],input); expect(result.options[0].items[0].id).toBe("close"); expect(result.options[1].items[0].id).toBe("far"); });
  it("retorna somente a melhor combinação quando só uma administradora atende", async () => { const result=await findSmartOptions([q("a",100000,10000),q("b",100000,11000),q("c",100000,12000)],input); expect(result.options.map(option=>option.items[0].id)).toEqual(["a"]); });
  it.each([1,2,3])("retorna somente %s administradoras elegíveis", async count => { const stock=Array.from({length:count},(_,i)=>q(String(i),100000,10000+i,1000,80000,String(i))); expect((await findSmartOptions(stock,input)).options).toHaveLength(count); });
  it("conclui estoque grande, visita a última administradora e mantém a API responsiva", async () => {
    const stock=Array.from({length:20000},(_,i)=>q(String(i),1000,200));
    stock.push(q("last",100000,10000,1000,80000,"Z"));
    let yielded=false; const timer=setTimeout(()=>{yielded=true;},0);
    const result=await findSmartOptions(stock,input); clearTimeout(timer);
    expect(yielded).toBe(true); expect(result.complete).toBe(true);
    expect(result.options).toHaveLength(2); expect(result.options[0].items[0].id).toBe("last");
    expect(result.options[1].items).toHaveLength(100);
    expect(new Set(result.options[1].items.map(item => item.id)).size).toBe(100);
  });
  it("compara as melhores de todas, mesmo quando as três menores entradas são da primeira", async () => {
    const stock = [q("a1",100000,10000), q("a2",100000,11000), q("a3",100000,12000), q("b",100000,20000,1000,80000,"B"), q("c",100000,30000,1000,80000,"C")];
    const result = await findSmartOptions(stock,input);
    expect(result.options.map(option => option.items[0].id)).toEqual(["a1", "b", "c"]);
    expect((await findSmartOptions(stock,{...input,administrator:"A"})).options).toHaveLength(1);
  });
  it("não preenche administradoras faltantes com opções acima da parcela", async () => {
    const result = await findSmartOptions([q("over",100000,10000,2000,80000,"A"),q("ok",100000,20000,900,80000,"B")], {...input, secondaryAmount:1000});
    expect(result.fallback).toBe(false); expect(result.options.map(option=>option.items[0].id)).toEqual(["ok"]);
  });
});
