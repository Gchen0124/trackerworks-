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
  }

  const fetchGoals = async () => {
    setLoading(true)
    setError(null)

    // Prefer Notion; if fails, fall back to local
    try {
      const res = await fetch(`/api/goals?date=${dateStr}`)
      if (!res.ok) throw new Error("Failed to load goals from Notion")
      const data: GoalsResponse = await res.json()

      const filled: GoalsResponse = {
        date: data.date,
        weeklyGoal: data.weeklyGoal || "",
        goals: [data.goals?.[0] || "", data.goals?.[1] || "", data.goals?.[2] || ""],
        pageId: data.pageId,
        source: "notion",
      }
      setWeeklyGoal(filled.weeklyGoal)
      setGoals(filled.goals)
      setSource("notion")

      // Persist a snapshot so UI still has something offline
      saveToLocal(filled)
    } catch (e: any) {
      const local = loadFromLocal()
      if (local) {
        setWeeklyGoal(local.weeklyGoal || "")
        setGoals([local.goals?.[0] || "", local.goals?.[1] || "", local.goals?.[2] || ""])
        setSource("local")
      } else {
        // empty state: let user type manually
        setWeeklyGoal("")
        setGoals(["", "", ""]) 
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
    }
    saveToLocal(snapshot)
  }, [weeklyGoal, goals, dateStr, source, loading])

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
    const next = [...goals]
    next[pickerOpenFor] = title
    setGoals(next)
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

        {/* Weekly Goal */}
        <div className="mb-4">
          <div className={labelCls}>Weekly Goal</div>
          <Input
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(e.target.value)}
            placeholder="What's the big outcome this week?"
            className="mt-1 bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500"
          />
        </div>

        {/* Three Goals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <div className={labelCls}>Goal {i + 1}</div>
              <Input
                value={goals[i]}
                onChange={(e) => {
                  const copy = [...goals]
                  copy[i] = e.target.value
                  setGoals(copy)
                }}
                placeholder={`Set Goal ${i + 1}`}
                className="bg-white/40 border-white/40 text-zinc-800 placeholder:text-zinc-500"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/30 border-white/40 text-zinc-700 hover:bg-white/50 flex items-center gap-2"
                  onClick={() => openPicker(i)}
                >
                  <Database className="h-3 w-3" /> Pick from Task Calendar
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
              <Database className="h-5 w-5" /> Select Task for Goal {pickerOpenFor !== null ? pickerOpenFor + 1 : ""}
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
    </div>
  )
}
