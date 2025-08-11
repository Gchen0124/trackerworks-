"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar, RefreshCw, Database, Search } from "lucide-react"

interface GoalsResponse {
  date: string
  weeklyGoal: string
  goals: string[] // [g1,g2,g3]
  pageId?: string
  source: "notion" | "local"
  // New high-level goals (local-first; Notion optional)
  excitingGoal?: string
  eoyGoal?: string
  monthlyGoal?: string
}

function toDateStrLocal(d: Date = new Date()) {
  const dd = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return dd.toISOString().slice(0, 10)
}

function todayKey(dateStr?: string) {
  const d = dateStr ?? toDateStrLocal()
  return `goals:${d}`
}

export default function DailyGoals() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeklyGoal, setWeeklyGoal] = useState("")
  const [goals, setGoals] = useState<string[]>(["", "", ""]) // 3 goals
  const [dateStr, setDateStr] = useState<string>(() => toDateStrLocal())
  const [source, setSource] = useState<"notion" | "local">("local")
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null)
  const [tcLoading, setTcLoading] = useState(false)
  const [tcItems, setTcItems] = useState<Array<{ id: string; title: string; url?: string; lastEdited?: string }>>([])
  const [tcSearch, setTcSearch] = useState("")
  // New high-level goals state
  const [excitingGoal, setExcitingGoal] = useState("")
  const [eoyGoal, setEoyGoal] = useState("")
  const [monthlyGoal, setMonthlyGoal] = useState("")

  const storageKey = useMemo(() => todayKey(dateStr), [dateStr])

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const data: GoalsResponse = JSON.parse(raw)
      return data
    } catch {
      return null
    }
  }

  const saveToLocal = (data: GoalsResponse) => {
    localStorage.setItem(storageKey, JSON.stringify(data))
    // Broadcast update to same-tab listeners
    try {
      window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: data }))
    } catch {}
  }

  const fetchGoals = async () => {
    setLoading(true)
    setError(null)

    // Prefer Notion; if fails, fall back to local
    try {
      // 1) Try local DB first
      let res = await fetch(`/api/local/goals?date=${dateStr}`)
      if (!res.ok) {
        // 2) Fallback to Notion-backed API
        res = await fetch(`/api/goals?date=${dateStr}`)
      }
      if (!res.ok) throw new Error("Failed to load goals from Notion")
      const data: GoalsResponse = await res.json()

      const filled: GoalsResponse = {
        date: data.date,
        weeklyGoal: data.weeklyGoal || "",
        goals: [data.goals?.[0] || "", data.goals?.[1] || "", data.goals?.[2] || ""],
        pageId: data.pageId,
        source: "notion",
        excitingGoal: (data as any)?.excitingGoal || "",
        eoyGoal: (data as any)?.eoyGoal || "",
        monthlyGoal: (data as any)?.monthlyGoal || "",
      }
      setWeeklyGoal(filled.weeklyGoal)
      setGoals(filled.goals)
      setSource((data as any)?.source === 'local' ? 'local' : 'notion')
      setExcitingGoal(filled.excitingGoal || "")
      setEoyGoal(filled.eoyGoal || "")
      setMonthlyGoal(filled.monthlyGoal || "")
      // Notify listeners immediately
      try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: filled })) } catch {}

      // Persist a snapshot so UI still has something offline
      saveToLocal(filled)

      // If everything appears empty from local DB/Notion for today, try recovering from yesterday (local DB)
      const allEmpty = !filled.weeklyGoal && filled.goals.every(g => !g) && !filled.excitingGoal && !filled.eoyGoal && !filled.monthlyGoal
      if (allEmpty) {
        const yDate = toDateStrLocal(new Date(new Date(dateStr).getTime() - 24 * 60 * 60 * 1000))
        try {
          const yRes = await fetch(`/api/local/goals?date=${yDate}`)
          if (yRes.ok) {
            const yData: GoalsResponse = await yRes.json()
            const yFilled: GoalsResponse = {
              date: dateStr, // migrate to today
              weeklyGoal: yData.weeklyGoal || "",
              goals: [yData.goals?.[0] || "", yData.goals?.[1] || "", yData.goals?.[2] || ""],
              pageId: yData.pageId,
              source: 'local',
              excitingGoal: (yData as any)?.excitingGoal || "",
              eoyGoal: (yData as any)?.eoyGoal || "",
              monthlyGoal: (yData as any)?.monthlyGoal || "",
            }
            // Apply to UI
            setWeeklyGoal(yFilled.weeklyGoal)
            setGoals(yFilled.goals)
            setSource('local')
            setExcitingGoal(yFilled.excitingGoal || "")
            setEoyGoal(yFilled.eoyGoal || "")
            setMonthlyGoal(yFilled.monthlyGoal || "")
            try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: yFilled })) } catch {}
            saveToLocal(yFilled)
            // Persist migrated snapshot to today's date
            try {
              await fetch('/api/local/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(yFilled),
              })
            } catch {}
          }
        } catch {}
      }
    } catch (e: any) {
      const local = loadFromLocal()
      if (local) {
        setWeeklyGoal(local.weeklyGoal || "")
        setGoals([local.goals?.[0] || "", local.goals?.[1] || "", local.goals?.[2] || ""])
        setSource("local")
        setExcitingGoal(local.excitingGoal || "")
        setEoyGoal(local.eoyGoal || "")
        setMonthlyGoal(local.monthlyGoal || "")
        try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: local })) } catch {}
      } else {
        // empty state: let user type manually
        setWeeklyGoal("")
        setGoals(["", "", ""]) 
        setExcitingGoal("")
        setEoyGoal("")
        setMonthlyGoal("")
        setSource("local")
        setError(e?.message || "Unable to load goals")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGoals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr])

  // Persist manual edits locally for today
  useEffect(() => {
    if (loading) return
    const snapshot: GoalsResponse = {
      date: dateStr,
      weeklyGoal,
      goals,
      source,
      excitingGoal,
      eoyGoal,
      monthlyGoal,
    }
    saveToLocal(snapshot)
    // Also broadcast on each local edit
    try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: snapshot })) } catch {}
    // Best-effort persist to local DB
    try {
      fetch('/api/local/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }).catch(() => {})
    } catch {}
  }, [weeklyGoal, goals, dateStr, source, loading, excitingGoal, eoyGoal, monthlyGoal])

  const glassClass =
    "relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/20 to-white/5 " +
    "backdrop-blur-xl shadow-[0_0_1px_0_rgba(255,255,255,0.6),_0_8px_32px_rgba(0,0,0,0.25)]"

  const chromeSheen =
    "before:absolute before:inset-0 before:bg-[linear-gradient(120deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.08)_35%,rgba(255,255,255,0)_60%)] " +
    "before:pointer-events-none before:opacity-90"

  const silverRim = "bg-[radial-gradient(1200px_400px_at_10%_-10%,rgba(255,255,255,0.35),transparent),radial-gradient(800px_300px_at_110%_-20%,rgba(255,255,255,0.25),transparent)]"

  const labelCls = "text-xs uppercase tracking-wider text-gray-700 drop-shadow-sm"

  const openPicker = async (goalIndex: number) => {
    setPickerOpenFor(goalIndex)
    await loadTaskCalendar()
  }

  const loadTaskCalendar = async () => {
    try {
      setTcLoading(true)
      const res = await fetch(`/api/notion/task-calendar?limit=50${tcSearch ? `&search=${encodeURIComponent(tcSearch)}` : ""}`)
      if (!res.ok) throw new Error("Failed to load Task Calendar")
      const data = await res.json()
      setTcItems(data.items || [])
    } catch (e) {
      setTcItems([])
    } finally {
      setTcLoading(false)
    }
  }

  const applyPicked = (title: string) => {
    if (pickerOpenFor === null) return
    if (pickerOpenFor === -1) {
      setWeeklyGoal(title)
    } else if (pickerOpenFor === -2) {
      setExcitingGoal(title)
    } else if (pickerOpenFor === -3) {
      setEoyGoal(title)
    } else if (pickerOpenFor === -4) {
      setMonthlyGoal(title)
    } else {
      const next = [...goals]
      next[pickerOpenFor] = title
      setGoals(next)
    }
    setPickerOpenFor(null)
  }

  return (
    <div className="mt-2">
      <Card className={`${glassClass} ${chromeSheen} ${silverRim} p-5`}>        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-400 border border-white/40 grid place-items-center shadow-inner">
              <Calendar className="h-4 w-4 text-zinc-700" />
            </div>
            <div>
              <div className="text-sm text-zinc-700">Today's Focus</div>
              <div className="text-xs text-zinc-500">{dateStr}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/30 text-zinc-700 bg-white/20">{source === "notion" ? "Notion" : "Local"}</Badge>
            <Button size="sm" variant="outline" className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50" onClick={fetchGoals} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* High-level Goals: Exciting / EOY / Monthly */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Exciting Goal */}
          <div className="space-y-1">
            <div className={labelCls}>Exciting Goal</div>
            <div className="flex items-center gap-2">
              <Input
                value={excitingGoal}
                onChange={(e) => setExcitingGoal(e.target.value)}
                placeholder="What would be exciting to achieve?"
                className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500 flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50"
                onClick={() => openPicker(-2)}
                title="Pick from Task Calendar"
              >
                <Database className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* EOY Goal */}
          <div className="space-y-1">
            <div className={labelCls}>EOY goal</div>
            <div className="flex items-center gap-2">
              <Input
                value={eoyGoal}
                onChange={(e) => setEoyGoal(e.target.value)}
                placeholder="What do you want by end of year?"
                className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500 flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50"
                onClick={() => openPicker(-3)}
                title="Pick from Task Calendar"
              >
                <Database className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Monthly Goal */}
          <div className="space-y-1">
            <div className={labelCls}>Monthly goal</div>
            <div className="flex items-center gap-2">
              <Input
                value={monthlyGoal}
                onChange={(e) => setMonthlyGoal(e.target.value)}
                placeholder="What will you accomplish this month?"
                className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500 flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50"
                onClick={() => openPicker(-4)}
                title="Pick from Task Calendar"
              >
                <Database className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Weekly Goal */}
        <div className="mb-4">
          <div className={labelCls}>Weekly Goal</div>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
              placeholder="What's the big outcome this week?"
              className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500 flex-1"
            />
            <Button
              size="icon"
              variant="outline"
              className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50"
              onClick={() => openPicker(-1)}
              title="Pick from Task Calendar"
            >
              <Database className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Three Goals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <div className={labelCls}>Goal {i + 1}</div>
              <div className="flex items-center gap-2">
                <Input
                  value={goals[i]}
                  onChange={(e) => {
                    const copy = [...goals]
                    copy[i] = e.target.value
                    setGoals(copy)
                  }}
                  placeholder={`Set Goal ${i + 1}`}
                  className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500 flex-1"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50"
                  onClick={() => openPicker(i)}
                  title="Pick from Task Calendar"
                >
                  <Database className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Task Calendar Picker */}
      <Dialog open={pickerOpenFor !== null} onOpenChange={(open) => !open && setPickerOpenFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" /> 
              {(() => {
                if (pickerOpenFor === -2) return "Select Task for Exciting Goal"
                if (pickerOpenFor === -3) return "Select Task for EOY goal"
                if (pickerOpenFor === -4) return "Select Task for Monthly goal"
                if (pickerOpenFor === -1) return "Select Task for Weekly Goal"
                if (pickerOpenFor !== null) return `Select Task for Goal ${pickerOpenFor + 1}`
                return "Select Task"
              })()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks..."
                value={tcSearch}
                onChange={(e) => setTcSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadTaskCalendar()
                }}
                className="pl-9"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={loadTaskCalendar} disabled={tcLoading} className="bg-transparent flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${tcLoading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {tcLoading ? (
                <div className="text-sm text-gray-600">Loading...</div>
              ) : tcItems.length === 0 ? (
                <div className="text-sm text-gray-500">No items found</div>
              ) : (
                tcItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => applyPicked(it.title)}
                    className="w-full text-left p-3 border rounded-md hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-800">{it.title || "Untitled"}</div>
                    {it.lastEdited && (
                      <div className="text-xs text-gray-500">Last edited: {new Date(it.lastEdited).toLocaleString()}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weekly Goal Picker removed per user request */}
    </div>
  )
}
