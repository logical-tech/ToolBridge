import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

// ── Better Auth tables ────────────────────────────────────────────────
// Shape mandated by better-auth core + apiKey plugin (better-auth ^1.3).
// Keep column names/types in sync with better-auth defaults.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: timestamp("last_refill_at"),
  enabled: boolean("enabled").default(true),
  rateLimitEnabled: boolean("rate_limit_enabled").default(true),
  rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
  rateLimitMax: integer("rate_limit_max").default(10),
  requestCount: integer("request_count").default(0),
  remaining: integer("remaining"),
  lastRequest: timestamp("last_request"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
})

// ── Tool Bridge domain tables ─────────────────────────────────────────

export const authConfig = pgTable("auth_config", {
  id: text("id").primaryKey(),
  toolkitSlug: text("toolkit_slug").notNull(),
  clientId: text("client_id"),
  clientSecretEncrypted: text("client_secret_encrypted"),
  webhookSecretEncrypted: text("webhook_secret_encrypted"),
  scopes: jsonb("scopes").$type<string[]>(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("auth_config_owner_toolkit").on(t.ownerId, t.toolkitSlug)])

export const connectedAccount = pgTable("connected_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  authConfigId: text("auth_config_id")
    .notNull()
    .references(() => authConfig.id, { onDelete: "cascade" }),
  toolkitSlug: text("toolkit_slug").notNull(),
  credentialsEncrypted: text("credentials_encrypted"),
  status: text("status", {
    enum: ["pending", "active", "expired", "error"],
  })
    .default("pending")
    .notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("connected_account_user_toolkit").on(t.userId, t.toolkitSlug)])

export const triggerEvent = pgTable("trigger_event", {
  id: text("id").primaryKey(),
  authConfigId: text("auth_config_id")
    .notNull()
    .references(() => authConfig.id, { onDelete: "cascade" }),
  toolkitSlug: text("toolkit_slug").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// Which tools a user exposes to LLMs for a toolkit. No row = the toolkit's
// essential (default) set. Reset = delete the row.
export const toolPreference = pgTable("tool_preference", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  toolkitSlug: text("toolkit_slug").notNull(),
  enabledSlugs: jsonb("enabled_slugs").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("tool_preference_user_toolkit").on(t.userId, t.toolkitSlug)])

export const toolExecution = pgTable("tool_execution", {
  id: text("id").primaryKey(),
  connectedAccountId: text("connected_account_id")
    .notNull()
    .references(() => connectedAccount.id, { onDelete: "cascade" }),
  toolSlug: text("tool_slug").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  status: text("status", { enum: ["success", "error"] }).notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
