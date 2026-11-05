"use client"

import * as React from "react"

// Time left until the usage period resets, ticking every second
function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  // Rendered on the server too; the first client tick replaces it
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const left = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 1000))
  if (left === 0) return <span>Resetting now</span>

  const parts: [number, string][] = [
    [Math.floor(left / 86400), "d"],
    [Math.floor((left % 86400) / 3600), "h"],
    [Math.floor((left % 3600) / 60), "m"],
    [left % 60, "s"],
  ]

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {parts.map(([value, unit]) => `${value}${unit}`).join(" ")}
    </span>
  )
}

export { ResetCountdown }
