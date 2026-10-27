"use client"

import * as React from "react"

import { SidebarRail, useSidebar } from "@/components/ui/sidebar"

const STORAGE_KEY = "sidebar_width"
const MIN_WIDTH = 256
const MAX_WIDTH_RATIO = 0.35
// Pointer travel below this is a click (toggle), above it a drag (resize)
const DRAG_THRESHOLD = 3

function clampWidth(width: number) {
  const max = Math.max(MIN_WIDTH, window.innerWidth * MAX_WIDTH_RATIO)
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), max))
}

// The sidebar rail: click to collapse or expand, drag to resize.
// Writes straight to the wrapper's --sidebar-width so dragging doesn't
// re-render the whole sidebar on every pointer move
function SidebarResizeHandle() {
  const { state, toggleSidebar } = useSidebar()
  const ref = React.useRef<HTMLButtonElement>(null)
  const draggedRef = React.useRef(false)

  const getWrapper = React.useCallback(
    () =>
      ref.current?.closest<HTMLElement>('[data-slot="sidebar-wrapper"]') ??
      null,
    []
  )

  const applyWidth = React.useCallback(
    (next: number) => {
      const clamped = clampWidth(next)
      getWrapper()?.style.setProperty("--sidebar-width", `${clamped}px`)
      return clamped
    },
    [getWrapper]
  )

  function saveWidth(value: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {}
  }

  React.useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(STORAGE_KEY)
    } catch {}
    if (saved) applyWidth(Number(saved))

    // Keep the width within bounds when the window shrinks
    function onResize() {
      const current = getWrapper()?.style.getPropertyValue("--sidebar-width")
      if (current?.endsWith("px")) applyWidth(parseFloat(current))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [applyWidth, getWrapper])

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    draggedRef.current = false
    // A collapsed sidebar only expands on click
    if (event.button !== 0 || state === "collapsed") return

    const wrapper = getWrapper()
    if (!wrapper) return
    const animated = wrapper.querySelectorAll<HTMLElement>(
      '[data-slot="sidebar-gap"], [data-slot="sidebar-container"]'
    )
    const startX = event.clientX
    const startWidth =
      wrapper.querySelector<HTMLElement>('[data-slot="sidebar-container"]')
        ?.offsetWidth ?? MIN_WIDTH
    let latest = startWidth

    function onMove(e: PointerEvent) {
      if (
        !draggedRef.current &&
        Math.abs(e.clientX - startX) < DRAG_THRESHOLD
      ) {
        return
      }
      if (!draggedRef.current) {
        draggedRef.current = true
        // The sidebar animates width changes, which makes dragging lag
        animated.forEach((el) => (el.style.transition = "none"))
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }
      latest = applyWidth(startWidth + e.clientX - startX)
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (!draggedRef.current) return
      animated.forEach((el) => (el.style.transition = ""))
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      saveWidth(latest)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <SidebarRail
      ref={ref}
      onPointerDown={handlePointerDown}
      // The click that ends a drag shouldn't also collapse the sidebar
      onClick={() => {
        if (!draggedRef.current) toggleSidebar()
      }}
    />
  )
}

export { SidebarResizeHandle }
