import { assertDatabaseSafety, validateEnvironment } from "../environment";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import express from "express";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";

// Opt-in: migrations run in a disposable schema with its own tables and sequence.
// Supabase Storage is mocked; no application records or files are changed.
const state = vi.hoisted(() => ({ db: null as any, user: null as any, uploadError: false, removed: [] as string[] }));
vi.mock("../db/client", () => ({ getDatabase: () => state.db }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async (req: any) => { const [user] = await state.db.select().from(schema.users).where(eq(schema.users.id, req.headers["x-load-user"] ?? state.user.id)); return user; } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({
  upload: async () => { await new Promise(resolve => setTimeout(resolve, 100)); return { error: null }; },
  remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null }; },
  createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/receipt" }, error: null }),
}) } }) }));
import { negotiationsRouter } from "./routes";
import { stockRouter } from "../stock/routes";
import { quotesRouter } from "../quotes/routes";
import { usersRouter } from "../users/routes";
import { preAnalysesRouter } from "../pre-analyses/routes";
import { backfillNegotiations, reviewReservation } from "./service";
import { config } from "../config";
import { consumePersistentLimit } from "../auth/rate-limit";
import { queueStatusEmail, processEmailJobs } from "../email-queue";
import { sendStatusEmail } from "../email";
import { persistedFbStatus } from "../stock/fb-monitor";
vi.mock("../email", () => ({ sendStatusEmail: vi.fn() }));


import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";

