"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { z } from "zod"

import { db } from "@/lib/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/lib/db/schema"

export async function createBot(values: z.input<typeof insertBotSchema>) {
  const { userId } = await auth.protect()

  const data = insertBotSchema.parse(values)

  // A new bot starts with its own direct chat; all three rows land or none do
  const result = await db.transaction(async (tx) => {
    const [bot] = await tx
      .insert(bots)
      .values({ ...data, instructions: data.instructions || null, userId })
      .returning()
    const [chat] = await tx
      .insert(chats)
      .values({ userId, kind: "direct" })
      .returning()
    await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id })

    return { bot, chat }
  })

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

  await db.transaction(async (tx) => {
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
      .returning({ id: bots.id })
    // Rolls back the chat deletes too
    if (!bot) throw new Error("Bot not found")
  })

  revalidatePath("/", "layout")
  // The current page is likely this bot's chat, which no longer exists
  redirect("/")
}
