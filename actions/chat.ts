"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { z } from "zod"

import { db } from "@/lib/db"
import {
  bots,
  chatMembers,
  chats,
  insertGroupChatSchema,
} from "@/lib/db/schema"
import { getChat } from "@/queries/chats"
import type { chatAgent } from "@/src/trigger/chat"

export async function createGroupChat(
  values: z.input<typeof insertGroupChatSchema>
) {
  const { userId } = await auth.protect()

  const data = insertGroupChatSchema.parse(values)
  const botIds = [...new Set(data.botIds)]

  const result = await db.transaction(async (tx) => {
    // Bot ids come from the browser; only the user's own bots can join
    const owned = await tx
      .select({ id: bots.id })
      .from(bots)
      .where(and(inArray(bots.id, botIds), eq(bots.userId, userId)))
    if (owned.length !== botIds.length) throw new Error("Bot not found")

    const [chat] = await tx
      .insert(chats)
      .values({ userId, kind: "group", name: data.name })
      .returning()
    // Spaced a millisecond apart so join order matches the order picked
    const now = Date.now()
    await tx.insert(chatMembers).values(
      botIds.map((botId, i) => ({
        chatId: chat.id,
        botId,
        joinedAt: new Date(now + i),
      }))
    )

    return { chat }
  })

  revalidatePath("/", "layout")
  return result
}

const start = chat.createStartSessionAction<typeof chatAgent>("chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

// chatId comes from the browser, so every action checks the signed-in user
// owns the chat before touching its session or transcript
async function assertChatOwner(chatId: string) {
  const chat = await getChat(chatId)
  if (!chat) throw new Error("Chat not found")
}

// Creates the session and its first run; idempotent per chat id
export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  await assertChatOwner(params.chatId)
  return start(params)
}

// The transport calls this to refresh an expired session token
export async function mintChatAccessToken(chatId: string) {
  await assertChatOwner(chatId)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadTranscript(params: { chatId: string }) {
  await assertChatOwner(params.chatId)
  return load({ chatId: params.chatId })
}
