"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar, RefreshCw, Database, Search, ListChecks } from "lucide-react"
import BreakdownDrawer from "@/components/breakdown-drawer"

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
  daysAgo?: number | null // How many days ago these goals were from
}

function todayKey(dateStr?: string) {
  const d = dateStr ?? new Date().toISOString().slice(0, 10)
  return `goals:${d}`
}

export default function DailyGoals() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeklyGoal, setWeeklyGoal] = useState("")
  const [goals, setGoals] = useState<string[]>(["", "", ""]) // 3 goals
  const [dateStr, setDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [source, setSource] = useState<"notion" | "local">("local")
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null)
  const [tcLoading, setTcLoading] = useState(false)
  const [tcItems, setTcItems] = useState<Array<{ id: string; title: string; url?: string; lastEdited?: string }>>([])
  const [tcSearch, setTcSearch] = useState("")
  // New high-level goals state
  const [excitingGoal, setExcitingGoal] = useState("")
  const [eoyGoal, setEoyGoal] = useState("")
  const [monthlyGoal, setMonthlyGoal] = useState("")
  // Goal retrieval tracking
  const [goalsDaysAgo, setGoalsDaysAgo] = useState<number | null>(null)
  // Breakdown drawer state
  const [bdOpen, setBdOpen] = useState(false)
  const [bdGoalId, setBdGoalId] = useState<string | undefined>(undefined)
  const [bdLabel, setBdLabel] = useState<string>("")

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

    try {
      // 1) Try local DB first for today's date
      let res = await fetch(`/api/local/goals?date=${dateStr}`)
      if (!res.ok) {
        // 2) Fallback to Notion-backed API
        res = await fetch(`/api/goals?date=${dateStr}`)
      }
      if (!res.ok) throw new Error("Failed to load goals")
      const data: GoalsResponse = await res.json()

      // Check if today's goals are empty and if so, try to load recent goals
      const hasAnyGoals = data.weeklyGoal || data.goals?.some(g => g) || data.excitingGoal || data.eoyGoal || data.monthlyGoal
      
      let finalData = data
      let daysAgo: number | null = null
      
      if (!hasAnyGoals) {
        try {
          // Try to load most recent goals from the past week
          const recentRes = await fetch(`/api/local/goals/recent?date=${dateStr}`)
          if (recentRes.ok) {
            const recentData = await recentRes.json()
            const hasRecentGoals = recentData.weeklyGoal || recentData.goals?.some((g: string) => g) || 
                                   recentData.excitingGoal || recentData.eoyGoal || recentData.monthlyGoal
            
            if (hasRecentGoals && recentData.daysAgo) {
              // Use recent goals but keep today's date
              finalData = {
                ...recentData,
                date: dateStr, // Keep today's date
                source: "local"
              }
              daysAgo = recentData.daysAgo
            }
          }
        } catch (e) {
          console.warn("Failed to load recent goals:", e)
        }
      }

      const filled: GoalsResponse = {
        date: finalData.date,
        weeklyGoal: finalData.weeklyGoal || "",
        goals: [finalData.goals?.[0] || "", finalData.goals?.[1] || "", finalData.goals?.[2] || ""],
        pageId: finalData.pageId,
        source: "local",
        excitingGoal: finalData.excitingGoal || "",
        eoyGoal: finalData.eoyGoal || "",
        monthlyGoal: finalData.monthlyGoal || "",
        daysAgo
      }
      
      setWeeklyGoal(filled.weeklyGoal)
      setGoals(filled.goals)
      setSource(filled.source as any)
      setExcitingGoal(filled.excitingGoal || "")
      setEoyGoal(filled.eoyGoal || "")
      setMonthlyGoal(filled.monthlyGoal || "")
      setGoalsDaysAgo(daysAgo)
      // Notify listeners immediately
      try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: filled })) } catch {}

      // Persist a snapshot so UI still has something offline
      saveToLocal(filled)
    } catch (e: any) {
      const local = loadFromLocal()
      if (local) {
        setWeeklyGoal(local.weeklyGoal || "")
        setGoals([local.goals?.[0] || "", local.goals?.[1] || "", local.goals?.[2] || ""])
        setSource("local")
        setExcitingGoal(local.excitingGoal || "")
        setEoyGoal(local.eoyGoal || "")
        setMonthlyGoal(local.monthlyGoal || "")
        setGoalsDaysAgo(local.daysAgo || null)
        try { window.dispatchEvent(new CustomEvent('dailyGoalsUpdated', { detail: local })) } catch {}
      } else {
        // empty state: let user type manually
        setWeeklyGoal("")
        setGoals(["", "", ""]) 
        setExcitingGoal("")
        setEoyGoal("")
        setMonthlyGoal("")
        setGoalsDaysAgo(null)
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
    
    // Clear the daysAgo indicator when user starts editing - these are now "current" goals
    if (goalsDaysAgo !== null) {
      setGoalsDaysAgo(null)
    }
    
    const snapshot: GoalsResponse = {
      date: dateStr,
      weeklyGoal,
      goals,
      source,
      excitingGoal,
      eoyGoal,
      monthlyGoal,
      daysAgo: null, // Always null for user edits since they're now current
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

  const todayStr = useMemo(() => dateStr, [dateStr])
  const goalKeyFor = (which: string) => `${todayStr}#${which}`
  const openBreakdownFor = (which: string, label: string) => {
    setBdGoalId(goalKeyFor(which))
    setBdLabel(label)
    setBdOpen(true)
  }

  // Allow other parts of the app (e.g., selection toolbar) to open breakdown for a goal
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { which?: string; label?: string }
        if (!detail?.which) return
        openBreakdownFor(detail.which, detail.label || detail.which)
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('openBreakdownFor', handler as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openBreakdownFor', handler as EventListener)
      }
    }
  }, [dateStr])

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
              <div className="text-xs text-zinc-500">
                {dateStr}
                {goalsDaysAgo && (
                  <span className="ml-2 text-blue-600">
                    (using goals from {goalsDaysAgo} day{goalsDaysAgo > 1 ? 's' : ''} ago)
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/30 text-zinc-700 bg-white/20">{source === "notion" ? "Notion" : "Local"}</Badge>
            {goalsDaysAgo && (
              <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-100/50">
                From {goalsDaysAgo} day{goalsDaysAgo > 1 ? 's' : ''} ago
              </Badge>
            )}
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
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/40 text-zinc-700"
                title="Break down this goal into tasks"
                onClick={() => openBreakdownFor('exciting', excitingGoal || 'Exciting Goal')}
              >
                <ListChecks className="h-4 w-4" />
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
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/40 text-zinc-700"
                title="Break down this goal into tasks"
                onClick={() => openBreakdownFor('eoy', eoyGoal || 'EOY Goal')}
              >
                <ListChecks className="h-4 w-4" />
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
              <Button
                size="icon"
                variant="secondary"
                className="bg-white/40 text-zinc-700"
                title="Break down this goal into tasks"
                onClick={() => openBreakdownFor('monthly', monthlyGoal || 'Monthly Goal')}
              >
                <ListChecks className="h-4 w-4" />
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
            <Button
              size="icon"
              variant="secondary"
              className="bg-white/40 text-zinc-700"
              title="Break down weekly goal into tasks"
              onClick={() => openBreakdownFor('weekly', weeklyGoal || 'Weekly Goal')}
            >
              <ListChecks className="h-4 w-4" />
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
                <Button
                  size="icon"
                  variant="secondary"
                  className="bg-white/40 text-zinc-700"
                  title="Break down into tasks"
                  onClick={() => openBreakdownFor(`goal${i+1}`, goals[i] || `Goal ${i+1}`)}
                >
                  <ListChecks className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Breakdown Drawer */}
      <BreakdownDrawer
        open={bdOpen}
        onOpenChange={setBdOpen}
        goalId={bdGoalId}
        scopeType="task"
        parentLabel={bdLabel}
      />

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
