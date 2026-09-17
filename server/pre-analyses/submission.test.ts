import { getTableName } from "drizzle-orm";
import { expect, it } from "vitest";
import { validateSubmission } from "./submission";
const tx = (documents: unknown[]) => ({ select: () => ({ from: (table: any) => ({ where: async () => getTableName(table) === "app_settings" ? [{ incomeDocuments: { CLT: ["RG", "Renda"] } }] : documents }) }) }) as any;
const item = { id: "test", incomeType: "CLT" } as any;
it("requires all configured documents on the server", async () => {
  await expect(validateSubmission(tx([{ documentType: "RG", size: 12 }]), item)).rejects.toThrow("Renda");
});
it("refuses expired or empty attachments", async () => {
  await expect(validateSubmission(tx([{ documentType: "RG", size: 12 }, { documentType: "Renda", size: 10, expiresAt: new Date(0) }]), item)).rejects.toThrow();
});
it("accepts a complete, valid set", async () => {
  await expect(validateSubmission(tx([{ documentType: "RG", size: 12 }, { documentType: "Renda", size: 10 }]), item)).resolves.toBeUndefined();
});
it("uses historical document requirements after a type is renamed or removed",async()=>{
 const historical={...item,incomeType:"Tipo removido",requiredDocumentsSnapshot:["Original"]};
 await expect(validateSubmission(tx([{documentType:"Original",size:12}]),historical)).resolves.toBeUndefined();
 await expect(validateSubmission(tx([{documentType:"RG",size:12}]),historical)).rejects.toThrow("Original");
});
