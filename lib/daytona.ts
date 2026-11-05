import { Daytona, DaytonaNotFoundError } from "@daytona/sdk"

// Reads DAYTONA_API_KEY and DAYTONA_API_URL from the environment.
// Reuse one client across hot reloads in dev.
const globalForDaytona = globalThis as unknown as { daytona?: Daytona }

const daytona = globalForDaytona.daytona ?? new Daytona()
if (process.env.NODE_ENV !== "production") globalForDaytona.daytona = daytona

// One sandbox per bot. Labels tie it back to the bot in the Daytona dashboard.
export async function createBotSandbox(botId: string, userId: string) {
  const sandbox = await daytona.create({ labels: { botId, userId } })
  return sandbox.id
}

// A sandbox that is already gone counts as deleted.
export async function deleteSandbox(sandboxId: string) {
  try {
    const sandbox = await daytona.get(sandboxId)
    await daytona.delete(sandbox)
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) return
    throw error
  }
}
