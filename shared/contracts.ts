import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  app: z.string(),
  timestamp: z.string(),
  databaseConfigured: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const dashboardMetricsSchema = z.object({
  availableQuotas: z.number(),
  availableCredit: z.number(),
  savedQuotes: z.number(),
  activePartners: z.number(),
  preAnalyses: z.number(),
  pendingReservations: z.number(),
});

export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export const preAnalysisStatusSchema = z.enum(["received", "pending", "approved", "rejected", "documents_requested"]);
export const createPreAnalysisSchema = z.object({
  customerType: z.enum(["PF", "PJ"]),
  customerName: z.string().trim().min(3, "Informe o nome do cliente").max(160),
  document: z.string().transform(value => value.replace(/\D/g, "")),
  incomeType: z.string().trim().min(2).max(60),
  consent: z.literal(true, { error: "O consentimento é obrigatório" }),
  status: preAnalysisStatusSchema.default("received"),
}).refine(data => data.document.length === (data.customerType === "PF" ? 11 : 14), { message: "Informe um CPF ou CNPJ válido", path: ["document"] });
export const updatePreAnalysisSchema = z.object({ status: preAnalysisStatusSchema, observations: z.string().trim().max(5000).optional(), administratorId: z.string().uuid().nullable().optional() });

export const userRoleSchema = z.enum(["admin", "administrative", "advisor", "user"]);

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  managerId: z.string().uuid().nullable(),
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
  role: userRoleSchema.default("user"),
  managerId: z.string().uuid().nullable().optional(),
});

export const updateUserInputSchema = z.object({
  email: loginInputSchema.shape.email.optional(),
  name: z.string().trim().min(3).max(160).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  role: userRoleSchema.optional(),
  managerId: z.string().uuid().nullable().optional(),
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
