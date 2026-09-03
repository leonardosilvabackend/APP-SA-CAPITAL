import { boolean, index, integer, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "partner"]);
export const userStatus = pgEnum("user_status", ["active", "inactive"]);
export const quotaStatus = pgEnum("quota_status", ["available", "reserved", "sold"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("partner"),
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

export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => users.id).notNull(),
  quotaId: uuid("quota_id").references(() => quotas.id).notNull(),
  customerName: varchar("customer_name", { length: 160 }).notNull(),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const preAnalyses = pgTable("pre_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => users.id).notNull(),
  customerType: varchar("customer_type", { length: 2 }).notNull(),
  customerName: varchar("customer_name", { length: 160 }).notNull(),
  document: varchar("document", { length: 30 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