const suite = process.env.RUN_LOAD_TESTS === "1" ? describe : describe.skip;
suite("isolated Phase 2 load", () => {
  const schemaName = `test_negotiations_${crypto.randomUUID().replaceAll("-", "")}`;
  let client: ReturnType<typeof postgres>, adminClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>, server: Server, base: string;
  let admin: typeof schema.users.$inferSelect, advisor: typeof schema.users.$inferSelect, owner: typeof schema.users.$inferSelect, outsider: typeof schema.users.$inferSelect;
  let queryCount = 0;
  beforeAll(async () => {
    assertDatabaseSafety();
    const testUrl = process.env.SA_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!;
    validateEnvironment({ ...process.env, DATABASE_URL: testUrl }, true);
    adminClient = postgres(testUrl, { prepare: false, max: 1, onnotice: () => undefined });
    await adminClient.unsafe(`CREATE SCHEMA "${schemaName}"`);
    client = postgres(testUrl, { prepare: false, max: 10, debug: () => { queryCount++; }, connection: { search_path: `"${schemaName}",public` } });
    db = drizzle(client, { schema }); state.db = db;
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      const content = (await readFile(`drizzle/${file}`, "utf8")).replaceAll('"public".', `"${schemaName}".`).replace(/INSERT INTO storage\.buckets[\s\S]*?;/g, "");
      await client.begin(async tx => { for (const statement of content.split("--> statement-breakpoint").filter(part => part.trim())) await tx.unsafe(statement); });
    }
    async function user(role: "admin" | "user" | "advisor", managerId?: string) {
      return (await db.insert(schema.users).values({ name: role, email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test-only", role, managerId }).returning())[0];
    }
    admin = await user("admin"); advisor = await user("advisor"); owner = await user("user", advisor.id); outsider = await user("user");
    state.user = admin;
    config.supabaseUrl ||= "https://example.supabase.co"; config.supabaseServiceRoleKey ||= "test-only";
    const app = express(); app.use("/api/negotiations", negotiationsRouter);
    app.use("/api/stock", stockRouter); app.use(express.json({limit:"2mb"})); app.use("/api/quotes", quotesRouter); app.use("/api/users", usersRouter); app.use("/api/pre-analyses", preAnalysesRouter);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
    server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/negotiations`;
  }, 120000);
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (client) await client.end();
    if (adminClient) {
      if (!/^test_negotiations_[0-9a-f]{32}$/.test(schemaName)) throw new Error("Invalid test schema");
      await adminClient.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminClient.end();
    }
  }, 30000);

  it("measures 20, 50 and 100 simultaneous users", async () => {
    const label = process.env.LOAD_LABEL ?? "baseline";
    if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid report name");
    const people = await db.insert(schema.users).values(Array.from({ length: 100 }, (_, i) => ({ name: `Load ${i}`, email: `load${i}@example.invalid`, passwordHash: "load-only", role: "admin" as const }))).returning();
    const stock = [] as (typeof schema.quotas.$inferSelect)[];
    for (let start = 0; start < 1000; start += 100) stock.push(...await db.insert(schema.quotas).values(Array.from({length:100}, (_,i)=>({code:`LOAD-${start+i}`,category:"Auto",administrator:`Admin ${i%5}`,creditAmount:String(10000+(start+i)*17),entryAmount:"2000",installmentAmount:"300",installmentCount:100,outstandingBalance:"30000"}))).returning());
    for (let start=0;start<1000;start+=100) {
      await db.insert(schema.savedQuotes).values(stock.slice(start,start+100).map((q,i)=>({creatorId:people[i].id,clientName:`Client ${start+i}`,selectedQuotas:[q],commissionRate:"2",expiresAt:new Date(Date.now()+86400000)})));
      await db.insert(schema.negotiations).values(stock.slice(start,start+100).map((q,i)=>({ownerId:people[i].id,reservationId:crypto.randomUUID(),quoteId:crypto.randomUUID(),clientName:`History ${start+i}`,selectedQuotas:[q],status:"cancelled" as const,entryAmount:"2000",transferFee:"0",commissionAmount:"0",creditAmount:q.creditAmount,insuranceAmount:"0",outstandingBalance:"30000"})));
    }
    const drafts = await db.insert(schema.preAnalyses).values(people.map(p=>({partnerId:p.id,customerType:"PF",customerName:"Load",document:"52998224725",incomeType:"Test",status:"draft"}))).returning();
    await db.insert(schema.appSettings).values({id:"default",allowedFileTypes:["application/pdf"],maxFileSizeMb:5,incomeDocuments:{Test:["Test"]}}).onConflictDoNothing();
    const sourceQuotes=await db.select().from(schema.savedQuotes).limit(100);
    const reservations=await db.insert(schema.reservationRequests).values(sourceQuotes.map(q=>({quoteId:q.id,requesterId:q.creatorId}))).returning();
    const nativeFetch=globalThis.fetch;
    vi.stubGlobal("fetch", async (input: any, init: any) => {
      if(String(input).startsWith("https://fragaebitelloconsorcios.com.br/")) { await new Promise(r=>setTimeout(r,150)); return new Response(JSON.stringify([{id:987654,categoria:"Auto",administradora:"Load FB",valor_credito:"30000",entrada_sem_comissao:"9000",valor_parcela:"300",parcelas:100,reserva:"Reservar"}]),{headers:{"Content-Type":"application/json"}}); }
      if(!String(input).startsWith("http://127.0.0.1:")) throw new Error("External network blocked by load harness");
      return nativeFetch(input,init);
    });
    const planQueries = {
      quotes: "select * from saved_quotes order by created_at desc, id desc limit 21",
      stock: "select * from quotas where status = 'available' order by featured desc, credit_amount, code, id limit 20",
      negotiations: "select n.*, u.name from negotiations n inner join users u on u.id=n.owner_id order by n.created_at desc, n.id desc limit 21",
      preAnalyses: "select * from pre_analyses order by created_at desc, id desc limit 21",
      smartCandidates: "select * from quotas where status='available' and category='Auto' and credit_amount>0 and credit_amount<=153000",
    };
    const plans = await Promise.all(Object.entries(planQueries).map(async ([name, query]) => ({name, plan: await client.unsafe('explain (analyze, buffers, format json) '+query)})));
    const importRows = Number(process.env.LOAD_IMPORT_ROWS ?? 1000);
    if (![1000,5000,20000].includes(importRows)) throw new Error("Invalid import size");
    const importStock = Array.from({length:importRows},(_,i)=>({code:i<1000?stock[i].code:`LARGE-${i}`,category:"Auto",administrator:`Admin ${i%5}`,creditAmount:i<1000?stock[i].creditAmount:"10000",entryAmount:"2000",installmentCount:100,installmentAmount:"300",outstandingBalance:"30000"}));
    const results=[];
    const requested = process.env.LOAD_USERS ? [Number(process.env.LOAD_USERS)] : [20,50,100];
    if (requested.some(n => ![20,50,100].includes(n))) throw new Error("Invalid concurrency");
    const duration = Number(process.env.LOAD_SECONDS ?? 15);
    if (![15,60].includes(duration)) throw new Error("Invalid duration");
    for(const concurrency of requested) {
      const metrics: Record<string,{ms:number[],successMs:number[],bytes:number,status:Record<string,number>}>={};
      const loop=monitorEventLoopDelay({resolution:20});loop.enable();
      let peakRss=0,peakConnections=0,peakWaiting=0;const startCpu=process.cpuUsage(), startQueries=queryCount, start=performance.now();
      const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);void adminClient`select count(*)::int as n, count(*) filter(where wait_event_type='Lock')::int as waiting from pg_stat_activity where application_name='postgres.js'`.then(([row])=>{peakConnections=Math.max(peakConnections,row.n);peakWaiting=Math.max(peakWaiting,row.waiting);});},250);
      const deadline=start+duration*1000;
      async function request(name:string,path:string,worker:number,method="GET",body?:any,headers?:any) {
        const t=performance.now();let status="network",bytes=0;
        try { const r=await fetch(base.replace('/api/negotiations',path),{method,headers:{"x-load-user":people[worker].id,...(Buffer.isBuffer(body)?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?new Uint8Array(body):JSON.stringify(body),signal:AbortSignal.timeout(30000)});const text=await r.text();bytes=Buffer.byteLength(text);status=String(r.status); if(r.status>=500) console.error(name,text.slice(0,160)); }
        catch {} const m=metrics[name]??={ms:[],successMs:[],bytes:0,status:{}};const elapsed=performance.now()-t;m.ms.push(elapsed);if(Number(status)>=200&&Number(status)<300)m.successMs.push(elapsed);m.bytes+=bytes;m.status[status]=(m.status[status]??0)+1;
      }
      const background = (async () => {
        await request('fb','/api/stock/sync-fb',0,'POST');
        await request('import','/api/stock/import/commit',0,'POST',{mode:'add',rows:importStock});
        await Promise.all(reservations.slice([20,50,100].indexOf(concurrency)*10,[20,50,100].indexOf(concurrency)*10+10).map((r,i)=>request('reservation',`/api/quotes/reservations/${r.id}`,i,'PATCH',{status:'approved'})));
      })();
      await Promise.all(Array.from({length:concurrency},async(_,worker)=>{let step=worker;while(performance.now()<deadline){switch(step++%10){case 0:await request('smart','/api/stock/smart-search',worker,'POST',{category:'Auto',administrator:'',targetCredit:150000+(process.env.LOAD_VARIETY==='1'?worker*100:0),priority:'entry'});break;case 1:await request('quotes','/api/quotes/saved',worker);break;case 2:await request('negotiations','/api/negotiations',worker);break;case 3:await request('upload',`/api/pre-analyses/${drafts[worker].id}/documents`,worker,'POST',Buffer.from('%PDF-1.4\n'+ 'x'.repeat(65536)),{'Content-Type':'application/pdf','x-document-type':'Test'});break;default:await request('stock','/api/stock?pageSize=20',worker);}await new Promise(r=>setTimeout(r,100));}}));
      await background;
      clearInterval(sampler);loop.disable();const elapsed=performance.now()-start,cpu=process.cpuUsage(startCpu);
      results.push({concurrency,elapsedMs:elapsed,cpuOneCorePercent:(cpu.user+cpu.system)/1000/elapsed*100,peakRssMB:peakRss/1024/1024,peakConnections,peakWaiting,queries:queryCount-startQueries,eventLoopP99Ms:loop.percentile(99)/1e6,endpoints:Object.fromEntries(Object.entries(metrics).map(([name,m])=>{m.ms.sort((a,b)=>a-b);m.successMs.sort((a,b)=>a-b);return[name,{successP95:m.successMs[Math.floor(m.successMs.length*.95)],...{requests:m.ms.length,p50:m.ms[Math.floor(m.ms.length*.5)],p95:m.ms[Math.floor(m.ms.length*.95)],p99:m.ms[Math.floor(m.ms.length*.99)],meanBytes:m.bytes/m.ms.length,status:m.status}}]}))});
    }
    vi.unstubAllGlobals();
    await mkdir('.local/phase2',{recursive:true});await writeFile(`.local/phase2/${label}.json`,JSON.stringify({label,variedSearch:process.env.LOAD_VARIETY==='1',date:new Date(),node:process.version,cpu:os.cpus()[0]?.model,cores:os.cpus().length,totalMemoryMB:os.totalmem()/1024/1024,fixture:{users:100,stock:1000,quotes:1000,negotiations:1000,importRows},plans,results},null,2));
    console.log(JSON.stringify(results));
  },240000);
});
