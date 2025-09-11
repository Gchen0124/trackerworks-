"use client"

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, ChevronRight, ChevronDown, RefreshCw } from "lucide-react"
import confetti from 'canvas-confetti'

// Minimal breakdown item shape we use in the UI
interface ItemRow {
  id: string
  title: string
  order_index?: number
  is_completed?: boolean
  depth_level?: number
  priority?: number
}

type GoalKey = "goal1" | "goal2" | "goal3"

interface NestedTodosPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function NestedTodosPanel({ open, onOpenChange }: NestedTodosPanelProps) {
  const [goals, setGoals] = useState<string[]>(["", "", ""]) // [goal1, goal2, goal3]
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tree, setTree] = useState<Record<string, ItemRow[]>>({}) // key = `${goalKey}|${parentId||"root"}`
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [notes, setNotes] = useState<string>("")
  const [notesSaving, setNotesSaving] = useState(false)
  // Track pending edits to prevent data loss
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({}) // id -> title
  // Track which goals are expanded/collapsed
  const [goalExpanded, setGoalExpanded] = useState<Record<string, boolean>>({
    goal1: true,
    goal2: true, 
    goal3: true
  })

  // Local done state persisted in localStorage
  const STORAGE_KEY = "nestedTodosDone:v1"
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({})

  // YYYY-MM-DD based on local time
  const dateStr = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = (now.getMonth() + 1).toString().padStart(2, "0")
    const d = now.getDate().toString().padStart(2, "0")
    return `${y}-${m}-${d}`
  }, [])

  const goalIdFor = useCallback((goalKey: GoalKey) => `${dateStr}#${goalKey}` as const, [dateStr])
  const keyFor = useCallback((goalKey: GoalKey, parentId: string | null) => `${goalKey}|${parentId || "root"}`, [])

  // Load/save done states
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const data = JSON.parse(raw)
        if (data && typeof data === 'object') setDoneMap(data)
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(doneMap))
    } catch {}
  }, [doneMap])

  // Confetti celebration function
  const celebrateTaskCompletion = useCallback((element?: Element | null, isGoalCompletion: boolean = false) => {
    if (typeof window === 'undefined') return
    
    // Play applause sound
    try {
      const soundFile = isGoalCompletion ? '/goal-celebration.mp3' : '/applause.mp3'
      const audio = new Audio(soundFile)
      audio.volume = isGoalCompletion ? 0.5 : 0.3
      audio.play().catch(() => {
        // Fallback to using Web Audio API to generate celebration sound
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        
        if (isGoalCompletion) {
          // Bigger, more delightful sound for goal completion
          const playNote = (frequency: number, startTime: number, duration: number, volume: number = 0.15) => {
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()
            
            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)
            
            oscillator.frequency.setValueAtTime(frequency, startTime)
            oscillator.type = 'sine'
            
            gainNode.gain.setValueAtTime(0, startTime)
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01)
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
            
            oscillator.start(startTime)
            oscillator.stop(startTime + duration)
          }
          
          const currentTime = audioContext.currentTime
          
          // Victory fanfare: C-E-G-C (major chord) ascending
          playNote(523, currentTime, 0.3, 0.2) // C5
          playNote(659, currentTime + 0.1, 0.3, 0.18) // E5
          playNote(784, currentTime + 0.2, 0.3, 0.16) // G5
          playNote(1047, currentTime + 0.3, 0.5, 0.2) // C6 (octave)
          
          // Add harmony
          playNote(330, currentTime + 0.1, 0.4, 0.1) // E4
          playNote(392, currentTime + 0.2, 0.4, 0.1) // G4
          playNote(523, currentTime + 0.3, 0.6, 0.12) // C5
          
          // Triumphant ending chord
          setTimeout(() => {
            const endTime = audioContext.currentTime
            playNote(523, endTime, 0.8, 0.15) // C5
            playNote(659, endTime, 0.8, 0.15) // E5
            playNote(784, endTime, 0.8, 0.15) // G5
            playNote(1047, endTime, 0.8, 0.18) // C6
          }, 600)
          
        } else {
          // Simple celebration sound for individual tasks
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()
          
          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)
          
          oscillator.frequency.setValueAtTime(523, audioContext.currentTime) // C5
          oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1) // E5
          oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2) // G5
          
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
          
          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + 0.5)
        }
      })
    } catch (e) {
      console.log('Audio not supported')
    }
    
    if (isGoalCompletion) {
      // Two-sided dramatic confetti for goal completion
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']
      
      // Left side confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.2, y: 0.6 },
        colors,
        scalar: 1.2,
        gravity: 0.8,
        drift: 0.2,
        ticks: 200
      })
      
      // Right side confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.8, y: 0.6 },
        colors,
        scalar: 1.2,
        gravity: 0.8,
        drift: -0.2,
        ticks: 200
      })
      
      // Center burst for extra celebration
      confetti({
        particleCount: 50,
        spread: 90,
        origin: { x: 0.5, y: 0.4 },
        colors,
        scalar: 1.0,
        gravity: 1.0,
        drift: 0,
        ticks: 150
      })
    } else {
      // Regular single-point confetti for individual tasks
      // Get the position of the checkbox/task element for targeted confetti
      let rect = { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 }
      if (element) {
        rect = element.getBoundingClientRect()
      }
      
      const x = (rect.left + rect.width / 2) / window.innerWidth
      const y = (rect.top + rect.height / 2) / window.innerHeight

      // Small burst confetti effect
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { x, y },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        scalar: 0.8,
        gravity: 1.2,
        drift: 0,
        ticks: 120
      })
    }
  }, [])

  const isChecked = useCallback((item: ItemRow) => Boolean(item.is_completed), [])
  const setChecked = useCallback(async (id: string, checked: boolean, element?: Element | null) => {
    // Update database
    try {
      const res = await fetch('/api/local/breakdown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id, is_completed: checked }] })
      })
      if (!res.ok) throw new Error('Failed to update completion status')
      
      // Trigger confetti celebration when marking as complete
      if (checked) {
        celebrateTaskCompletion(element, false) // Individual task completion
      }
      
      // Update local state optimistically
      setTree(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(key => {
          updated[key] = updated[key].map(item => 
            item.id === id ? { ...item, is_completed: checked } : item
          )
        })
        return updated
      })
    } catch (e) {
      console.error('Failed to update task completion:', e)
    }
  }, [celebrateTaskCompletion])

  // Load today's goals
  const loadGoals = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      qs.set("date", dateStr)
      const res = await fetch(`/api/local/goals?${qs.toString()}`)
      if (!res.ok) throw new Error("failed_goals")
      const data = await res.json()
      const arr: string[] = Array.isArray(data?.goals) ? data.goals : ["", "", ""]
      setGoals([arr[0] || "", arr[1] || "", arr[2] || ""])
    } catch (e) {
      // keep previous
    }
  }, [dateStr])

  // Load today's notes, fallback to most recent previous note if empty
  const loadNotes = useCallback(async () => {
    try {
      // First try to load today's notes
      const qs = new URLSearchParams()
      qs.set("date", dateStr)
      const res = await fetch(`/api/local/notes?${qs.toString()}`)
      if (!res.ok) throw new Error("failed_notes")
      const data = await res.json()
      
      // If today's notes are empty, try to load the most recent previous note
      if (!data?.content || data.content.trim() === "") {
        try {
          const prevRes = await fetch(`/api/local/notes/latest`)
          if (prevRes.ok) {
            const prevData = await prevRes.json()
            if (prevData?.content && prevData.content.trim() !== "") {
              setNotes(prevData.content)
              return
            }
          }
        } catch (e) {
          console.warn("Failed to load previous note:", e)
        }
      }
      
      setNotes(data?.content || "")
    } catch (e) {
      console.warn("Failed to load notes:", e)
    }
  }, [dateStr])

  // Save notes with debouncing
  const saveNotes = useCallback(async (content: string) => {
    setNotesSaving(true)
    try {
      const res = await fetch('/api/local/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, content })
      })
      if (!res.ok) throw new Error("failed_save_notes")
    } catch (e) {
      console.warn("Failed to save notes:", e)
    } finally {
      setNotesSaving(false)
    }
  }, [dateStr])

  // Debounced save for notes
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveNotes(notes) // Save all notes, including empty ones to clear previous content
    }, 1000) // Save 1 second after user stops typing
    
    return () => clearTimeout(timeout)
  }, [notes, saveNotes])

  useEffect(() => {
    if (!open) return
    loadGoals()
    loadNotes()
  }, [open, loadGoals, loadNotes, refreshKey])

  // Sync goal labels live when DailyGoals broadcasts updates
  useEffect(() => {
    const onDailyGoalsUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { goals?: string[] }
        if (detail?.goals && Array.isArray(detail.goals)) {
          setGoals([detail.goals[0] || "", detail.goals[1] || "", detail.goals[2] || ""])
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
      }
    }
  }, [])

  // Save pending edits when clicking away from the panel
  const savePendingEdits = useCallback(async () => {
    const pendingUpdates = Object.entries(pendingEdits).map(([id, title]) => ({ id, title }))
    if (pendingUpdates.length > 0) {
      try {
        await fetch('/api/local/breakdown', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: pendingUpdates })
        })
        // Update tree state immediately
        setTree(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(key => {
            updated[key] = updated[key].map(item => {
              const pendingTitle = pendingEdits[item.id]
              return pendingTitle ? { ...item, title: pendingTitle } : item
            })
          })
          return updated
        })
        setPendingEdits({}) // Clear pending edits after saving
      } catch (e) {
        console.error('Failed to save pending edits:', e)
      }
    }
  }, [pendingEdits, setTree])

  // Save pending edits when panel is closed
  useEffect(() => {
    if (!open && Object.keys(pendingEdits).length > 0) {
      savePendingEdits()
    }
  }, [open, pendingEdits, savePendingEdits])
  useEffect(() => {
    const onDailyGoalsUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { goals?: string[] }
        if (detail?.goals && Array.isArray(detail.goals)) {
          setGoals([detail.goals[0] || "", detail.goals[1] || "", detail.goals[2] || ""])
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
      }
    }
  }, [])

  // Load list for a goal + parent
  const loadList = useCallback(async (goalKey: GoalKey, parentId: string | null) => {
    const k = keyFor(goalKey, parentId)
    setLoading(prev => ({ ...prev, [k]: true }))
    try {
      const qs = new URLSearchParams()
      qs.set("goalId", goalIdFor(goalKey))
      if (parentId) qs.set("parentId", parentId)
      qs.set("scopeType", "task")
      const res = await fetch(`/api/local/breakdown?${qs.toString()}`)
      if (!res.ok) throw new Error("load_list_failed")
      const data = await res.json()
      const rows: ItemRow[] = (data?.items || []).map((r: any, i: number) => ({ 
        id: r.id, 
        title: r.title || "", 
        order_index: r.order_index ?? i,
        is_completed: Boolean(r.is_completed),
        depth_level: r.depth_level ?? 0,
        priority: r.priority ?? 1
      }))
      setTree(prev => ({ ...prev, [k]: rows }))
    } catch (e) {
      // keep previous
    } finally {
      setLoading(prev => ({ ...prev, [k]: false }))
    }
  }, [goalIdFor, keyFor])

  // Save children for a parent list
  const saveChildren = useCallback(async (goalKey: GoalKey, parentId: string | null, items: Array<{ id?: string; title: string; order_index?: number }>) => {
    const body = { goalId: goalIdFor(goalKey), parentId: parentId ?? undefined, scopeType: 'task' as const, items }
    const res = await fetch('/api/local/breakdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error('save_failed')
  }, [goalIdFor])

  const updateTitle = useCallback(async (id: string, title: string) => {
    const res = await fetch('/api/local/breakdown', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id, title }] }) })
    if (!res.ok) throw new Error('rename_failed')
  }, [])

  const deleteItem = useCallback(async (id: string) => {
    const res = await fetch('/api/local/breakdown', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
    if (!res.ok) throw new Error('delete_failed')
  }, [])

  // Load root lists when panel opens or when goals are expanded
  useEffect(() => {
    if (!open) return
    ;(['goal1','goal2','goal3'] as GoalKey[]).forEach((gk) => {
      if (goalExpanded[gk]) {
        loadList(gk, null)
      }
    })
  }, [open, loadList, refreshKey, goalExpanded])

  // Helpers
  const labelForIndex = (i: number) => goals[i] || `Goal ${i + 1}`
  const goalKeyForIndex = (i: number) => (i === 0 ? 'goal1' : i === 1 ? 'goal2' : 'goal3') as GoalKey

  const aggregateForKey = (goalKey: GoalKey) => {
    const items = tree[keyFor(goalKey, null)] || []
    if (items.length === 0) return { all: false, none: true, some: false }
    const cnt = items.reduce((acc, it) => acc + (it.is_completed ? 1 : 0), 0)
    const all = cnt === items.length
    const none = cnt === 0
    const some = !all && !none
    return { all, none, some }
  }

  // Find the next unfinished goal and task for highlighting
  const getNextUnfinishedItems = useMemo(() => {
    const goalKeys: GoalKey[] = ['goal1', 'goal2', 'goal3']
    let nextGoal: GoalKey | null = null
    let nextTask: { goalKey: GoalKey; taskId: string } | null = null

    for (const goalKey of goalKeys) {
      const agg = aggregateForKey(goalKey)
      
      // Find first unfinished goal
      if (!nextGoal && !agg.all) {
        nextGoal = goalKey
      }

      // Find first unfinished task in this goal
      if (!nextTask) {
        const items = tree[keyFor(goalKey, null)] || []
        const firstUnfinishedTask = items.find(item => !item.is_completed)
        if (firstUnfinishedTask) {
          nextTask = { goalKey, taskId: firstUnfinishedTask.id }
        }
      }

      // Break if we found both
      if (nextGoal && nextTask) break
    }

    return { nextGoal, nextTask }
  }, [tree, keyFor])

  const toggleGoal = async (goalKey: GoalKey, value: boolean, element?: Element | null) => {
    const items = tree[keyFor(goalKey, null)] || []
    try {
      // Update all items in this goal
      const updates = items.map(item => ({ id: item.id, is_completed: value }))
      const res = await fetch('/api/local/breakdown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates })
      })
      if (!res.ok) throw new Error('Failed to update goal completion status')
      
      // Trigger confetti celebration when marking goal as complete
      if (value) {
        celebrateTaskCompletion(element, true) // Goal completion with dramatic effect
      }
      
      // Reload the list to get fresh data
      await loadList(goalKey, null)
    } catch (e) {
      console.error('Failed to toggle goal completion:', e)
    }
  }

  const toggleGoalExpansion = (goalKey: GoalKey) => {
    setGoalExpanded(prev => {
      const newExpanded = { ...prev, [goalKey]: !prev[goalKey] }
      // If expanding, load the tasks for this goal
      if (newExpanded[goalKey]) {
        loadList(goalKey, null)
      }
      return newExpanded
    })
  }

  return (
    <div className={"fixed inset-y-0 left-0 w-80 bg-zinc-950 text-zinc-100 border-r border-zinc-800 p-0 " + (!open ? "hidden" : "")}>
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <div className="text-zinc-100 font-semibold">Todos</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-zinc-300 hover:text-white" onClick={() => setRefreshKey(k => k + 1)} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {onOpenChange && (
              <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => onOpenChange(false)} title="Hide">
                Hide
              </Button>
            )}
          </div>
        </div>

        {/* Notes area */}
        <div className="px-3 py-2 border-b border-zinc-900/60">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-300">Daily Notes</div>
              {notesSaving && <div className="text-xs text-zinc-500">Saving...</div>}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your notes for today..."
              className="h-20 resize-none bg-zinc-900/40 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-sm overflow-y-auto"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {([0,1,2] as const).map((index) => {
            const goalKey = goalKeyForIndex(index)
            const agg = aggregateForKey(goalKey)
            const goalChecked: boolean | 'indeterminate' = agg.some ? 'indeterminate' : agg.all
            const isNextGoal = getNextUnfinishedItems.nextGoal === goalKey

            return (
              <div 
                key={index} 
                className={`rounded-lg border border-zinc-800 bg-zinc-950/60 ${
                  isNextGoal ? 'next-goal-highlight' : ''
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={goalChecked as any}
                      onCheckedChange={(v) => {
                        const checkbox = document.activeElement as Element
                        toggleGoal(goalKey, Boolean(v), checkbox)
                      }}
                      className={`border-zinc-400 bg-transparent rounded-md data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=indeterminate]:bg-zinc-700 data-[state=indeterminate]:border-zinc-400 ${
                        isNextGoal ? 'next-task-checkbox' : ''
                      }`}
                    />
                    <div className="font-medium text-zinc-100 truncate" title={labelForIndex(index)}>{labelForIndex(index)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-zinc-200" onClick={() => setRefreshKey(k => k + 1)} title="Refresh">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="text-zinc-300 hover:text-white" 
                      onClick={() => toggleGoalExpansion(goalKey)}
                      title={goalExpanded[goalKey] ? "Hide tasks" : "Show tasks"}
                    >
                      {goalExpanded[goalKey] ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {goalExpanded[goalKey] && (
                  <div className="px-3 py-2">
                    <List
                      goalKey={goalKey}
                      parentId={null}
                      keyFor={keyFor}
                      tree={tree}
                      setTree={setTree}
                      loading={loading}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      loadList={loadList}
                      saveChildren={saveChildren}
                      updateTitle={updateTitle}
                      deleteItem={deleteItem}
                      isChecked={isChecked}
                      setChecked={setChecked}
                      pendingEdits={pendingEdits}
                      setPendingEdits={setPendingEdits}
                      nextTask={getNextUnfinishedItems.nextTask}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function List({
  goalKey,
  parentId,
  keyFor,
  tree,
  setTree,
  loading,
  expanded,
  setExpanded,
  loadList,
  saveChildren,
  updateTitle,
  deleteItem,
  isChecked,
  setChecked,
  pendingEdits,
  setPendingEdits,
  nextTask,
}: {
  goalKey: GoalKey
  parentId: string | null
  keyFor: (goalKey: GoalKey, parentId: string | null) => string
  tree: Record<string, ItemRow[]>
  setTree: React.Dispatch<React.SetStateAction<Record<string, ItemRow[]>>>
  loading: Record<string, boolean>
  expanded: Record<string, boolean>
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  loadList: (goalKey: GoalKey, parentId: string | null) => Promise<void>
  saveChildren: (goalKey: GoalKey, parentId: string | null, items: Array<{ id?: string; title: string; order_index?: number }>) => Promise<void>
  updateTitle: (id: string, title: string) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  isChecked: (item: ItemRow) => boolean
  setChecked: (id: string, v: boolean, element?: Element | null) => Promise<void>
  pendingEdits: Record<string, string>
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  nextTask?: { goalKey: GoalKey; taskId: string } | null
}) {
  const listKey = keyFor(goalKey, parentId)
  const items = tree[listKey]
  const isLoading = !!loading[listKey]

  useEffect(() => {
    if (!items && !isLoading) loadList(goalKey, parentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  const onAdd = async () => {
    // Save any pending edits first
    const pendingUpdates = Object.entries(pendingEdits).map(([id, title]) => ({ id, title }))
    if (pendingUpdates.length > 0) {
      try {
        await fetch('/api/local/breakdown', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: pendingUpdates })
        })
        setPendingEdits({}) // Clear pending edits after saving
      } catch (e) {
        console.error('Failed to save pending edits:', e)
      }
    }
    
    // Get fresh data from the tree (includes both saved and pending edits)
    const currentItems = tree[keyFor(goalKey, parentId)] || []
    // Merge in any pending edits to get the most current state
    const itemsWithPendingEdits = currentItems.map(item => ({
      ...item,
      title: pendingEdits[item.id] || item.title
    }))
    
    try {
      await saveChildren(goalKey, parentId, [...itemsWithPendingEdits, { 
        title: parentId ? "New subtask" : "New task", 
        order_index: itemsWithPendingEdits.length 
      }])
    } finally {
      loadList(goalKey, parentId)
    }
  }

  const onDeleteHere = async (id: string) => {
    try { await deleteItem(id) } finally { loadList(goalKey, parentId) }
  }

  return (
    <div className={parentId ? "ml-4 pl-3 border-l border-zinc-800 space-y-1" : "space-y-1"}>
      <div className="flex items-center justify-between py-1">
        <div className="text-xs text-zinc-400">{parentId ? "Subtasks" : "Tasks"}</div>
        <Button size="sm" variant="ghost" onClick={onAdd} className="text-zinc-300 hover:text-white">
          <Plus className="w-4 h-4 mr-1" /> Add {parentId ? "subtask" : "task"}
        </Button>
      </div>
      {isLoading && <div className="text-xs text-zinc-400 py-2">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="text-xs text-zinc-500 italic py-2">No items yet.</div>
      )}
      {!isLoading && (items || []).map((it, index) => (
        <div key={it.id} className="relative">
          {/* Vertical connector between tasks at same level when not expanded */}
          {index > 0 && !expanded[it.id] && (
            <div className="absolute -top-6 left-20 w-px h-8 bg-zinc-500"></div>
          )}
          <TreeNode
            item={it}
            expanded={!!expanded[it.id]}
            onExpand={(id) => {
              setExpanded(e => ({ ...e, [id]: !e[id] }))
              const willOpen = !expanded[it.id]
              if (willOpen) loadList(goalKey, it.id)
            }}
            onRename={updateTitle}
            onDelete={onDeleteHere}
            isChecked={isChecked}
            setChecked={setChecked}
            pendingEdits={pendingEdits}
            setPendingEdits={setPendingEdits}
            setTree={setTree}
            isNextTask={nextTask?.goalKey === goalKey && nextTask?.taskId === it.id}
          >
            {expanded[it.id] && (
              <List
                goalKey={goalKey}
                parentId={it.id}
                keyFor={keyFor}
                tree={tree}
                setTree={setTree}
                loading={loading}
                expanded={expanded}
                setExpanded={setExpanded}
                loadList={loadList}
                saveChildren={saveChildren}
                updateTitle={updateTitle}
                deleteItem={deleteItem}
                isChecked={isChecked}
                setChecked={setChecked}
                pendingEdits={pendingEdits}
                setPendingEdits={setPendingEdits}
                nextTask={nextTask}
              />
            )}
          </TreeNode>
        </div>
      ))}
    </div>
  )
}

function TreeNode({ item, expanded, onExpand, onRename, onDelete, isChecked, setChecked, pendingEdits, setPendingEdits, setTree, isNextTask, children }: {
  item: ItemRow
  expanded: boolean
  onExpand: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  isChecked: (item: ItemRow) => boolean
  setChecked: (id: string, v: boolean, element?: Element | null) => Promise<void>
  pendingEdits: Record<string, string>
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setTree: React.Dispatch<React.SetStateAction<Record<string, ItemRow[]>>>
  isNextTask?: boolean
  children?: React.ReactNode
}) {
  // Use pending edit if available, otherwise use item title
  const [title, setTitle] = useState(pendingEdits[item.id] || item.title)
  const [inputSaving, setInputSaving] = useState(false)

  // Update title when item changes, but only if no pending edit exists
  useEffect(() => {
    if (!pendingEdits[item.id]) {
      setTitle(item.title)
    }
  }, [item.title, pendingEdits, item.id])

  const commit = async () => {
    const next = title.trim()
    if (next === item.title.trim()) {
      // Remove from pending if it matches saved value
      setPendingEdits(prev => {
        const updated = { ...prev }
        delete updated[item.id]
        return updated
      })
      return
    }
    try {
      setInputSaving(true)
      await onRename(item.id, next)
      // Remove from pending edits after successful save
      setPendingEdits(prev => {
        const updated = { ...prev }
        delete updated[item.id]
        return updated
      })
      
      // Update the tree state immediately to reflect the change
      setTree(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(key => {
          updated[key] = updated[key].map(treeItem => 
            treeItem.id === item.id ? { ...treeItem, title: next } : treeItem
          )
        })
        return updated
      })
    } catch (e) {
      console.error('Failed to save task title:', e)
    } finally {
      setInputSaving(false)
    }
  }

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    // Track as pending edit
    setPendingEdits(prev => ({ ...prev, [item.id]: newTitle }))
  }

  const checked = isChecked(item)

  return (
    <div className={`group rounded-md hover:bg-zinc-900/50 px-2 py-1 relative ${
      isNextTask && !checked && expanded && children ? 'next-task-highlight' : ''
    }`}>
      <div className="flex items-start gap-2">
        <button onClick={() => onExpand(item.id)} className="mt-1 text-zinc-400 hover:text-zinc-200">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Checkbox
          checked={checked as any}
          onCheckedChange={(v) => {
            const checkbox = document.activeElement as Element
            setChecked(item.id, Boolean(v), checkbox)
          }}
          className={`mt-1 border-zinc-400 bg-transparent rounded-md data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 ${
            isNextTask && !checked ? 'next-task-checkbox' : ''
          }`}
        />
        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { 
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur() // This will trigger the commit
              }
            }}
            className={`h-6 bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-sm ${
              isNextTask && !checked ? 'next-task-highlight' : ''
            }`}
            placeholder="Untitled"
          />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-red-400" onClick={() => onDelete(item.id)} title="Delete">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 mt-0 relative">
          {children}
        </div>
      )}
      {inputSaving && <div className="pl-8 text-[10px] text-zinc-500">Saving…</div>}
    </div>
  )
}