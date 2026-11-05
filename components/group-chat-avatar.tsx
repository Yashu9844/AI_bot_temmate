import { cn } from "cn"

import { ChatAvatar } from "@/components/chat-avatar"

// Where each item sits inside the square, by how many items there are.
// Sizes and offsets are percentages, so the group scales with its box.
const layouts = {
  1: ["inset-0 size-full"],
  // Side by side, overlapping in the middle
  2: [
    "top-[18.75%] left-0 size-[62.5%]",
    "top-[18.75%] left-[37.5%] size-[62.5%]",
  ],
  // A triangle: one on top, two below
  3: [
    "top-0 left-[23%] size-[54%]",
    "top-[46%] left-0 size-[54%]",
    "top-[46%] left-[46%] size-[54%]",
  ],
  // A 2x2 grid
  4: [
    "top-0 left-0 size-1/2",
    "top-0 left-1/2 size-1/2",
    "top-1/2 left-0 size-1/2",
    "top-1/2 left-1/2 size-1/2",
  ],
} as const

const MAX_FACES = 3

// Up to three bot faces in the space of one ChatAvatar; any more bots are
// counted in a fourth spot. Pass the same size class you'd give ChatAvatar.
function GroupChatAvatar({
  seeds,
  className,
}: {
  seeds: string[]
  className?: string
}) {
  const faces = seeds.slice(0, MAX_FACES)
  const extra = seeds.length - faces.length
  const count = (faces.length + (extra > 0 ? 1 : 0)) as keyof typeof layouts
  const slots = layouts[count] ?? layouts[1]

  return (
    <div className={cn("relative size-8 shrink-0", className)}>
      {faces.map((seed, i) => (
        <ChatAvatar key={i} seed={seed} className={cn("absolute", slots[i])} />
      ))}
      {extra > 0 && (
        <div
          className={cn(
            "@container absolute flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground",
            slots[faces.length]
          )}
        >
          <span className="text-[40cqw] leading-none tracking-tight">
            +{extra}
          </span>
        </div>
      )}
    </div>
  )
}

type ChatForAvatar = {
  id: string
  kind: "direct" | "group"
  members: { bot: { avatar: string } }[]
}

// The bot's face for a direct chat, the group's faces for a group chat;
// both take up the same space
function ChatMembersAvatar({
  chat,
  className,
}: {
  chat: ChatForAvatar
  className?: string
}) {
  if (chat.kind === "group") {
    return (
      <GroupChatAvatar
        seeds={chat.members.map((m) => m.bot.avatar)}
        className={className}
      />
    )
  }
  return (
    <ChatAvatar
      seed={chat.members[0]?.bot.avatar ?? chat.id}
      className={className}
    />
  )
}

export { ChatMembersAvatar, GroupChatAvatar }
