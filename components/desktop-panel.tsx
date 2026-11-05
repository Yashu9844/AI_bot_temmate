"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { MonitorIcon, RefreshCwIcon } from "lucide-react"
import { usePanelRef } from "react-resizable-panels"
import { cn } from "cn"

import { getBotScreenUrl } from "@/actions/sandbox"
import { useFeatureGate } from "@/hooks/use-feature-gate"
import { useUsageGate } from "@/hooks/use-usage-gate"
import { FEATURES } from "@/lib/billing"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import { Spinner } from "@/components/ui/spinner"

type DesktopPanelContextValue = {
  panelRef: ReturnType<typeof usePanelRef>
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const DesktopPanelContext =
  React.createContext<DesktopPanelContextValue | null>(null)

function useDesktopPanel() {
  const context = React.useContext(DesktopPanelContext)
  if (!context) {
    throw new Error("useDesktopPanel must be used within DesktopPanelProvider")
  }
  return context
}

// Shares the desktop panel's open state between the header trigger and the
// panel itself, which live in different parts of the panel group
function DesktopPanelProvider({ children }: { children: React.ReactNode }) {
  const panelRef = usePanelRef()
  const [open, setOpen] = React.useState(false)

  const toggle = React.useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [panelRef])

  const value = React.useMemo(
    () => ({ panelRef, open, setOpen, toggle }),
    [panelRef, open, toggle]
  )

  return (
    <DesktopPanelContext.Provider value={value}>
      {children}
    </DesktopPanelContext.Provider>
  )
}

type Screen =
  | { status: "idle" }
  | { status: "loading"; url?: string }
  | { status: "ready"; url: string }
  | { status: "error"; url?: string }

// Right-hand panel with a preview of the bot's sandbox desktop, collapsed
// until toggled. Clicking the preview opens it fullscreen. Dragging the panel
// closed also updates the open state via onResize.
function DesktopPanel({ bot }: { bot?: { id: string; name: string } }) {
  const { panelRef, open, setOpen } = useDesktopPanel()
  const [screen, setScreen] = React.useState<Screen>({ status: "idle" })
  const gate = useFeatureGate()
  const usageGate = useUsageGate()
  const [fullscreen, setFullscreen] = React.useState(false)
  const [previewSlot, setPreviewSlot] = React.useState<HTMLElement | null>(null)
  const [dialogSlot, setDialogSlot] = React.useState<HTMLElement | null>(null)

  const botId = bot?.id
  const load = React.useCallback(async () => {
    if (!botId) return
    // Connecting to the sandbox needs the paid plan
    if (!gate(FEATURES.sandboxes) || !(await usageGate("sandbox_seconds"))) {
      setScreen({ status: "error" })
      return
    }
    // Keep the current URL so the frame stays up while a fresh one loads
    setScreen((prev) => ({
      status: "loading",
      url: "url" in prev ? prev.url : undefined,
    }))
    try {
      setScreen({ status: "ready", url: await getBotScreenUrl(botId) })
    } catch (error) {
      console.error(error)
      setScreen((prev) => ({
        status: "error",
        url: "url" in prev ? prev.url : undefined,
      }))
    }
  }, [botId, gate, usageGate])

  // Starting the sandbox costs time and compute, so wait until the panel is
  // first opened. After that the connection is kept, even while collapsed.
  const requestedRef = React.useRef(false)
  const onResize = (size: { asPercentage: number }) => {
    const isOpen = size.asPercentage > 0
    setOpen(isOpen)
    if (isOpen && !requestedRef.current) {
      requestedRef.current = true
      void load()
    }
  }

  const url = "url" in screen ? screen.url : undefined
  const name = bot?.name ?? "Bot"

  return (
    <>
      <ResizableHandle className={open ? undefined : "hidden"} />
      <ResizablePanel
        id="desktop"
        panelRef={panelRef}
        collapsible
        collapsedSize={0}
        defaultSize={0}
        minSize="30%"
        maxSize="70%"
        onResize={onResize}
      >
        <div className="flex h-full min-w-0 flex-col gap-3 p-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Reconnect"
              disabled={!bot || screen.status === "loading"}
              onClick={() => void load()}
            >
              <RefreshCwIcon />
            </Button>
          </div>
          <button
            type="button"
            aria-label={`Open ${name}'s screen fullscreen`}
            disabled={!url}
            onClick={() => setFullscreen(true)}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-zoom-in"
          >
            <div ref={setPreviewSlot} className="absolute inset-0" />
            {!url && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-sm text-muted-foreground">
                {!bot ? (
                  "No screen"
                ) : screen.status === "error" ? (
                  "Couldn't connect to the screen"
                ) : (
                  <Spinner />
                )}
              </div>
            )}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {screen.status === "error" && url
              ? "Couldn't reconnect"
              : `${name}'s screen`}
          </p>
        </div>
      </ResizablePanel>

      <Dialog
        open={fullscreen}
        // Non-modal: a modal dialog traps focus inside its popup and would
        // keep pulling it back out of the VNC iframe, which lives outside it
        modal={false}
        disablePointerDismissal
        onOpenChange={(next, details) => {
          // Only the close button closes it. Escape, clicks, and focus moving
          // into the VNC are all meant for the remote desktop.
          if (!next && details.reason !== "close-press") return
          setFullscreen(next)
        }}
      >
        <DialogContent className="flex h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{name}&apos;s screen</DialogTitle>
          </DialogHeader>
          <div
            ref={setDialogSlot}
            className="min-h-0 flex-1 overflow-hidden rounded-lg bg-muted"
          />
        </DialogContent>
      </Dialog>

      {url && (
        <VncFrame
          url={url}
          title={`${name}'s screen`}
          target={fullscreen && dialogSlot ? dialogSlot : previewSlot}
          interactive={fullscreen}
        />
      )}
    </>
  )
}

