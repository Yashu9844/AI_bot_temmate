import { BotDialog } from "@/components/bot-dialog"
import { DesktopPanelTrigger } from "@/components/desktop-panel"
import { ChatMembersAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import type { ChatWithMembers } from "@/queries/chats"

function ChatHeader({ chat }: { chat: ChatWithMembers }) {
  const isGroup = chat.kind === "group"
  // A direct chat's bot can be edited from the header; a group has several
  const bot = isGroup ? undefined : chat.members[0]?.bot
  const title = (
    <>
      <ChatMembersAvatar chat={chat} className="size-5" />
      <span className="truncate">{chat.name ?? bot?.name}</span>
    </>
  )

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      {bot ? (
        <BotDialog bot={bot}>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Edit ${bot.name}`}
            className="min-w-0"
          >
            {title}
          </Button>
        </BotDialog>
      ) : (
        <div className="flex min-w-0 items-center gap-2 px-2 text-sm font-medium">
          {title}
        </div>
      )}
      {/* Only a direct chat has one bot's desktop to show */}
      {!isGroup && <DesktopPanelTrigger className="ml-auto" />}
    </header>
  )
}

export { ChatHeader }
