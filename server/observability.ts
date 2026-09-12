import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { RequestHandler } from "express";
import { smartCapacity } from "./stock/smart-capacity";

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
setInterval(() => loop.reset(), 60_000).unref();
const recent: { route: string; status: number; ms: number }[] = [];
let active = 0, completed = 0;
export const observeRequest: RequestHandler = (req, res, next) => {
  const id = randomUUID(), started = performance.now();
  const resource = req.path.split("/")[1];
  const namespace = ["auth", "users", "stock", "quotes", "negotiations", "pre-analyses", "administrators", "dashboard", "settings", "ready", "health", "operations"].includes(resource) ? resource : "unmatched";
  active++;
  res.setHeader("X-Request-Id", id);
  let finished = false;
  const record = () => {
    if (finished) return;
    finished = true; active--; completed++;
    const sample = { route: `${req.method} /api/${namespace} ${req.route?.path ?? "/unmatched"}`, status: res.writableFinished ? res.statusCode : 499, ms: Math.round(performance.now() - started) };
    recent.push(sample); if (recent.length > 2048) recent.shift();
    if (sample.status >= 500 || sample.ms >= 1000) console.log(JSON.stringify({ event: "http", requestId: id, ...sample }));
  };
  res.once("finish", record); res.once("close", record); next();
};
export function operationalMetrics() {
  const durations = recent.map(sample => sample.ms).sort((a, b) => a - b);
  return { uptimeSeconds: process.uptime(), active, completed, windowSize: recent.length, errors5xx: recent.filter(sample => sample.status >= 500).length,
    p95Ms: durations[Math.floor(durations.length * .95)] ?? 0, rssMB: process.memoryUsage().rss / 1048576,
    heapMB: process.memoryUsage().heapUsed / 1048576, cpuMicroseconds: process.cpuUsage(), eventLoopP99Ms: loop.percentile(99) / 1e6,
    smartSearch: smartCapacity(), recent: recent.slice(-50) };
}

// Reuse one probe during overload. The timeout bounds HTTP waiting; no new probe is
// started until the original database request settles, preventing a probe backlog.
export function readinessProbe(check: () => Promise<unknown>, timeoutMs = 1500) {
  let pending: Promise<unknown> | undefined;
  return async () => {
    pending ??= Promise.resolve().then(check).finally(() => { pending = undefined; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs); })]); }
    finally { clearTimeout(timer); }
  };
}
