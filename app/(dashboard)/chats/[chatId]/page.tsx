import { notFound } from "next/navigation"

import { ChatHeader } from "@/components/chat-header"
import { getChat } from "@/queries/chats"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  return <ChatHeader chat={chat} />
}
