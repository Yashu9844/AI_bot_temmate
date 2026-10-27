"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { ChatWithBots } from "@/queries/bots"

// Group chats aren't handled yet; show the first bot
function chatName(chat: ChatWithBots) {
  return chat.name ?? chat.members[0]?.bot.name ?? ""
}

// Avatar, name, time, and preview; shared by the sidebar and search rows
function ChatSummary({ chat }: { chat: ChatWithBots }) {
  const bot = chat.members[0]?.bot

  return (
    <>
      <ChatAvatar seed={bot?.avatar ?? chat.id} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{chatName(chat)}</span>
          <time
            dateTime={chat.lastMessageAt.toISOString()}
            suppressHydrationWarning
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatDistanceToNowStrict(chat.lastMessageAt)}
          </time>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {chat.lastMessagePreview}
        </span>
      </div>
    </>
  )
}

export function AppSidebar({ chats }: { chats: ChatWithBots[] }) {
  const [botDialogOpen, setBotDialogOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    tooltip="Create"
                    aria-label="Create"
                    className="w-8"
                  />
                }
              >
                <PlusIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
                    <PlusIcon />
                    Create new bot
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <UsersIcon />
                    Create group chat
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* Outlined like an input when expanded, a plain icon when collapsed */}
            <SidebarMenuButton
              variant="outline"
              tooltip="Search"
              onClick={() => setSearchOpen(true)}
              className="text-muted-foreground group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none"
            >
              <SearchIcon />
              <span>Search</span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                ⌘K
              </Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => {
                const href = `/chats/${chat.id}`

                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={chatName(chat)}
                      isActive={pathname === href}
                      render={<Link href={href} />}
                    >
                      <ChatSummary chat={chat} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The menu button owns the hover/active styles; the UserButton
                trigger stretches over it so the whole row is clickable */}
            <SidebarMenuButton
              size="lg"
              render={<div />}
              className="p-0 has-focus-visible:ring-2 has-aria-expanded:bg-sidebar-accent has-aria-expanded:text-sidebar-accent-foreground"
            >
              <UserButton
                showName
                appearance={{
                  elements: {
                    rootBox: "flex size-full",
                    userButtonTrigger:
                      "size-full justify-start rounded-[inherit] bg-transparent p-2 text-inherit shadow-none outline-hidden hover:bg-transparent focus:shadow-none active:bg-transparent group-data-[collapsible=icon]:p-1",
                    userButtonBox:
                      "w-full min-w-0 justify-start gap-2 text-inherit",
                    // Clerk renders the name before the avatar; flip them
                    userButtonAvatarBox: "order-first size-6",
                    userButtonOuterIdentifier:
                      "truncate p-0 text-sm font-medium text-inherit group-data-[collapsible=icon]:hidden",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarResizeHandle />
      <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search chats"
        description="Find a chat by name"
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  // Names repeat across chats, so match on them as keywords
                  value={chat.id}
                  keywords={[chatName(chat)]}
                  onSelect={() => {
                    setSearchOpen(false)
                    router.push(`/chats/${chat.id}`)
                  }}
                >
                  <ChatSummary chat={chat} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </Sidebar>
  )
}
