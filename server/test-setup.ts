// Also protect direct Vitest invocation, not only npm test.
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
await import("./environment");
export {};
