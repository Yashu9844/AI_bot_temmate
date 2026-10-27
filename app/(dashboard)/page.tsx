import { auth } from "@clerk/nextjs/server"
import { PlusIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export default async function Page() {
  await auth.protect()

  return (
    <div className="flex min-h-svh flex-1">
      <Empty>
        <EmptyHeader>
          <ChatAvatar seed={crypto.randomUUID()} className="mb-2 size-24" />
          <EmptyTitle>Meet your first bot</EmptyTitle>
          <EmptyDescription>
            Every bot gets its own personality, memory, and face. Spin one up
            and start the conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <BotDialog>
            <Button variant="secondary">
              <PlusIcon data-icon="inline-start" />
              Create a new bot
            </Button>
          </BotDialog>
        </EmptyContent>
      </Empty>
    </div>
  )
}
