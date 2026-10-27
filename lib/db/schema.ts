import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // Clerk user ID
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // Seed for the bot's generated face
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    // What the bot is for, in a phrase
    job: text("job").notNull(),
    // How it should go about the job
    instructions: text("instructions"),
    // Sandbox provider ID, created lazily
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)]
)

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

// Fields a user fills in; id, owner, and sandbox are set on the server
export const insertBotSchema = createInsertSchema(bots, {
  name: (s) => s.trim().min(1, "Give it a name").max(50),
  avatar: (s) => s.min(1),
  job: (s) => s.trim().min(1, "Give it a job").max(100),
  instructions: (s) => s.trim().max(2000),
}).pick({ name: true, avatar: true, job: true, instructions: true })
