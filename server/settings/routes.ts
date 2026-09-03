import { eq } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { defaultIncomeDocuments, legalNotice } from "../../shared/business";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { appSettings } from "../db/schema";
export const settingsRouter=Router();
function asyncRoute(handler:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>):RequestHandler{return(req,res,next)=>{void handler(req,res,next).catch(next);};}
async function ensureSettings(){const db=getDatabase()!;let [item]=await db.select().from(appSettings).where(eq(appSettings.id,"default"));if(!item)[item]=await db.insert(appSettings).values({id:"default",incomeDocuments:defaultIncomeDocuments,legalNotice}).returning();return item;}
settingsRouter.get("/",asyncRoute(async(req,res)=>{if(!(await getCurrentUser(req)))return res.status(401).json({error:"Faça login"});if(!getDatabase())return res.status(503).json({error:"Banco não configurado"});return res.json({settings:await ensureSettings()});}));
settingsRouter.put("/",asyncRoute(async(req,res)=>{const user=await getCurrentUser(req);if(!user||user.role!=="admin")return res.status(403).json({error:"Apenas o administrador altera configurações"});const parsed=z.object({companyName:z.string().min(2).max(160),companyEmail:z.string().email().or(z.literal("")),companyPhone:z.string().max(40),legalNotice:z.string().min(20).max(3000),maxFileSizeMb:z.number().int().min(1).max(25),allowedFileTypes:z.array(z.enum(["application/pdf","image/jpeg","image/png"])).min(1),incomeDocuments:z.record(z.string(),z.array(z.string().min(1))).refine(v=>Object.keys(v).length>0)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message??"Dados inválidos"});const db=getDatabase()!;const [settings]=await db.insert(appSettings).values({id:"default",...parsed.data,companyEmail:parsed.data.companyEmail||null,updatedAt:new Date()}).onConflictDoUpdate({target:appSettings.id,set:{...parsed.data,companyEmail:parsed.data.companyEmail||null,updatedAt:new Date()}}).returning();return res.json({settings});}));
