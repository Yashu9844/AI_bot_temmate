import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { DesktopPanel, DesktopPanelProvider } from "@/components/desktop-panel"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { getChat } from "@/queries/chats"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  const isGroup = chat.kind === "group"
  // A direct chat shows its bot's screen; groups have no desktop panel
  const bot = isGroup ? undefined : chat.members[0]?.bot
  const bots = chat.members.map((m) => ({
    id: m.bot.id,
    name: m.bot.name,
    avatar: m.bot.avatar,
  }))

  return (
    <DesktopPanelProvider>
      {/* The group sets an inline height: 100%, which overrides any height
          class on it, so the viewport height is set by this wrapper. Without
          it the group grows with the messages and the whole page scrolls. */}
      <div className="h-svh">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="chat" minSize="30%">
            <div className="flex h-full flex-col">
              <ChatHeader chat={chat} />
              <Chat
                key={chat.id}
                chatId={chat.id}
                bots={isGroup ? bots : undefined}
              />
            </div>
          </ResizablePanel>
          {!isGroup && (
            <DesktopPanel
              key={chat.id}
              bot={bot && { id: bot.id, name: bot.name }}
            />
          )}
        </ResizablePanelGroup>
      </div>
    </DesktopPanelProvider>
  )
}
