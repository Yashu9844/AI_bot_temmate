"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
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