// The VNC iframe, rendered once at the document root and laid over whichever
// slot is showing it. Moving an iframe in the DOM reloads it, so instead of
// re-parenting it between the panel and the dialog, only its box changes.
function VncFrame({
  url,
  title,
  target,
  interactive,
}: {
  url: string
  title: string
  target: HTMLElement | null
  interactive: boolean
}) {
  const ref = React.useRef<HTMLIFrameElement>(null)

  // Follow the target every frame: it moves with panel drags, sidebar
  // transitions, and the dialog's open animation, not only on resize
  React.useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let raf = 0
    let last = ""
    const sync = () => {
      const rect = target?.getBoundingClientRect()
      const visible = !!rect && rect.width > 0 && rect.height > 0
      const next = visible
        ? `${rect.left},${rect.top},${rect.width},${rect.height}`
        : "hidden"
      if (next !== last) {
        last = next
        frame.style.visibility = visible ? "visible" : "hidden"
        if (rect) {
          frame.style.left = `${rect.left}px`
          frame.style.top = `${rect.top}px`
          frame.style.width = `${rect.width}px`
          frame.style.height = `${rect.height}px`
        }
      }
      raf = requestAnimationFrame(sync)
    }
    sync()
    return () => cancelAnimationFrame(raf)
  }, [target])

  // Keyboard goes to the desktop while fullscreen, and never otherwise
  React.useEffect(() => {
    const frame = ref.current
    if (!frame) return
    if (interactive) {
      const id = requestAnimationFrame(() => frame.focus())
      return () => cancelAnimationFrame(id)
    }
    if (document.activeElement === frame) frame.blur()
  }, [interactive])

  return createPortal(
    <iframe
      ref={ref}
      src={url}
      title={title}
      tabIndex={interactive ? 0 : -1}
      aria-hidden={!interactive}
      allow="clipboard-read; clipboard-write"
      style={{ visibility: "hidden" }}
      className={cn(
        "fixed rounded-lg border-0",
        // Above the dialog popup when fullscreen; in the panel it only takes
        // clicks through to the preview button underneath
        interactive ? "pointer-events-auto z-[51]" : "pointer-events-none"
      )}
    />,
    document.body
  )
}

function DesktopPanelTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { open, toggle } = useDesktopPanel()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={open ? "Hide desktop" : "Show desktop"}
      aria-pressed={open}
      className={className}
      onClick={toggle}
      {...props}
    >
      <MonitorIcon />
    </Button>
  )
}

export { DesktopPanel, DesktopPanelProvider, DesktopPanelTrigger }
