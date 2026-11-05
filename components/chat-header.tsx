import { BotDialog } from "@/components/bot-dialog"
import { DesktopPanelTrigger } from "@/components/desktop-panel"
import { ChatMembersAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import type { BotSummary } from "@/queries/bots"
import type { ChatWithMembers } from "@/queries/chats"

// The title opens an edit dialog: the bot's for a direct chat, the group's
// (name, members, delete) for a group chat. `bots` are the user's bots, which
// the group dialog offers as members.
function ChatHeader({
  chat,
  bots,
}: {
  chat: ChatWithMembers
  bots: BotSummary[]
}) {
  const isGroup = chat.kind === "group"
  const bot = isGroup ? undefined : chat.members[0]?.bot
  const title = (
    <>
      <ChatMembersAvatar chat={chat} className="size-5" />
      <span className="truncate">{chat.name ?? bot?.name}</span>
    </>
  )

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      {isGroup ? (
        <GroupChatDialog
          chat={{
            id: chat.id,
            name: chat.name ?? "",
            botIds: chat.members.map((m) => m.bot.id),
          }}
          bots={bots}
        >
          <Button
            type="button"
            variant="ghost"
            aria-label={`Edit ${chat.name ?? "group"}`}
            className="min-w-0"
          >
            {title}
          </Button>
        </GroupChatDialog>
      ) : bot ? (
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
