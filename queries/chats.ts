import { auth } from "@clerk/nextjs/server"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { chatMembers, chats } from "@/lib/db/schema"

// One of the signed-in user's chats with its bots in join order; undefined
// when it doesn't exist or belongs to someone else
export async function getChat(chatId: string) {
  const { userId } = await auth.protect()

  return db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              avatar: true,
              job: true,
              instructions: true,
            },
          },
        },
      },
    },
  })
}

export type ChatWithMembers = NonNullable<Awaited<ReturnType<typeof getChat>>>
