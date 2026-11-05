import { auth } from "@clerk/nextjs/server"
import { format } from "date-fns"
import Link from "next/link"

import { ResetCountdown } from "@/components/reset-countdown"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { PRICING_PATH } from "@/lib/billing"
import { METER_LABELS, type UsageMeter } from "@/lib/usage"
import { getUsageSummary } from "@/lib/usage-server"

const tokens = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const meters: {
  meter: UsageMeter
  format: (n: number) => string
  hint: string
}[] = [
  {
    meter: "ai_tokens",
    format: (n) => tokens.format(n),
    hint: "Words read and written by your bots, across every chat.",
  },
  {
    meter: "sandbox_seconds",
    format: duration,
    hint: "Time your bots' computers spend switched on, including while you watch their screens.",
  },
  {
    meter: "bots",
    format: (n) => String(n),
    hint: "Bots you have right now. Deleting one frees its slot.",
  },
]

// Reached from the user button menu; not linked in the sidebar nav
export default async function UsagePage() {
  const { userId } = await auth.protect()
  const { period, used, limits } = await getUsageSummary(userId)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 md:px-8 md:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">
          {period
            ? `This period: ${format(new Date(period.start), "MMM d")} – ${format(new Date(period.end), "MMM d, yyyy")}`
            : "Usage is part of the paid plan."}
        </p>
      </header>

      {period ? (
        <>
          <Card>
            <CardHeader>
              <CardDescription>Resets in</CardDescription>
              <CardTitle className="text-2xl">
                <ResetCountdown resetsAt={period.end} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              AI tokens and sandbox time start over on{" "}
              {format(new Date(period.end), "MMMM d 'at' p")}.
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-6">
              {meters.map(({ meter, format: fmt, hint }) => {
                const value = Math.min(used[meter], limits[meter])
                const full = used[meter] >= limits[meter]
                return (
                  <div key={meter} className="flex flex-col gap-2">
                    <Progress value={(value / limits[meter]) * 100}>
                      <ProgressLabel>{METER_LABELS[meter]}</ProgressLabel>
                      <span
                        className={
                          full
                            ? "ml-auto text-sm text-destructive tabular-nums"
                            : "ml-auto text-sm text-muted-foreground tabular-nums"
                        }
                      >
                        {fmt(used[meter])} of {fmt(limits[meter])}
                      </span>
                    </Progress>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No active plan</CardTitle>
            <CardDescription>
              Subscribe to create bots, chat with them, and use their sandboxes.
              Your monthly allowance shows up here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href={PRICING_PATH} />}>View plans</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
