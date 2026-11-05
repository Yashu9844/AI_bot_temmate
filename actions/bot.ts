"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { nanoid } from "nanoid"
import type { z } from "zod"

import { assertFeatures, FEATURES } from "@/lib/billing"
import { createBotSandbox, deleteSandbox } from "@/lib/daytona"
import { db } from "@/lib/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/lib/db/schema"
import { assertWithinLimits } from "@/lib/usage-server"

export async function createBot(values: z.input<typeof insertBotSchema>) {
  const { userId, has } = await auth.protect()
  // A new bot comes with its own sandbox, so it needs both features
  assertFeatures(has, FEATURES.bots, FEATURES.sandboxes)
  // Room for one more bot, and sandbox time left to boot its sandbox
  await assertWithinLimits(userId, ["bots", "sandbox_seconds"])

  const data = insertBotSchema.parse(values)

  // Every bot gets its own sandbox. Create it first so the row can store its ID.
  const botId = nanoid()
  const sandboxId = await createBotSandbox(botId, userId)

  // A new bot starts with its own direct chat; all three rows land or none do
  let result
  try {
    result = await db.transaction(async (tx) => {
      const [bot] = await tx
        .insert(bots)
        .values({
          ...data,
          id: botId,
          instructions: data.instructions || null,
          userId,
          sandboxId,
        })
        .returning()
      const [chat] = await tx
        .insert(chats)
        .values({ userId, kind: "direct" })
        .returning()
      await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id })

      return { bot, chat }
    })
  } catch (error) {
    // No bot row points at the sandbox, so don't leave it behind
    await deleteSandbox(sandboxId).catch((cleanupError) =>
      console.error(
        `Failed to delete orphaned sandbox ${sandboxId}`,
        cleanupError
      )
    )
    throw error
  }

  revalidatePath("/")
  return result
}

export async function updateBot(
  botId: string,
  values: z.input<typeof insertBotSchema>
) {
  const { userId } = await auth.protect()

  const data = insertBotSchema.parse(values)

  const [bot] = await db
    .update(bots)
    .set({ ...data, instructions: data.instructions || null })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning()
  if (!bot) throw new Error("Bot not found")

  // The name and face show in the sidebar and every chat header
  revalidatePath("/", "layout")
  return { bot }
}

export async function deleteBot(botId: string) {
  const { userId } = await auth.protect()

  const { sandboxId } = await db.transaction(async (tx) => {
    // Direct chats can't outlive their bot; group chats just lose a member
    const direct = await tx
      .select({ id: chats.id })
      .from(chats)
      .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
      .where(
        and(
          eq(chatMembers.botId, botId),
          eq(chats.userId, userId),
          eq(chats.kind, "direct")
        )
      )
    if (direct.length > 0) {
      await tx.delete(chats).where(
        inArray(
          chats.id,
          direct.map((c) => c.id)
        )
      )
    }

    const [bot] = await tx
      .delete(bots)
      .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
      .returning({ id: bots.id, sandboxId: bots.sandboxId })
    // Rolls back the chat deletes too
    if (!bot) throw new Error("Bot not found")

    return bot
  })

  // The bot is gone either way; a sandbox that fails to delete is only logged
  if (sandboxId) {
    await deleteSandbox(sandboxId).catch((error) =>
      console.error(`Failed to delete sandbox ${sandboxId}`, error)
    )
  }

  revalidatePath("/", "layout")
  // The current page is likely this bot's chat, which no longer exists
  redirect("/")
}
