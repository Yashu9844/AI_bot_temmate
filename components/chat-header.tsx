import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import type { ChatWithMembers } from "@/queries/chats"

function ChatHeader({ chat }: { chat: ChatWithMembers }) {
  // Group chats aren't handled yet; show the first bot
  const bot = chat.members[0]?.bot
  const title = (
    <>
      <ChatAvatar seed={bot?.avatar ?? chat.id} className="size-5" />
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
      {/* Placeholder: no action yet */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Desktop"
        className="ml-auto"
      >
        <MonitorIcon />
      </Button>
    </header>
  )
}

export { ChatHeader }
