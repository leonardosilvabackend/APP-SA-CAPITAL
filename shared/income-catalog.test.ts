import {expect,it} from "vitest";
import {incomeCatalog,incomeDocumentsSchema,incomeTypesSchema} from "./income-catalog";
import {checklistText} from "./checklist";
it("supports custom PF/PJ classifications while retaining legacy defaults",()=>{
  const catalog=incomeCatalog({incomeDocuments:{MEI:["RG"],"Nova renda":["Comprovante"]},incomeTypes:{"Nova renda":"PJ"}});
  expect(catalog.map(t=>t.customerType)).toEqual(["PJ","PJ"]);
  expect(checklistText("Nova renda",["Comprovante"],[],"PJ")).toContain("Pessoa jurídica");
});
it("rejects unsafe keys, duplicate names, duplicate documents and oversized labels",()=>{
  for(const value of [{CLT:[]},{},JSON.parse('{"__proto__":["RG"]}'),{CLT:["RG"],clt:["RG"]},{CLT:["RG","RG"]},{CLT:["x".repeat(101)]}])expect(incomeDocumentsSchema.safeParse(value).success).toBe(false);
  expect(incomeTypesSchema.safeParse({CLT:"invalid"}).success).toBe(false);
});
