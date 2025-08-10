import { useEffect, useMemo, useState } from "react"

export type BlockFrame = {
  startMinute: number
  endMinute: number
  taskName: string
  status: string
  isPinned: boolean
  labelOverride?: string
}

function toDateStr(d: Date): string {
  const dd = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return dd.toISOString().slice(0, 10)
}

export function useLocalBlocks(currentModeMinutes: number, date: Date = new Date()) {
  const [frames, setFrames] = useState<BlockFrame[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const mode = useMemo(() => {
    if (currentModeMinutes === 30) return "30m"
    if (currentModeMinutes === 10) return "10m" // not grouped server-side; falls back to 30 step if unknown
    if (currentModeMinutes === 5) return "5m"
    if (currentModeMinutes === 3) return "3m"
    if (currentModeMinutes === 1) return "1m"
    return `${currentModeMinutes}m`
  }, [currentModeMinutes])

  const modeStep = useMemo(() => {
    if (currentModeMinutes === 30) return 30
    if (currentModeMinutes === 3) return 3
    if (currentModeMinutes === 1) return 1
    // For unsupported steps, we can approximate grouping client-side later.
    return currentModeMinutes
  }, [currentModeMinutes])

  useEffect(() => {
    let aborted = false
    const dateStr = toDateStr(date)
    setLoading(true)
    setError(null)
    fetch(`/api/local/blocks?date=${dateStr}&mode=${mode}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`load blocks failed: ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (aborted) return
        setFrames(json?.frames ?? [])
      })
      .catch((e) => {
        if (aborted) return
        setError(e?.message || "failed to load blocks")
      })
      .finally(() => {
        if (aborted) return
        setLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [mode, date, refreshTick])
  const refresh = () => setRefreshTick((x) => x + 1)

  return { frames, loading, error, mode, modeStep, refresh }
}
