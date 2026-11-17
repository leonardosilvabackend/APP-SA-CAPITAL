import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { crmActivities, notifications } from "../db/schema";
export const notificationsRouter=Router();
const asyncRoute=(handler:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{void handler(req,res,next).catch(next)};
export const notificationExpiry=()=>new Date(Date.now()+48*60*60*1000);
export const cleanupExpiredNotifications=async()=>{const db=getDatabase();if(db)await db.delete(notifications).where(lt(notifications.expiresAt,new Date()))};
notificationsRouter.get("/",asyncRoute(async(req,res)=>{
 const user=await getCurrentUser(req);if(!user)return res.status(401).json({error:"Faça login para continuar"});const db=getDatabase()!;
 const due=await db.select().from(crmActivities).where(and(eq(crmActivities.ownerId,user.id),eq(crmActivities.status,"pending"),lt(crmActivities.dueAt,new Date()))).limit(25);
 for(const activity of due){const dedupeKey=`crm-activity:${activity.id}`,[exists]=await db.select({id:notifications.id}).from(notifications).where(and(eq(notifications.recipientId,user.id),eq(notifications.dedupeKey,dedupeKey))).limit(1);if(!exists)await db.insert(notifications).values({recipientId:user.id,title:"Compromisso do CRM",message:activity.title,link:"/crm",dedupeKey,expiresAt:notificationExpiry()})}
 const items=await db.select().from(notifications).where(and(isNull(notifications.readAt),gt(notifications.expiresAt,new Date()),or(eq(notifications.recipientId,user.id),eq(notifications.audienceRole,user.role),and(isNull(notifications.recipientId),isNull(notifications.audienceRole))))).orderBy(desc(notifications.createdAt)).limit(50);return res.json({items})
}));
notificationsRouter.patch("/:id/read",asyncRoute(async(req,res)=>{const user=await getCurrentUser(req);if(!user)return res.status(401).json({error:"Faça login para continuar"});const [item]=await getDatabase()!.update(notifications).set({readAt:new Date()}).where(and(eq(notifications.id,req.params.id),or(eq(notifications.recipientId,user.id),eq(notifications.audienceRole,user.role),and(isNull(notifications.recipientId),isNull(notifications.audienceRole))))).returning({id:notifications.id});if(!item)return res.status(404).json({error:"Notificação não encontrada"});return res.json({success:true})}));
