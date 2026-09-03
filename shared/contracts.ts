import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  app: z.string(),
  timestamp: z.string(),
  databaseConfigured: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const userRoleSchema = z.enum(["admin", "partner"]);

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  status: z.enum(["active", "inactive"]),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320).transform(value => value.toLowerCase()),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128),
});

export const setupAdminInputSchema = loginInputSchema.extend({
  name: z.string().trim().min(3, "Informe seu nome").max(160),
});
