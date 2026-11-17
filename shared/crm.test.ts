import { describe, expect, it } from "vitest";
import { crmActivityInputSchema, crmDealInputSchema, crmDeleteError, crmMoveError, crmMoveSchema, crmPipelineInputSchema, crmStageOrderSchema, isCrmAdministrator } from "./crm";

const pipelineId="00000000-0000-4000-8000-000000000010",stageId="00000000-0000-4000-8000-000000000011";

describe("CRM policies",()=>{
 it("requires a client name",()=>expect(crmDealInputSchema.safeParse({name:""}).success).toBe(false));
 it("accepts a minimal manual deal",()=>expect(crmDealInputSchema.safeParse({name:"Maria",pipelineId,stageId,priority:"medium"}).success).toBe(true));
 it("rejects negative credit",()=>expect(crmDealInputSchema.safeParse({name:"Maria",pipelineId,stageId,creditAmount:-1}).success).toBe(false));
 it("validates persisted stages and versions",()=>expect(crmMoveSchema.safeParse({stageId,version:0,lossReason:null}).success).toBe(true));
 it("validates configurable pipelines",()=>expect(crmPipelineInputSchema.safeParse({name:"Comercial",color:"#2563eb",isDefault:true,stages:[{name:"Novo",color:"#3b82f6",resultType:"open"}]}).success).toBe(true));
 it("rejects duplicate order payloads outside UUID shape",()=>expect(crmStageOrderSchema.safeParse({stageIds:["invalid"]}).success).toBe(false));
 it("validates CRM activities",()=>expect(crmActivityInputSchema.safeParse({dealId:stageId,type:"follow_up",title:"Retornar cliente",dueAt:new Date().toISOString()}).success).toBe(true));
 it.each(["admin","administrative"])("allows %s administrative CRM privileges",role=>expect(isCrmAdministrator(role)).toBe(true));
 it.each(["user","advisor"])("blocks %s from entering reservation",role=>expect(crmMoveError(role,"new","reservation",false)).toContain("automaticamente"));
 it("blocks a common user from leaving reservation",()=>expect(crmMoveError("user","reservation","new",true)).toContain("automaticamente"));
 it("blocks active reservation from lost for common user",()=>expect(crmMoveError("user","new","lost",true)).toContain("reserva ativa"));
 it("allows manual lost and recovery",()=>{expect(crmMoveError("user","new","lost",false)).toBeNull();expect(crmMoveError("user","lost","new",false)).toBeNull()});
 it("allows admin to move without creating financial rules",()=>expect(crmMoveError("admin","new","reservation",false)).toBeNull());
 it("protects deletion when reservation is active",()=>expect(crmDeleteError(true)).toContain("não pode ser excluído"));
});
