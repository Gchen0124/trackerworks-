"use client"

import React, { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from "react"
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
  source?: "local" | "notion" // Track if item is from Notion
  notionStatus?: string // Original Notion status name
  hasSubitems?: boolean // Track if item has subitems
}

type GoalKey = "goal1" | "goal2" | "goal3"

// Notion goal IDs (Task Calendar page IDs for Goal 1, 2, 3)
interface NotionGoalIds {
  goal1: string | null
  goal2: string | null
  goal3: string | null
}

interface NestedTodosPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function NestedTodosPanel({ open, onOpenChange }: NestedTodosPanelProps) {
  const [goals, setGoals] = useState<string[]>(["", "", ""]) // [goal1, goal2, goal3]
  const [notionGoalIds, setNotionGoalIds] = useState<NotionGoalIds>({ goal1: null, goal2: null, goal3: null })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tree, setTree] = useState<Record<string, ItemRow[]>>({}) // key = `${goalKey}|${parentId||"root"}`
  const treeRef = useRef<Record<string, ItemRow[]>>({}) // ref to avoid stale closure issues

  // Keep treeRef in sync with tree state
  useEffect(() => {
    treeRef.current = tree
  }, [tree])
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
  // Track Notion sync state
  const [notionSyncing, setNotionSyncing] = useState<Record<string, boolean>>({})

  // Local done state persisted in localStorage
  const STORAGE_KEY = "nestedTodosDone:v1"
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({})

  // YYYY-MM-DD based on local time - updates at midnight
  const getDateStr = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = (now.getMonth() + 1).toString().padStart(2, "0")
    const d = now.getDate().toString().padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  const [dateStr, setDateStr] = useState(getDateStr)

  // Check for date change every 60 seconds (handles midnight transition)
  useEffect(() => {
    const checkDateChange = () => {
      const currentDate = getDateStr()
      if (currentDate !== dateStr) {
        console.log(`[NestedTodosPanel] Date changed from ${dateStr} to ${currentDate}`)
        setDateStr(currentDate)
        // Clear all tree data to reload fresh for new date
        setTree({})
        setNotionGoalIds({ goal1: null, goal2: null, goal3: null })
        setGoals(["", "", ""])
        setNotes("")
        // Increment refresh key to trigger reload
        setRefreshKey(k => k + 1)
      }
    }

    // Check immediately
    checkDateChange()

    // Then check every 60 seconds
    const intervalId = setInterval(checkDateChange, 60000)

    return () => clearInterval(intervalId)
  }, [dateStr])

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
  const setChecked = useCallback(async (id: string, checked: boolean, element?: Element | null, item?: ItemRow, goalKey?: GoalKey) => {
    // Update local state optimistically first
    setTree(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(key => {
        updated[key] = updated[key].map(treeItem =>
          treeItem.id === id ? { ...treeItem, is_completed: checked } : treeItem
        )
      })
      return updated
    })

    // Trigger confetti celebration when marking as complete
    if (checked) {
      celebrateTaskCompletion(element, false) // Individual task completion
    }

    // Determine if this is a Notion item or local item
    const isNotionItem = item?.source === "notion"

    try {
      if (isNotionItem) {
        // Update status in Notion
        // Map: unchecked = "not_started", checked = "done"
        setNotionSyncing(prev => ({ ...prev, [id]: true }))
        const notionRes = await fetch('/api/notion/task-calendar/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: id,
            status: checked ? "done" : "not_started"
          })
        })
        if (!notionRes.ok) {
          console.error('Failed to update Notion task status')
        }
        setNotionSyncing(prev => ({ ...prev, [id]: false }))

        // If checking a subtask, also update parent goal status to "in_progress"
        // (only if it's not already done or in progress)
        if (checked && goalKey) {
          const parentGoalId = notionGoalIds[goalKey]
          if (parentGoalId) {
            // Update parent goal to "in_progress" since at least one subtask is being worked on
            const parentRes = await fetch('/api/notion/task-calendar/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: parentGoalId,
                status: "in_progress"
              })
            })
            if (!parentRes.ok) {
              console.error('Failed to update parent goal status to in_progress')
            }
          }
        }
      } else {
        // Update local database
        const res = await fetch('/api/local/breakdown', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id, is_completed: checked }] })
        })
        if (!res.ok) throw new Error('Failed to update completion status')
      }
    } catch (e) {
      console.error('Failed to update task completion:', e)
      // Revert optimistic update on error
      setTree(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(key => {
          updated[key] = updated[key].map(treeItem =>
            treeItem.id === id ? { ...treeItem, is_completed: !checked } : treeItem
          )
        })
        return updated
      })
    }
  }, [celebrateTaskCompletion, notionGoalIds])

  // Load today's goals (including Notion goal IDs for fetching subtasks)
  const loadGoals = useCallback(async () => {
    try {
      // First try to get goals from Notion (which includes goalIds)
      try {
        const notionRes = await fetch(`/api/goals?date=${dateStr}`)
        if (notionRes.ok) {
          const notionData = await notionRes.json()
          console.log('[NestedTodosPanel] Loaded goals from Notion:', notionData)
          if (notionData?.goalIds) {
            console.log('[NestedTodosPanel] Setting notionGoalIds:', notionData.goalIds)
            setNotionGoalIds({
              goal1: notionData.goalIds[0] || null,
              goal2: notionData.goalIds[1] || null,
              goal3: notionData.goalIds[2] || null,
            })
          }
          if (notionData?.goals) {
            setGoals([notionData.goals[0] || "", notionData.goals[1] || "", notionData.goals[2] || ""])
            return // Use Notion data
          }
        }
      } catch (notionErr) {
        console.warn("Failed to fetch goals from Notion:", notionErr)
      }

      // Fallback to local goals
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
        const detail = (e as CustomEvent).detail as { goals?: string[]; goalIds?: (string | null)[] }
        if (detail?.goals && Array.isArray(detail.goals)) {
          setGoals([detail.goals[0] || "", detail.goals[1] || "", detail.goals[2] || ""])
        }
        // Also update goalIds if available (for Notion sync)
        if (detail?.goalIds && Array.isArray(detail.goalIds)) {
          setNotionGoalIds({
            goal1: detail.goalIds[0] || null,
            goal2: detail.goalIds[1] || null,
            goal3: detail.goalIds[2] || null,
          })
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

  // Load list for a goal + parent (now supports Notion subitems)
  const loadList = useCallback(async (goalKey: GoalKey, parentId: string | null) => {
    const k = keyFor(goalKey, parentId)
    setLoading(prev => ({ ...prev, [k]: true }))

    try {
      // Get the Notion goal ID for this goal
      const notionGoalId = notionGoalIds[goalKey]
      console.log(`[loadList] Loading ${goalKey}, parentId:${parentId}, notionGoalId:${notionGoalId}`)

      // If we have a Notion goal ID and this is the root level (parentId is null),
      // fetch subitems from Notion first
      if (notionGoalId && parentId === null) {
        try {
          console.log(`[loadList] Fetching Notion subitems for ${goalKey} from parent ${notionGoalId}`)
          const notionRes = await fetch(`/api/notion/task-calendar/subitems?parentId=${notionGoalId}`)
          if (notionRes.ok) {
            const notionData = await notionRes.json()
            console.log(`[loadList] Got ${notionData?.items?.length || 0} subitems for ${goalKey}:`, notionData)
            // Even if items is empty, set it - don't fall through to local
            // This shows "No items yet" when the Notion task has no subitems
            const rows: ItemRow[] = (notionData?.items || []).map((r: any, i: number) => ({
              id: r.id,
              title: r.title || "",
              order_index: i,
              is_completed: r.status === "done",
              depth_level: 0,
              priority: 1,
              source: "notion" as const,
              notionStatus: r.notionStatus,
              hasSubitems: r.hasSubitems,
            }))
            setTree(prev => ({ ...prev, [k]: rows }))
            setLoading(prev => ({ ...prev, [k]: false }))
            return // Use Notion data (even if empty)
          } else {
            console.error(`[loadList] Failed to fetch subitems for ${goalKey}, status:`, notionRes.status)
          }
        } catch (notionErr) {
          console.warn(`[loadList] Error fetching subitems for ${goalKey}:`, notionErr)
          // Fall through to local on error
        }
      } else {
        console.log(`[loadList] No Notion goal ID for ${goalKey} or not root level, using local data`)
      }

      // If parentId is a Notion ID (from Notion subitems), fetch its children from Notion
      if (parentId && treeRef.current[keyFor(goalKey, null)]?.some(item => item.id === parentId && item.source === "notion")) {
        try {
          const notionRes = await fetch(`/api/notion/task-calendar/subitems?parentId=${parentId}`)
          if (notionRes.ok) {
            const notionData = await notionRes.json()
            // Even if empty, set the tree and return
            const rows: ItemRow[] = (notionData?.items || []).map((r: any, i: number) => ({
              id: r.id,
              title: r.title || "",
              order_index: i,
              is_completed: r.status === "done",
              depth_level: 1,
              priority: 1,
              source: "notion" as const,
              notionStatus: r.notionStatus,
              hasSubitems: r.hasSubitems,
            }))
            setTree(prev => ({ ...prev, [k]: rows }))
            setLoading(prev => ({ ...prev, [k]: false }))
            return // Use Notion data (even if empty)
          }
        } catch (notionErr) {
          console.warn("Failed to fetch nested subitems from Notion:", notionErr)
          // Fall through to local on error
        }
      }

      // Fallback to local breakdown items (only if Notion was not used or failed)
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
        priority: r.priority ?? 1,
        source: "local" as const,
      }))
      setTree(prev => ({ ...prev, [k]: rows }))
    } catch (e) {
      // On error, set empty array to stop loading indicator
      setTree(prev => ({ ...prev, [k]: prev[k] || [] }))
    } finally {
      setLoading(prev => ({ ...prev, [k]: false }))
    }
  }, [goalIdFor, keyFor, notionGoalIds])

  // Helper to check if a parentId is a Notion task (not a local item)
  // Notion IDs are UUIDs, local IDs are typically shorter or have different format
  const isNotionId = useCallback((id: string | null): boolean => {
    if (!id) return false
    // Notion UUIDs are 32 hex chars (with or without dashes)
    // e.g., "2bdd6707-fb13-8175-b6f3-e15a48a367f1" or "2bdd6707fb138175b6f3e15a48a367f1"
    const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
    return uuidPattern.test(id)
  }, [])

  // Get the effective parent ID for Notion operations
  // For root level items under a goal, use the notionGoalId as parent
  const getNotionParentId = useCallback((goalKey: GoalKey, parentId: string | null): string | null => {
    if (parentId) return parentId // If we have a parentId, use it
    return notionGoalIds[goalKey] // Otherwise use the goal's Notion task ID
  }, [notionGoalIds])

  // Create a new subtask - uses Notion API if parent is a Notion task
  const createSubtask = useCallback(async (goalKey: GoalKey, parentId: string | null, title: string): Promise<{ id: string } | null> => {
    const notionParentId = getNotionParentId(goalKey, parentId)

    console.log('[createSubtask] goalKey:', goalKey, 'parentId:', parentId)
    console.log('[createSubtask] notionParentId:', notionParentId)
    console.log('[createSubtask] isNotionId:', notionParentId ? isNotionId(notionParentId) : false)

    if (notionParentId && isNotionId(notionParentId)) {
      // Create in Notion
      console.log('[createSubtask] Calling Notion API to create subtask...')
      const res = await fetch('/api/notion/task-calendar/subitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: notionParentId, title })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[createSubtask] Failed to create subtask:', errorData)
        throw new Error('Failed to create subtask in Notion')
      }
      const data = await res.json()
      console.log('[createSubtask] Subtask created successfully:', data)
      return { id: data.item?.id }
    } else {
      // Create locally
      console.log('[createSubtask] Creating locally...')
      const body = {
        goalId: goalIdFor(goalKey),
        parentId: parentId ?? undefined,
        scopeType: 'task' as const,
        items: [{ title, order_index: 0 }]
      }
      const res = await fetch('/api/local/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('save_failed')
      return null
    }
  }, [goalIdFor, getNotionParentId, isNotionId])

  // Save children for a parent list (local only - for backwards compatibility)
  const saveChildren = useCallback(async (goalKey: GoalKey, parentId: string | null, items: Array<{ id?: string; title: string; order_index?: number }>) => {
    const body = { goalId: goalIdFor(goalKey), parentId: parentId ?? undefined, scopeType: 'task' as const, items }
    const res = await fetch('/api/local/breakdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error('save_failed')
  }, [goalIdFor])

  // Update title - checks if item is from Notion and uses appropriate API
  const updateTitle = useCallback(async (id: string, title: string, item?: ItemRow) => {
    const isNotion = item?.source === "notion" || isNotionId(id)

    if (isNotion) {
      // Update in Notion
      const res = await fetch('/api/notion/task-calendar/subitems', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, title })
      })
      if (!res.ok) throw new Error('Failed to rename task in Notion')
    } else {
      // Update locally
      const res = await fetch('/api/local/breakdown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id, title }] })
      })
      if (!res.ok) throw new Error('rename_failed')
    }
  }, [isNotionId])

  // Delete item - checks if item is from Notion and uses appropriate API
  const deleteItem = useCallback(async (id: string, item?: ItemRow) => {
    const isNotion = item?.source === "notion" || isNotionId(id)

    if (isNotion) {
      // Delete (archive) in Notion
      const res = await fetch('/api/notion/task-calendar/subitems', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id })
      })
      if (!res.ok) throw new Error('Failed to delete task in Notion')
    } else {
      // Delete locally
      const res = await fetch('/api/local/breakdown', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] })
      })
      if (!res.ok) throw new Error('delete_failed')
    }
  }, [isNotionId])

  // Track previous notionGoalIds to detect changes
  const prevNotionGoalIdsRef = useRef<NotionGoalIds>({ goal1: null, goal2: null, goal3: null })

  // Load root lists when panel opens or goals are expanded
  // Note: We use refreshKey to manually trigger reloads, not notionGoalIds to avoid infinite loops
  useEffect(() => {
    if (!open) return
    ;(['goal1','goal2','goal3'] as GoalKey[]).forEach((gk) => {
      if (goalExpanded[gk]) {
        loadList(gk, null)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey, goalExpanded])

  // Reload specific goal's items when its notionGoalId changes (e.g., user selects a new task)
  useEffect(() => {
    if (!open) return
    const prev = prevNotionGoalIdsRef.current
    ;(['goal1','goal2','goal3'] as GoalKey[]).forEach((gk) => {
      // Only reload if this specific goal's ID changed and it now has a value
      if (notionGoalIds[gk] !== prev[gk] && notionGoalIds[gk]) {
        // Clear old tree data for this goal before loading new data (key format is goalKey|parentId)
        setTree(prevTree => {
          const newTree = { ...prevTree }
          // Remove all keys that belong to this goal (root and any nested items)
          Object.keys(newTree).forEach(k => {
            if (k.startsWith(`${gk}|`)) {
              delete newTree[k]
            }
          })
          return newTree
        })
        // Load new data (regardless of whether goal is expanded - it will show when expanded)
        if (goalExpanded[gk]) {
          loadList(gk, null)
        }
      }
    })
    prevNotionGoalIdsRef.current = { ...notionGoalIds }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionGoalIds, open, goalExpanded, keyFor])

  // Listen for goalTaskSelected event from DailyGoals to immediately refresh subtasks
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { goalKey: GoalKey; taskId: string; title: string }
        if (!detail?.goalKey || !detail?.taskId) return

        // Update the notionGoalIds with the new taskId immediately
        setNotionGoalIds(prev => ({
          ...prev,
          [detail.goalKey]: detail.taskId
        }))

        // Clear old tree data for this goal (key format is goalKey|parentId)
        setTree(prevTree => {
          const newTree = { ...prevTree }
          Object.keys(newTree).forEach(k => {
            if (k.startsWith(`${detail.goalKey}|`)) {
              delete newTree[k]
            }
          })
          return newTree
        })

        // If the panel is open and goal is expanded, reload immediately with the new taskId
        if (open && goalExpanded[detail.goalKey]) {
          // Small delay to allow state updates to propagate
          setTimeout(() => {
            loadList(detail.goalKey, null)
          }, 150)
        }
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('goalTaskSelected', handler)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('goalTaskSelected', handler)
      }
    }
  }, [open, goalExpanded, loadList])

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
    const notionGoalId = notionGoalIds[goalKey]

    try {
      // If we have a Notion goal ID, update the goal task status in Notion
      if (notionGoalId) {
        setNotionSyncing(prev => ({ ...prev, [notionGoalId]: true }))
        const notionRes = await fetch('/api/notion/task-calendar/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: notionGoalId,
            status: value ? "done" : "not_started"
          })
        })
        if (!notionRes.ok) {
          console.error('Failed to update Notion goal task status')
        }
        setNotionSyncing(prev => ({ ...prev, [notionGoalId]: false }))

        // Also update all Notion subtask items
        for (const item of items) {
          if (item.source === "notion") {
            await fetch('/api/notion/task-calendar/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: item.id,
                status: value ? "done" : "not_started"
              })
            })
          }
        }
      }

      // Update local items
      const localItems = items.filter(item => item.source !== "notion")
      if (localItems.length > 0) {
        const updates = localItems.map(item => ({ id: item.id, is_completed: value }))
        const res = await fetch('/api/local/breakdown', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: updates })
        })
        if (!res.ok) throw new Error('Failed to update goal completion status')
      }

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
                      createSubtask={createSubtask}
                      updateTitle={updateTitle}
                      deleteItem={deleteItem}
                      isChecked={isChecked}
                      setChecked={setChecked}
                      pendingEdits={pendingEdits}
                      setPendingEdits={setPendingEdits}
                      nextTask={getNextUnfinishedItems.nextTask}
                      notionGoalIds={notionGoalIds}
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
  createSubtask,
  updateTitle,
  deleteItem,
  isChecked,
  setChecked,
  pendingEdits,
  setPendingEdits,
  nextTask,
  notionGoalIds,
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
  createSubtask: (goalKey: GoalKey, parentId: string | null, title: string) => Promise<{ id: string } | null>
  updateTitle: (id: string, title: string, item?: ItemRow) => Promise<void>
  deleteItem: (id: string, item?: ItemRow) => Promise<void>
  isChecked: (item: ItemRow) => boolean
  setChecked: (id: string, v: boolean, element?: Element | null, item?: ItemRow, goalKey?: GoalKey) => Promise<void>
  pendingEdits: Record<string, string>
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  nextTask?: { goalKey: GoalKey; taskId: string } | null
  notionGoalIds: NotionGoalIds
}) {
  const listKey = keyFor(goalKey, parentId)
  const items = tree[listKey]
  const isLoading = !!loading[listKey]

  // State for inline new task input
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [isSavingNew, setIsSavingNew] = useState(false)
  const newTaskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!items && !isLoading) loadList(goalKey, parentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  // Focus the input when it appears
  useEffect(() => {
    if (isAddingNew && newTaskInputRef.current) {
      newTaskInputRef.current.focus()
    }
  }, [isAddingNew])

  // Check if we should use Notion API for this list
  const isNotionContext = (() => {
    // If we have a Notion goal ID for this goal and parentId is null (root level), use Notion
    if (notionGoalIds[goalKey] && parentId === null) {
      return true
    }
    // If parentId is a Notion item, use Notion
    const rootItems = tree[keyFor(goalKey, null)] || []
    if (parentId && rootItems.some(item => item.id === parentId && item.source === "notion")) {
      return true
    }
    // Check nested items too
    const currentItems = tree[keyFor(goalKey, parentId)] || []
    if (currentItems.length > 0 && currentItems[0]?.source === "notion") {
      return true
    }
    return false
  })()

  // Show the inline input when "Add Task" is clicked
  const onAddClick = () => {
    setIsAddingNew(true)
    setNewTaskTitle("")
  }

  // Save the new task when user finishes typing (blur or Enter)
  const saveNewTask = async () => {
    const title = newTaskTitle.trim()

    // If empty, just cancel
    if (!title) {
      setIsAddingNew(false)
      setNewTaskTitle("")
      return
    }

    setIsSavingNew(true)

    // Save any pending local edits first (only for local items)
    const pendingUpdates = Object.entries(pendingEdits)
      .filter(([id]) => {
        const allItems = Object.values(tree).flat()
        const item = allItems.find(i => i.id === id)
        return item?.source !== "notion"
      })
      .map(([id, title]) => ({ id, title }))

    if (pendingUpdates.length > 0) {
      try {
        await fetch('/api/local/breakdown', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: pendingUpdates })
        })
        setPendingEdits(prev => {
          const updated = { ...prev }
          pendingUpdates.forEach(({ id }) => delete updated[id])
          return updated
        })
      } catch (e) {
        console.error('Failed to save pending edits:', e)
      }
    }

    try {
      // Use createSubtask for Notion items, saveChildren for local items
      if (isNotionContext) {
        await createSubtask(goalKey, parentId, title)
      } else {
        // Get fresh data from the tree (includes both saved and pending edits)
        const currentItems = tree[keyFor(goalKey, parentId)] || []
        // Merge in any pending edits to get the most current state
        const itemsWithPendingEdits = currentItems.map(item => ({
          ...item,
          title: pendingEdits[item.id] || item.title
        }))

        await saveChildren(goalKey, parentId, [...itemsWithPendingEdits, {
          title,
          order_index: itemsWithPendingEdits.length
        }])
      }
    } catch (err) {
      console.error('[saveNewTask] Error:', err)
    } finally {
      setIsAddingNew(false)
      setNewTaskTitle("")
      setIsSavingNew(false)
      loadList(goalKey, parentId)
    }
  }

  const onDeleteHere = async (id: string, item?: ItemRow) => {
    try { await deleteItem(id, item) } finally { loadList(goalKey, parentId) }
  }

  return (
    <div className={parentId ? "ml-4 pl-3 border-l border-zinc-800 space-y-1" : "space-y-1"}>
      <div className="flex items-center justify-between py-1">
        <div className="text-xs text-zinc-400">{parentId ? "Subtasks" : "Tasks"}</div>
        <Button size="sm" variant="ghost" onClick={onAddClick} className="text-zinc-300 hover:text-white" disabled={isAddingNew}>
          <Plus className="w-4 h-4 mr-1" /> Add {parentId ? "subtask" : "task"}
        </Button>
      </div>
      {isLoading && <div className="text-xs text-zinc-400 py-2">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && !isAddingNew && (
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
            goalKey={goalKey}
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
                createSubtask={createSubtask}
                updateTitle={updateTitle}
                deleteItem={deleteItem}
                isChecked={isChecked}
                setChecked={setChecked}
                pendingEdits={pendingEdits}
                setPendingEdits={setPendingEdits}
                nextTask={nextTask}
                notionGoalIds={notionGoalIds}
              />
            )}
          </TreeNode>
        </div>
      ))}
      {/* Inline input for new task */}
      {isAddingNew && (
        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-900/50">
          <div className="w-4" /> {/* Spacer for alignment with expand icon */}
          <Checkbox
            checked={false}
            disabled
            className="border-zinc-600 bg-transparent rounded-md opacity-50"
          />
          <Input
            ref={newTaskInputRef}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onBlur={saveNewTask}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveNewTask()
              } else if (e.key === 'Escape') {
                setIsAddingNew(false)
                setNewTaskTitle("")
              }
            }}
            placeholder={parentId ? "Enter subtask name..." : "Enter task name..."}
            className="flex-1 h-6 bg-zinc-900/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-sm focus:border-blue-500"
            disabled={isSavingNew}
          />
          {isSavingNew && <span className="text-xs text-zinc-500">Saving...</span>}
        </div>
      )}
    </div>
  )
}

function TreeNode({ item, expanded, onExpand, onRename, onDelete, isChecked, setChecked, pendingEdits, setPendingEdits, setTree, isNextTask, goalKey, children }: {
  item: ItemRow
  expanded: boolean
  onExpand: (id: string) => void
  onRename: (id: string, title: string, item?: ItemRow) => Promise<void>
  onDelete: (id: string, item?: ItemRow) => Promise<void>
  isChecked: (item: ItemRow) => boolean
  setChecked: (id: string, v: boolean, element?: Element | null, item?: ItemRow, goalKey?: GoalKey) => Promise<void>
  pendingEdits: Record<string, string>
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setTree: React.Dispatch<React.SetStateAction<Record<string, ItemRow[]>>>
  isNextTask?: boolean
  goalKey: GoalKey
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
      await onRename(item.id, next, item)
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
            setChecked(item.id, Boolean(v), checkbox, item, goalKey)
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
        <div className="flex items-center gap-1">
          {/* Notion badge indicator */}
          {item.source === "notion" && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded" title="Synced with Notion">
              N
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-red-400" onClick={() => onDelete(item.id, item)} title="Delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
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