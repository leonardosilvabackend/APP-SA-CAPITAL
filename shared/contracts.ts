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
  mustChangePassword: z.boolean(),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320).transform(value => value.toLowerCase()),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128),
});

export const setupAdminInputSchema = loginInputSchema.extend({
  name: z.string().trim().min(3, "Informe seu nome").max(160),
});

export const createUserInputSchema = setupAdminInputSchema.extend({
  phone: z.string().trim().max(32).optional(),
  role: userRoleSchema.default("partner"),
});

export const updateUserInputSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  role: userRoleSchema.optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine(value => Object.keys(value).length > 0, "Informe ao menos uma alteração");

export const requestPasswordResetInputSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320).transform(value => value.toLowerCase()),
});

export const resetPasswordInputSchema = z.object({
  token: z.string().min(40).max(200),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual").max(128),
  newPassword: z.string().min(8, "A nova senha deve ter ao menos 8 caracteres").max(128),
}).refine(value => value.currentPassword !== value.newPassword, { message: "A nova senha deve ser diferente da atual", path: ["newPassword"] });
