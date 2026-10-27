import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { chatMembers, chats } from "@/lib/db/schema"

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
