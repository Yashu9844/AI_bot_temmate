"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { z } from "zod"

import { assertFeatures, FEATURES } from "@/lib/billing"
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
  const { userId, has } = await auth.protect()
  assertFeatures(has, FEATURES.bots)

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

// Renames a group and sets who's in it: bots left out are removed, new ones
// join after the current members
export async function updateGroupChat(
  chatId: string,
  values: z.input<typeof insertGroupChatSchema>
) {
  const { userId } = await auth.protect()

  const data = insertGroupChatSchema.parse(values)
  const botIds = [...new Set(data.botIds)]

  const result = await db.transaction(async (tx) => {
    const [chat] = await tx
      .update(chats)
      .set({ name: data.name })
      .where(
        and(
          eq(chats.id, chatId),
          eq(chats.userId, userId),
          eq(chats.kind, "group")
        )
      )
      .returning()
    if (!chat) throw new Error("Group not found")

    // Bot ids come from the browser; only the user's own bots can join
    const owned = await tx
      .select({ id: bots.id })
      .from(bots)
      .where(and(inArray(bots.id, botIds), eq(bots.userId, userId)))
    if (owned.length !== botIds.length) throw new Error("Bot not found")

    await tx
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          notInArray(chatMembers.botId, botIds)
        )
      )

    const current = await tx
      .select({ botId: chatMembers.botId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId))
    const added = botIds.filter((id) => !current.some((m) => m.botId === id))
    if (added.length > 0) {
      // Spaced a millisecond apart so join order matches the order picked
      const now = Date.now()
      await tx.insert(chatMembers).values(
        added.map((botId, i) => ({
          chatId,
          botId,
          joinedAt: new Date(now + i),
        }))
      )
    }

    return { chat }
  })

  // The name and faces show in the sidebar and the chat header
  revalidatePath("/", "layout")
  return result
}

// Deletes a group chat and its members; the bots themselves stay
export async function deleteGroupChat(chatId: string) {
  const { userId } = await auth.protect()

  const [chat] = await db
    .delete(chats)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, userId),
        eq(chats.kind, "group")
      )
    )
    .returning({ id: chats.id })
  if (!chat) throw new Error("Group not found")

  revalidatePath("/", "layout")
  // The current page is this group's chat, which no longer exists
  redirect("/")
}

const start = chat.createStartSessionAction<typeof chatAgent>("chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

// Starting a session or minting its token is bot usage, so those need the
// paid plan; reading a saved transcript does not
async function assertBotsFeature() {
  const { has } = await auth.protect()
  assertFeatures(has, FEATURES.bots)
}

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
  await assertBotsFeature()
  await assertChatOwner(params.chatId)
  return start(params)
}

// The transport calls this to refresh an expired session token
export async function mintChatAccessToken(chatId: string) {
  await assertBotsFeature()
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
