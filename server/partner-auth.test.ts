import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const state = vi.hoisted(() => ({ key: null as any, allowed: true, failure: false, filters: [] as any[] }));
vi.mock("./auth/rate-limit", () => ({ consumePersistentLimit: vi.fn(async () => state.allowed) }));
vi.mock("./db/client", () => ({ getDatabase: () => ({
  select: () => ({ from: () => ({ innerJoin: () => ({ where: (filter: unknown) => {
    state.filters.push(filter);
    return { limit: async () => { if(state.failure) throw new Error("database unavailable"); return state.key ? [{key:state.key}] : []; } };
  } }) }) }),
  insert: () => ({ values: () => Promise.resolve() }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
}) }));
import { partnerApiRouter } from "./partner-api";
import { consumePersistentLimit } from "./auth/rate-limit";
import { PgDialect } from "drizzle-orm/pg-core";
let server: Server, base: string;
beforeAll(async () => {
  const app=express(); app.use('/api/v1',partnerApiRouter);
  app.use((_req,res)=>{res.json({ok:true})});
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(503).json({error:'unavailable'})});
  await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve)});
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/v1/probe`;
});
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
beforeEach(()=>{state.key={id:'key',commissionRate:0};state.allowed=true;state.failure=false;state.filters=[];vi.clearAllMocks()});
const request=(token='sa_test_example')=>fetch(base,{headers:token?{Authorization:`Bearer ${token}`}:{}});
it('rejects missing bearer credentials',async()=>{expect((await request('')).status).toBe(401)});
it('rejects unknown or revoked keys',async()=>{state.key=null;expect((await request()).status).toBe(401)});
it('requires active ownership in the authentication query',async()=>{
  expect((await request()).status).toBe(200);
  const query=new PgDialect().sqlToQuery(state.filters[0]);
  expect(query.sql).toContain('"users"."status"');expect(query.sql).toContain('"revoked_at" is null');expect(query.params).toContain('active');
  expect(consumePersistentLimit).toHaveBeenCalledWith('partner-api:key',60,60_000);
});
it('returns a retry interval on rate limiting',async()=>{state.allowed=false;const res=await request();expect(res.status).toBe(429);expect(res.headers.get('Retry-After')).toBe('60')});
it('forwards database failure without an unhandled rejection',async()=>{state.failure=true;expect((await request()).status).toBe(503)});
it('prevents caching of authenticated API responses',async()=>{expect((await request()).headers.get('Cache-Control')).toBe('no-store')});
