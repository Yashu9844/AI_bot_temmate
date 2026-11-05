import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

// The signed-in user's bots, oldest first, for picking group chat members
export async function getBots() {
  const { userId } = await auth.protect()

  return db.query.bots.findMany({
    where: eq(bots.userId, userId),
    orderBy: asc(bots.createdAt),
    columns: { id: true, name: true, avatar: true },
  })
}

export type BotSummary = Awaited<ReturnType<typeof getBots>>[number]

// The signed-in user's chats, most recent first, with their bots in join order
export async function getChats() {
  const { userId } = await auth.protect()

  return db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        with: {
          bot: { columns: { id: true, name: true, avatar: true } },
        },
      },
    },
  })
}

export type ChatWithBots = Awaited<ReturnType<typeof getChats>>[number]
