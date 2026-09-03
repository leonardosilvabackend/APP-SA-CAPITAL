import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { CalculationQuota } from "../../shared/quote";

export const userRole = pgEnum("user_role", ["admin", "partner", "administrative", "advisor", "user"]);
export const userStatus = pgEnum("user_status", ["active", "inactive"]);
export const quotaStatus = pgEnum("quota_status", ["available", "reserved", "sold"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("user"),
  managerId: uuid("manager_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  status: userStatus("status").notNull().default("active"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("password_reset_tokens_user_id_idx").on(table.userId)]);

export const quotas = pgTable("quotas", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  category: varchar("category", { length: 80 }).notNull(),
  administrator: varchar("administrator", { length: 160 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  creditAmount: numeric("credit_amount", { precision: 14, scale: 2 }).notNull(),
  entryAmount: numeric("entry_amount", { precision: 14, scale: 2 }).notNull(),
  installmentCount: integer("installment_count").notNull(),
  installmentAmount: numeric("installment_amount", { precision: 14, scale: 2 }).notNull(),
  outstandingBalance: numeric("outstanding_balance", { precision: 14, scale: 2 }).notNull(),
  status: quotaStatus("status").notNull().default("available"),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const savedQuotes = pgTable("saved_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientName: varchar("client_name", { length: 180 }).notNull(),
  creatorId: uuid("creator_id").references(() => users.id).notNull(),
  selectedQuotas: jsonb("selected_quotas").$type<CalculationQuota[]>().notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("saved_quotes_creator_id_idx").on(table.creatorId), index("saved_quotes_created_at_idx").on(table.createdAt), index("saved_quotes_expires_at_idx").on(table.expiresAt)]);

export const reservationRequests = pgTable("reservation_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id").references(() => savedQuotes.id, { onDelete: "cascade" }).notNull(),
  requesterId: uuid("requester_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("reservation_quote_idx").on(table.quoteId), index("reservation_status_idx").on(table.status)]);

export const preAnalyses = pgTable("pre_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => users.id).notNull(),
  customerType: varchar("customer_type", { length: 2 }).notNull(),
  customerName: varchar("customer_name", { length: 160 }).notNull(),
  document: varchar("document", { length: 30 }).notNull(),
  incomeType: varchar("income_type", { length: 60 }).notNull().default("Autônomo"),
  status: varchar("status", { length: 40 }).notNull().default("received"),
  observations: text("observations"),
  administratorId: uuid("administrator_id").references(() => users.id, { onDelete: "set null" }),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const preAnalysisDocuments = pgTable("pre_analysis_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  preAnalysisId: uuid("pre_analysis_id").references(() => preAnalyses.id, { onDelete: "cascade" }).notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("pre_analysis_documents_analysis_idx").on(table.preAnalysisId), index("pre_analysis_documents_expires_idx").on(table.expiresAt)]);

export const appSettings = pgTable("app_settings", {
  id: varchar("id", { length: 30 }).primaryKey().default("default"),
  companyName: varchar("company_name", { length: 160 }).notNull().default("SA Capital"),
  companyEmail: varchar("company_email", { length: 320 }),
  companyPhone: varchar("company_phone", { length: 40 }),
  legalNotice: text("legal_notice").notNull().default("A SA CAPITAL se isenta de qualquer responsabilidade sobre alteração de valores, fica a responsabilidade do parceiro verificar junto ao seu assessor os valores atualizados antes de qualquer negociação."),
  maxFileSizeMb: integer("max_file_size_mb").notNull().default(10),
  allowedFileTypes: jsonb("allowed_file_types").$type<string[]>().notNull().default(["application/pdf", "image/jpeg", "image/png"]),
  incomeDocuments: jsonb("income_documents").$type<Record<string, string[]>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
