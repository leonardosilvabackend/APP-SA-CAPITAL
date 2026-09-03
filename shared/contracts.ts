import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  app: z.string(),
  timestamp: z.string(),
  databaseConfigured: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
