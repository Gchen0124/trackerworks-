"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Square, Mic, Calendar, Database, ArrowRight, Undo2, Clock, Settings, Pin, PinOff } from "lucide-react"
import { cn } from "@/lib/utils"
import TaskSelector from "@/components/task-selector"
import VoiceInterface from "@/components/voice-interface"
import NotionTasks from "@/components/notion-tasks"
import QuickTaskInput from "@/components/quick-task-input"
import ProgressCheckPopup from "@/components/progress-check-popup"
import DailyGoals from "@/components/daily-goals"
import { useLocalBlocks } from "@/lib/use-local-blocks"

interface TimeBlock {
  id: string
  startTime: string
  endTime: string
  task?: {
    id: string
    title: string
    type: "calendar" | "notion" | "custom"
    color: string
  }
  // Optional goal assigned to this time block (does not replace task)
  goal?: {
    id: string
    label: string
    color: string // Tailwind color class for badge/background
  }
  isActive: boolean
  isCompleted: boolean
  isRecentlyMoved?: boolean
  // If pinned, this block's task should not be auto-moved or overwritten
  isPinned?: boolean
}

interface CalendarEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  color: string
}

interface TaskChange {
  type: "edit" | "push"
  blockId: string
  oldTask?: any
  newTask?: any
  affectedBlocks?: string[]
  timestamp: Date
}

interface BlockDurationOption {
  value: number
  label: string
  description: string
}

interface DragState {
  sourceBlockId: string | null
  task: any | null
  isDragging: boolean
  isExpandMode: boolean  // Track if dragging from expand button
}

interface PlanningMode {
  isActive: boolean
  startBlockId: string | null
  endBlockId: string | null
  selectedBlocks: string[]
  taskToFill: any | null
}

export default function TimeTracker() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [currentTask, setCurrentTask] = useState<any>(null)
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  // Keep a snapshot of previous grid to help remap when duration changes
  const prevBlocksRef = useRef<TimeBlock[]>([])
  const prevDurationRef = useRef<number>(10)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [showTaskSelector, setShowTaskSelector] = useState(false)
  const [showVoiceInterface, setShowVoiceInterface] = useState(false)
  const [showNotionTasks, setShowNotionTasks] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [showQuickInput, setShowQuickInput] = useState(false)
  const [quickInputPosition, setQuickInputPosition] = useState({ x: 0, y: 0 })
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [gradientIndex, setGradientIndex] = useState(0)
  const [isShining, setIsShining] = useState(false)
  const [recentChanges, setRecentChanges] = useState<TaskChange[]>([])
  const [showChangeNotification, setShowChangeNotification] = useState(false)
  const [blockDurationMinutes, setBlockDurationMinutes] = useState(30)
  const [showDurationSelector, setShowDurationSelector] = useState(false)
  const [showProgressCheck, setShowProgressCheck] = useState(false)
  const [progressCheckTimer, setProgressCheckTimer] = useState<NodeJS.Timeout | null>(null)
  const [completedBlockId, setCompletedBlockId] = useState<string | null>(null)
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [notificationType, setNotificationType] = useState<"rescheduled" | "disrupted" | "paused">("rescheduled")
  
  // Drag and drop state for planning feature
  const [dragState, setDragState] = useState<DragState>({
    sourceBlockId: null,
    task: null,
    isDragging: false,
    isExpandMode: false,
  })
  
  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>({
    isActive: false,
    startBlockId: null,
    endBlockId: null,
    selectedBlocks: [],
    taskToFill: null,
  })

  // Multi-select and bulk move state
  const [multiSelect, setMultiSelect] = useState<{ isActive: boolean; selected: string[]; lastAnchorId: string | null }>({
    isActive: false,
    selected: [],
    lastAnchorId: null,
  })
  const [bulkMove, setBulkMove] = useState<{ active: boolean }>({ active: false })

  // Read-only wiring to local DB blocks (Phase 1)
  const { frames: dbFrames, mode: dbMode, refresh: refreshDbFrames } = useLocalBlocks(blockDurationMinutes, new Date())
  useEffect(() => {
    // Only adopt DB-backed frames in canonical modes during Phase 1
    if (!dbFrames) return
    if (![30, 3, 1].includes(blockDurationMinutes)) return
    // Overlay DB tasks onto existing grid using containment so cross-mode transitions display correctly
    // Build a minute -> frame map for fast containment lookup
    const minuteToFrame: (typeof dbFrames[number] | undefined)[] = new Array(1440)
    for (const f of dbFrames) {
      for (let m = f.startMinute; m < Math.min(f.endMinute, 1440); m++) minuteToFrame[m] = f
    }
    const parseHHMMToMin = (hhmm: string) => {
      const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10))
      return hh * 60 + mm
    }
    setTimeBlocks((prev) =>
      prev.map((b) => {
        const startMin = parseHHMMToMin(b.startTime)
        const f = minuteToFrame[startMin]
        if (!f) return b
        const taskTitle = f.labelOverride || f.taskName || ""
        const hasTask = !!taskTitle
        // If DB frame has no task, keep existing task instead of clearing it
        if (!hasTask) {
          return {
            ...b,
            isCompleted: f.status === 'done',
            isPinned: !!f.isPinned,
          }
        }
        const color = b.task?.color && b.task.color.length > 0 ? b.task.color : "bg-blue-500"
        return {
          ...b,
          task: { id: b.id, title: taskTitle, type: b.task?.type || "custom", color },
          isCompleted: f.status === 'done',
          isPinned: !!f.isPinned,
        }
      })
    )
  }, [dbFrames, blockDurationMinutes])

  // -------- Phase 2: Persist assign/set to local DB (mode-aware) --------
  const isDbModeSupported = [30, 3, 1].includes(blockDurationMinutes)
  const stepMinutes = blockDurationMinutes
  const parseMinuteFromId = (id: string): number | null => {
    // Prefer db-<startMinute> ids
    if (id.startsWith('db-')) {
      const m = parseInt(id.slice(3), 10)
      return Number.isFinite(m) ? m : null
    }
    // Fallback: look up current block by id and parse its startTime (HH:MM)
    const blk = timeBlocks.find((b) => b.id === id)
    if (!blk) return null
    const [hh, mm] = blk.startTime.split(":").map((x) => parseInt(x, 10))
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return hh * 60 + mm
  }
  const toDateStrLocal = (d: Date) => {
    const dd = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return dd.toISOString().slice(0, 10)
  }
  const postSetRange = async (dateStr: string, startMinute: number, endMinute: number, taskTitle: string, isPinned = false) => {
    await fetch('/api/local/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_range',
        date: dateStr,
        startMinute,
        endMinute,
        taskName: taskTitle,
        isPinned,
        status: 'planned',
      }),
    })
  }
  const postPinRange = async (dateStr: string, startMinute: number, length: number, isPinned: boolean) => {
    await fetch('/api/local/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pin_range',
        date: dateStr,
        startMinute,
        length,
        isPinned,
      }),
    })
  }
  const postPostponeRange = async (dateStr: string, startMinute: number, length: number, deltaMinutes: number, carryPin = true) => {
    await fetch('/api/local/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'postpone_range',
        date: dateStr,
        startMinute,
        length,
        deltaMinutes,
        carryPin,
      }),
    })
  }
  const postRenameRange = async (dateStr: string, startMinute: number, length: number, label: string) => {
    await fetch('/api/local/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rename_range',
        date: dateStr,
        startMinute,
        length,
        label,
      }),
    })
  }
  const persistAssignForContiguous = async (blockIds: string[], titleByIndex: (i: number) => string) => {
    if (!isDbModeSupported) return
    const dateStr = toDateStrLocal(new Date())
    // Sort by minute
    const minutes = blockIds
      .map((id) => parseMinuteFromId(id))
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b)
    if (minutes.length === 0) return
    // Group into contiguous runs by step
    const runs: number[][] = []
    let run: number[] = []
    for (const m of minutes) {
      if (run.length === 0) {
        run.push(m)
      } else {
        const last = run[run.length - 1]
        if (m === last + stepMinutes) run.push(m)
        else { runs.push(run); run = [m] }
      }
    }
    if (run.length) runs.push(run)
    // Fire POST per run with the run's title pattern when numbering is not uniform, we default to per-block post
    for (let r = 0; r < runs.length; r++) {
      const group = runs[r]
      // If titles differ per index, fall back to per-block writes
      let uniform = true
      const firstTitle = titleByIndex(0)
      for (let i = 0; i < group.length; i++) {
        if (titleByIndex(i) !== firstTitle) { uniform = false; break }
      }
      if (uniform) {
        const startMinute = group[0]
        const endMinute = Math.min(group[group.length - 1] + stepMinutes, 1440)
        await postSetRange(dateStr, startMinute, endMinute, firstTitle)
      } else {
        for (let i = 0; i < group.length; i++) {
          const startMinute = group[i]
          const endMinute = Math.min(startMinute + stepMinutes, 1440)
          await postSetRange(dateStr, startMinute, endMinute, titleByIndex(i))
        }
      }
    }
    // Refresh frames after writes
    refreshDbFrames()
  }

  // Block duration options
  const blockDurationOptions: BlockDurationOption[] = [
    { value: 1, label: "1 min", description: "1440 blocks/day - Ultra micro focus" },
    { value: 3, label: "3 min", description: "480 blocks/day - Micro focus" },
    { value: 10, label: "10 min", description: "144 blocks/day - Detailed" },
    { value: 30, label: "30 min", description: "48 blocks/day - High level" },
  ]

  // Daily goals loaded from DailyGoals snapshot in localStorage (kept in sync there)
  const [dailyGoals, setDailyGoals] = useState<string[]>(["", "", ""]) // [goal1, goal2, goal3]

  const getTodayKey = () => {
    const d = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    return `goals:${d}`
  }

  const loadDailyGoalsFromStorage = () => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(getTodayKey()) : null
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data?.goals)) {
        setDailyGoals([
          data.goals[0] ?? "",
          data.goals[1] ?? "",
          data.goals[2] ?? "",
        ])
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadDailyGoalsFromStorage()
    const onStorage = (e: StorageEvent) => {
      if (e.key === getTodayKey()) loadDailyGoalsFromStorage()
    }
    const onDailyGoalsUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { goals?: string[] }
        if (detail?.goals && Array.isArray(detail.goals)) {
          setDailyGoals([
            detail.goals[0] ?? "",
            detail.goals[1] ?? "",
            detail.goals[2] ?? "",
          ])
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
      window.addEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('dailyGoalsUpdated', onDailyGoalsUpdated as EventListener)
      }
    }
  }, [])

  const goalOptions: { id: string; label: string; color: string }[] = [
    { id: 'goal_1', label: dailyGoals[0] || 'Goal 1', color: 'bg-amber-200 text-amber-900' },
    { id: 'goal_2', label: dailyGoals[1] || 'Goal 2', color: 'bg-emerald-200 text-emerald-900' },
    { id: 'goal_3', label: dailyGoals[2] || 'Goal 3', color: 'bg-indigo-200 text-indigo-900' },
  ]

  // Mock calendar events
  const [calendarEvents] = useState<CalendarEvent[]>([
    {
      id: "1",
      title: "Team Meeting",
      startTime: "09:00",
      endTime: "10:00",
      color: "bg-blue-500",
    },
    {
      id: "2",
      title: "Project Review",
      startTime: "14:30",
      endTime: "15:30",
      color: "bg-green-500",
    },
    {
      id: "3",
      title: "Client Call",
      startTime: "16:00",
      endTime: "17:00",
      color: "bg-purple-500",
    },
  ])

  // Generate time blocks based on configurable duration
  useEffect(() => {
    const blocks: TimeBlock[] = []
    const totalMinutesInDay = 24 * 60
    const blocksPerDay = totalMinutesInDay / blockDurationMinutes

    for (let blockIndex = 0; blockIndex < blocksPerDay; blockIndex++) {
      const startMinutes = blockIndex * blockDurationMinutes
      const endMinutes = startMinutes + blockDurationMinutes

      const startHour = Math.floor(startMinutes / 60)
      const startMinute = startMinutes % 60
      const endHour = Math.floor(endMinutes / 60)
      const endMinute = endMinutes % 60

      const startTime = `${startHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`
      const endTime = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`

      blocks.push({
        id: `${startHour}-${startMinute}`,
        startTime,
        endTime,
        isActive: false,
        isCompleted: false,
      })
    }

    // Map calendar events to blocks
    calendarEvents.forEach((event) => {
      const [startHour, startMinute] = event.startTime.split(":").map(Number)
      const [endHour, endMinute] = event.endTime.split(":").map(Number)

      const startTotalMinutes = startHour * 60 + startMinute
      const endTotalMinutes = endHour * 60 + endMinute

      const startBlockIndex = Math.floor(startTotalMinutes / blockDurationMinutes)
      const endBlockIndex = Math.floor(endTotalMinutes / blockDurationMinutes)

      for (let i = startBlockIndex; i < endBlockIndex && i < blocks.length; i++) {
        if (blocks[i]) {
          blocks[i].task = {
            id: event.id,
            title: event.title,
            type: "calendar",
            color: event.color,
          }
        }
      }
    })

    // If we just changed from 30-minute mode to a smaller mode, propagate tasks/goals
    try {
      const prevDuration = prevDurationRef.current
      if (prevDuration === 30 && blockDurationMinutes < 30 && prevBlocksRef.current.length) {
        // Helper to convert HH:MM to minutes from midnight
        const toMin = (hhmm: string) => {
          const [h, m] = hhmm.split(":").map(Number)
          return h * 60 + m
        }
        // Build quick index of new blocks' start minutes
        const newStarts = blocks.map((b) => toMin(b.startTime))

        for (const prev of prevBlocksRef.current) {
          const pStart = toMin(prev.startTime)
          const pEnd = toMin(prev.endTime)
          const hasContent = !!prev.task || !!prev.goal
          if (!hasContent) continue
          for (let i = 0; i < blocks.length; i++) {
            const ns = newStarts[i]
            // Fill blocks whose start lies within the previous 30-min window
            if (ns >= pStart && ns < pEnd) {
              if (!blocks[i].task) {
                if (prev.task) {
                  blocks[i].task = { ...prev.task }
                }
              }
              if (!blocks[i].goal && prev.goal) {
                blocks[i].goal = { ...prev.goal }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Remap from 30-min to smaller failed:", e)
    }

    console.log("Generated time blocks:", blocks.length, "blocks")
    setTimeBlocks(blocks)
  }, [calendarEvents, blockDurationMinutes])

  // Initialize current time on client side to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date())
  }, [])

  // Update current time and handle block transitions
  useEffect(() => {
    if (!currentTime) return
    
    const timer = setInterval(() => {
      const now = new Date()
      const prevTime = currentTime
      setCurrentTime(now)

      const currentBlockId = getCurrentBlockId(now)
      const prevBlockId = getCurrentBlockId(prevTime) // Get previous block ID

      // Check if we've moved to a new block
      if (prevBlockId !== currentBlockId && prevBlockId) {
        const prevBlock = timeBlocks.find((b) => b.id === prevBlockId)

        console.log("Block transition detected:", {
          from: prevBlockId,
          to: currentBlockId,
          prevBlock: prevBlock?.task?.title || "No task",
          wasActive: prevBlock?.isActive,
          timerRunning: isTimerRunning,
          showProgressCheck,
        })

        // If previous block was active AND timer was running, trigger completion
        if (prevBlock && prevBlock.isActive && isTimerRunning) {
          console.log("Triggering block completion for:", prevBlockId)
          handleBlockCompletion(prevBlock, currentBlockId)
          return // Don't auto-start next block yet
        }
        
        // Also trigger completion for blocks with real tasks (not pause/disruption), even if not marked as active
        if (prevBlock && 
            prevBlock.task && 
            !prevBlock.task.title?.includes("Paused") && 
            !prevBlock.task.title?.includes("Disrupted") && 
            isTimerRunning) {
          console.log("Triggering block completion for task block:", prevBlockId, prevBlock.task.title)
          handleBlockCompletion(prevBlock, currentBlockId)
          return // Don't auto-start next block yet
        }
      }

      // Auto-start timer for current block if it has a real task and timer isn't running
      const currentBlock = timeBlocks.find((b) => b.id === currentBlockId)
      
      if (
        currentBlock &&
        currentBlock.task &&
        !currentBlock.task.title?.includes("Paused") &&
        !currentBlock.task.title?.includes("Disrupted") &&
        !isTimerRunning &&
        !showProgressCheck &&
        !currentBlock.isActive
      ) {
        console.log("Auto-starting timer for task block:", currentBlockId, currentBlock.task.title)
        setIsTimerRunning(true)
        setTimerSeconds(0)
        setTimeBlocks((prev) =>
          prev.map((block) =>
            block.id === currentBlockId ? { ...block, isActive: true } : { ...block, isActive: false },
          ),
        )
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [currentTime, timeBlocks, isTimerRunning, blockDurationMinutes, showProgressCheck])

  // Timer functionality
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning])

  // Clear recently moved indicators after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeBlocks((prev) => prev.map((block) => ({ ...block, isRecentlyMoved: false })))
    }, 2000)
    return () => clearTimeout(timer)
  }, [timeBlocks.some((block) => block.isRecentlyMoved)])

  // AI-themed gradient combinations
  const aiGradients = [
    "from-blue-400 via-purple-500 to-pink-500",
    "from-cyan-400 via-blue-500 to-purple-600",
    "from-green-400 via-blue-500 to-purple-600",
    "from-pink-400 via-red-500 to-yellow-500",
    "from-indigo-400 via-purple-500 to-pink-500",
    "from-teal-400 via-cyan-500 to-blue-600",
    "from-orange-400 via-pink-500 to-purple-600",
    "from-emerald-400 via-teal-500 to-cyan-600",
  ]

  // Cycle through gradients and trigger shine effect
  useEffect(() => {
    const gradientTimer = setInterval(() => {
      setGradientIndex((prev) => (prev + 1) % aiGradients.length)
    }, 3000) // Change gradient every 3 seconds

    const shineTimer = setInterval(() => {
      setIsShining(true)
      setTimeout(() => setIsShining(false), 800) // Shine duration
    }, 1000) // Shine every second

    return () => {
      clearInterval(gradientTimer)
      clearInterval(shineTimer)
    }
  }, [])

  const getCurrentBlockId = (time?: Date) => {
    const now = time || new Date()
    const totalMinutes = now.getHours() * 60 + now.getMinutes()
    const blockIndex = Math.floor(totalMinutes / blockDurationMinutes)
    const startMinutes = blockIndex * blockDurationMinutes
    const hour = Math.floor(startMinutes / 60)
    const minute = startMinutes % 60
    return `${hour}-${minute}`
  }

  // Determine whether a block id is past/current/future relative to now
  const getBlockTimeStatus = (blockId: string): 'past' | 'current' | 'future' => {
    const now = new Date()
    const currentId = getCurrentBlockId(now)
    if (blockId === currentId) return 'current'
    const [h1, m1] = blockId.split('-').map(Number)
    const [h2, m2] = currentId.split('-').map(Number)
    const t1 = h1 * 60 + m1
    const t2 = h2 * 60 + m2
    return t1 < t2 ? 'past' : 'future'
  }

  // Index of a block id within today's timeBlocks array
  const getBlockIndex = (blockId: string) => {
    return timeBlocks.findIndex((block) => block.id === blockId)
  }

  // Export today's blocks as CSV (temporary solution before DB)
  const exportTodayCsv = () => {
    try {
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number)
        return h * 60 + m
      }
      const csvEscape = (value: unknown) => {
        const s = (value ?? '').toString()
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }

      const today = new Date()
      const ymd = today.toISOString().slice(0, 10)

      const headers = [
        'date',
        'start_time',
        'end_time',
        'duration_min',
        'status',
        'task_title',
        'task_type',
        'task_color',
        'goal_label',
        'goal_color',
        'is_active',
        'is_completed',
      ]

      const rows = timeBlocks.map((b) => {
        const duration = toMinutes(b.endTime) - toMinutes(b.startTime)
        const status = getBlockTimeStatus(b.id)
        const taskTitle = b.task?.title ?? ''
        const taskType = (b as any).task?.type ?? ''
        const taskColor = b.task?.color ?? ''
        const goalLabel = b.goal?.label ?? ''
        const goalColor = b.goal?.color ?? ''
        const isActive = (b as any).isActive ? '1' : '0'
        const isCompleted = (b as any).isCompleted ? '1' : '0'
        return [
          ymd,
          b.startTime,
          b.endTime,
          duration,
          status,
          taskTitle,
          taskType,
          taskColor,
          goalLabel,
          goalColor,
          isActive,
          isCompleted,
        ].map(csvEscape).join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      // Prepend UTF-8 BOM to ensure Excel renders non-ASCII (e.g., Chinese) correctly
      const csvWithBom = '\uFEFF' + csv
      const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trackerworks-${ymd}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('CSV export failed', e)
    }
  }

  // ===== Multi-select helpers =====
  const toggleSelect = (blockId: string) => {
    setMultiSelect((prev) => {
      const exists = prev.selected.includes(blockId)
      const selected = exists ? prev.selected.filter((id) => id !== blockId) : [...prev.selected, blockId]
      return { ...prev, selected, lastAnchorId: blockId }
    })
  }

  const rangeSelect = (fromId: string, toId: string) => {
    const startIdx = timeBlocks.findIndex((b) => b.id === fromId)
    const endIdx = timeBlocks.findIndex((b) => b.id === toId)
    if (startIdx === -1 || endIdx === -1) return
    const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    const ids = timeBlocks.slice(lo, hi + 1).map((b) => b.id)
    setMultiSelect((prev) => ({
      ...prev,
      selected: Array.from(new Set([...prev.selected, ...ids])),
      lastAnchorId: toId,
    }))
  }

  const clearSelection = () => {
    setMultiSelect({ isActive: false, selected: [], lastAnchorId: null })
    setBulkMove({ active: false })
  }

  const bulkDeleteSelected = () => {
    if (multiSelect.selected.length === 0) return
    setTimeBlocks((prev) =>
      prev.map((block) => (multiSelect.selected.includes(block.id) ? { ...block, task: undefined } : block)),
    )
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 2000)
    clearSelection()
  }

  const startBulkMove = () => {
    if (multiSelect.selected.length === 0) return
    setBulkMove({ active: true })
  }

  // ===== Goal assignment helpers =====
  const assignGoalToSelected = (goalId: string) => {
    if (multiSelect.selected.length === 0) return
    const goal = goalOptions.find((g) => g.id === goalId)
    if (!goal) return
    setTimeBlocks((prev) =>
      prev.map((b) => (multiSelect.selected.includes(b.id) ? { ...b, goal: { id: goal.id, label: goal.label, color: goal.color } } : b)),
    )
    const change: TaskChange = {
      type: 'edit',
      blockId: multiSelect.selected[0],
      timestamp: new Date(),
      affectedBlocks: [...multiSelect.selected],
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])
  }

  const clearGoalFromSelected = () => {
    if (multiSelect.selected.length === 0) return
    setTimeBlocks((prev) => prev.map((b) => (multiSelect.selected.includes(b.id) ? { ...b, goal: undefined } : b)))
    const change: TaskChange = {
      type: 'edit',
      blockId: multiSelect.selected[0],
      timestamp: new Date(),
      affectedBlocks: [...multiSelect.selected],
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])
  }

  // Perform bulk move preserving relative spacing and auto-postponing conflicts
  const performBulkMoveTo = (destinationBlockId: string) => {
    if (multiSelect.selected.length === 0) return
    const updated = [...timeBlocks]
    const destIdx = updated.findIndex((b) => b.id === destinationBlockId)
    if (destIdx === -1) return

    // Order selected by timeline index
    const selectedIndices = multiSelect.selected
      .map((id) => updated.findIndex((b) => b.id === id))
      .filter((idx) => idx !== -1)
      .sort((a, b) => a - b)
    if (selectedIndices.length === 0) return

    const minSelIdx = selectedIndices[0]

    // Validate target not in past
    const targetStatuses = selectedIndices.map((selIdx) => {
      const delta = selIdx - minSelIdx
      const targetIdx = destIdx + delta
      const targetId = updated[targetIdx]?.id
      return targetId ? getBlockTimeStatus(targetId) : 'future'
    })
    if (targetStatuses.some((s) => s === 'past')) {
      setNotificationType('rescheduled')
      setShowChangeNotification(true)
      setTimeout(() => setShowChangeNotification(false), 2000)
      return
    }

    // Collect tasks and clear sources
    const tasksToPlace: Array<{ task: any | undefined; delta: number }> = []
    selectedIndices.forEach((selIdx) => {
      const task = updated[selIdx].task
      tasksToPlace.push({ task, delta: selIdx - minSelIdx })
      updated[selIdx].task = undefined
    })

    const affected: string[] = []

    // Place tasks at destination preserving spacing
    tasksToPlace.forEach(({ task, delta }) => {
      if (!task) return
      const targetIdx = destIdx + delta
      if (targetIdx >= updated.length) return

      // If occupied, postpone displaced task to next empty
      if (updated[targetIdx].task) {
        const displaced = updated[targetIdx].task
        let postponeIndex = targetIdx + 1
        while (postponeIndex < updated.length && updated[postponeIndex].task) postponeIndex++
        if (postponeIndex < updated.length) {
          updated[postponeIndex].task = displaced
          updated[postponeIndex].isRecentlyMoved = true
          affected.push(updated[postponeIndex].id)
        }
      }

      updated[targetIdx].task = task
      updated[targetIdx].isRecentlyMoved = true
      affected.push(updated[targetIdx].id)
    })

    setTimeBlocks(updated)

    // Clear recently moved status after animation
    setTimeout(() => {
      setTimeBlocks((prev) => prev.map((b) => ({ ...b, isRecentlyMoved: false })))
    }, 2000)

    // Record change
    const change: TaskChange = {
      type: 'push',
      blockId: destinationBlockId,
      affectedBlocks: affected,
      timestamp: new Date(),
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

    // Feedback and reset
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 3000)
    setBulkMove({ active: false })
    setMultiSelect((prev) => ({ ...prev, selected: [], lastAnchorId: null }))
  }

  const pushTasksForward = (
    fromBlockIndex: number,
    offset: number = 1,
    options?: { forceMovePinnedAtIndices?: Set<number> }
  ) => {
    const affectedBlocks: string[] = []
    const updatedBlocks = [...timeBlocks]

    // Collect all tasks from the current position onwards that need to be moved
    const tasksToMove: Array<{ task: any; originalIndex: number; fromPinned: boolean }> = []

    for (let i = fromBlockIndex; i < updatedBlocks.length; i++) {
      const blk = updatedBlocks[i]
      if (blk.task) {
        // Do not move pinned blocks unless explicitly forced for this index
        const isForcedPinnedMove = blk.isPinned && !!(options?.forceMovePinnedAtIndices?.has(i))
        if (blk.isPinned && !isForcedPinnedMove) continue
        tasksToMove.push({ task: blk.task, originalIndex: i, fromPinned: !!isForcedPinnedMove })
        blk.task = undefined // Clear the original position for movable tasks only
        // If we are moving a pinned block's task, also transfer the pin (unset here; will set at destination)
        if (isForcedPinnedMove) {
          blk.isPinned = false
        }
      }
    }

    // Place tasks in new positions (offset blocks later), skipping pinned/occupied slots
    let placeCursor = fromBlockIndex + offset
    tasksToMove.forEach(({ task, fromPinned }) => {
      while (
        placeCursor < updatedBlocks.length &&
        (updatedBlocks[placeCursor].isPinned || updatedBlocks[placeCursor].task)
      ) {
        placeCursor++
      }
      if (placeCursor < updatedBlocks.length) {
        updatedBlocks[placeCursor].task = task
        updatedBlocks[placeCursor].isRecentlyMoved = true
        if (fromPinned) {
          updatedBlocks[placeCursor].isPinned = true
        }
        affectedBlocks.push(updatedBlocks[placeCursor].id)
        placeCursor++
      }
    })

    return { updatedBlocks, affectedBlocks }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleBlockClick = (blockId: string, event: React.MouseEvent) => {
    // If we are in bulk move destination picking, treat click as destination
    if (bulkMove.active) {
      event.preventDefault()
      performBulkMoveTo(blockId)
      return
    }

    const metaKey = (event as any).metaKey || (event as any).ctrlKey
    const shiftKey = (event as any).shiftKey
    if (multiSelect.isActive || metaKey || shiftKey) {
      if (shiftKey && multiSelect.lastAnchorId) {
        rangeSelect(multiSelect.lastAnchorId, blockId)
      } else {
        toggleSelect(blockId)
      }
      return
    }

    // Default behavior: open quick input
    setSelectedBlock(blockId)
    const block = timeBlocks.find((b) => b.id === blockId)

    const rect = event.currentTarget.getBoundingClientRect()
    setQuickInputPosition({
      x: rect.left,
      y: rect.bottom + 5,
    })
    setEditingBlockId(blockId)
    setShowQuickInput(true)
  }

  const handleTaskAssign = (task: any, blockId: string) => {
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === blockId ? { ...block, task: { ...task, type: "custom" } } : block)),
    )
    setShowTaskSelector(false)
    setSelectedBlock(null)
  }

  // Drag and drop handlers for planning feature
  const handleDragStart = (e: React.DragEvent, block: TimeBlock, isExpand: boolean = false) => {
    if (!block.task) return
    if (block.isPinned) return
    
    setDragState({
      sourceBlockId: block.id,
      task: block.task,
      isDragging: true,
      isExpandMode: isExpand,
    })
    
    e.dataTransfer.effectAllowed = isExpand ? 'copy' : 'move'
    e.dataTransfer.setData('text/plain', block.task.title)
  }

  const handleDragEnd = () => {
    setDragState({
      sourceBlockId: null,
      task: null,
      isDragging: false,
      isExpandMode: false,
    })
    
    // Clear planning mode if active
    if (planningMode.isActive) {
      setPlanningMode({
        isActive: false,
        startBlockId: null,
        endBlockId: null,
        selectedBlocks: [],
        taskToFill: null,
      })
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = dragState.isExpandMode ? 'copy' : 'move'
  }

  const handleDragEnter = (e: React.DragEvent, block: TimeBlock) => {
    if (!dragState.isDragging || !dragState.task) return
    
    // Activate multi-block planning mode if expand mode is enabled
    if (dragState.isExpandMode) {
      // If planning mode is not active, start it from the source block
      if (!planningMode.isActive) {
        const sourceIdx = timeBlocks.findIndex(b => b.id === dragState.sourceBlockId)
        const targetIdx = timeBlocks.findIndex(b => b.id === block.id)
        
        if (sourceIdx !== -1 && targetIdx !== -1 && targetIdx > sourceIdx) {
          // Only allow dragging to future blocks
          const selectedIds = timeBlocks.slice(sourceIdx + 1, targetIdx + 1).map(b => b.id)
          setPlanningMode({
            isActive: true,
            startBlockId: dragState.sourceBlockId,
            endBlockId: block.id,
            selectedBlocks: selectedIds,
            taskToFill: dragState.task,
          })
        }
      } else {
        // Update the end block and selected blocks range
        const sourceIdx = timeBlocks.findIndex(b => b.id === dragState.sourceBlockId)
        const targetIdx = timeBlocks.findIndex(b => b.id === block.id)
        
        if (sourceIdx !== -1 && targetIdx !== -1 && targetIdx > sourceIdx) {
          const selectedIds = timeBlocks.slice(sourceIdx + 1, targetIdx + 1).map(b => b.id)
          setPlanningMode(prev => ({
            ...prev,
            endBlockId: block.id,
            selectedBlocks: selectedIds,
          }))
        }
      }
    } else {
      // For simple drag, just track the current hover block
      setPlanningMode({
        isActive: false,
        startBlockId: null,
        endBlockId: block.id,
        selectedBlocks: [block.id],
        taskToFill: null,
      })
    }
  }

  const handleDrop = (e: React.DragEvent, targetBlock: TimeBlock) => {
    e.preventDefault()
    
    if (!dragState.task) return
    
    if (dragState.isExpandMode && planningMode.selectedBlocks.length > 0) {
      // Expand mode - fill blocks with numbered tasks
      expandTaskToBlocks(planningMode.selectedBlocks, dragState.task)
    } else if (!dragState.isExpandMode) {
      // Simple drag mode - just move the task
      simpleTaskMove(dragState.sourceBlockId!, targetBlock.id, dragState.task)
    }
    
    // Reset states
    handleDragEnd()
  }

  const simpleTaskMove = (sourceBlockId: string, targetBlockId: string, task: any) => {
    // Don't allow moving to the same block
    if (sourceBlockId === targetBlockId) return
    
    const updatedBlocks = [...timeBlocks]
    const sourceIndex = updatedBlocks.findIndex(b => b.id === sourceBlockId)
    const targetIndex = updatedBlocks.findIndex(b => b.id === targetBlockId)
    
    if (sourceIndex === -1 || targetIndex === -1) return
    
    // Check if we're moving to a past block (not allowed)
    const targetBlockStatus = getBlockTimeStatus(targetBlockId)
    if (targetBlockStatus === 'past') {
      // Show notification that we can't move to past blocks
      setNotificationType('rescheduled')
      setShowChangeNotification(true)
      setTimeout(() => setShowChangeNotification(false), 2000)
      return
    }
    
    const targetBlock = updatedBlocks[targetIndex]
    const affectedBlocks: string[] = [sourceBlockId, targetBlockId]
    
    // If target block has a task, we need to postpone it (unless pinned)
    if (targetBlock.task) {
      if (targetBlock.isPinned) {
        // Can't drop onto a pinned block; abort move
        setNotificationType('rescheduled')
        setShowChangeNotification(true)
        setTimeout(() => setShowChangeNotification(false), 2000)
        return
      }
      const taskToPostpone = targetBlock.task
      
      // Find the next available empty, non-pinned block after target
      let postponeIndex = targetIndex + 1
      while (
        postponeIndex < updatedBlocks.length &&
        (updatedBlocks[postponeIndex].isPinned || updatedBlocks[postponeIndex].task)
      ) {
        postponeIndex++
      }
      
      // If we found an empty block, move the displaced task there
      if (postponeIndex < updatedBlocks.length) {
        updatedBlocks[postponeIndex].task = taskToPostpone
        updatedBlocks[postponeIndex].isRecentlyMoved = true
        affectedBlocks.push(updatedBlocks[postponeIndex].id)
      }
    }
    
    // Move the dragged task to target block
    updatedBlocks[targetIndex].task = task
    updatedBlocks[targetIndex].isRecentlyMoved = true
    
    // Clear the source block (unless it's pinned; if pinned, we shouldn't have allowed drag)
    if (!updatedBlocks[sourceIndex].isPinned) {
      updatedBlocks[sourceIndex].task = undefined
    }
    updatedBlocks[sourceIndex].isRecentlyMoved = true
    
    // Update state
    setTimeBlocks(updatedBlocks)
    
    // Clear recently moved status after animation
    setTimeout(() => {
      setTimeBlocks(prev => prev.map(block => ({ ...block, isRecentlyMoved: false })))
    }, 2000)
    
    // Record the change for undo
    const change: TaskChange = {
      type: 'edit',
      blockId: targetBlockId,
      oldTask: targetBlock.task,
      newTask: task,
      affectedBlocks,
      timestamp: new Date(),
    }
    setRecentChanges(prev => [change, ...prev.slice(0, 4)])
    
    // Show notification
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 3000)
  }

  const expandTaskToBlocks = (blockIds: string[], task: any) => {
    const updatedBlocks = [...timeBlocks]
    const affectedBlocks: string[] = []
    
    // Remove any trailing numbers from the task title
    const baseTitle = task.title.replace(/\d+$/, '').trim()
    
    // First, push existing tasks forward by the number of blocks we're filling
    const firstBlockIdx = updatedBlocks.findIndex(b => b.id === blockIds[0])
    const lastBlockIdx = updatedBlocks.findIndex(b => b.id === blockIds[blockIds.length - 1])
    
    if (firstBlockIdx === -1 || lastBlockIdx === -1) return
    
    // Collect tasks that need to be postponed (skip pinned)
    const tasksToPostpone: Array<{ task: any; originalIndex: number }> = []
    for (let i = firstBlockIdx; i <= lastBlockIdx; i++) {
      if (updatedBlocks[i].task && !updatedBlocks[i].isPinned) {
        tasksToPostpone.push({ task: updatedBlocks[i].task, originalIndex: i })
      }
    }
    
    // Clear the blocks we're filling (do not clear pinned)
    for (let i = firstBlockIdx; i <= lastBlockIdx; i++) {
      if (!updatedBlocks[i].isPinned) {
        updatedBlocks[i].task = undefined
      }
    }
    
    // Fill the blocks with numbered tasks (starting from 2 since original is 1)
    blockIds.forEach((blockId, index) => {
      const blockIdx = updatedBlocks.findIndex(b => b.id === blockId)
      if (blockIdx !== -1) {
        updatedBlocks[blockIdx].task = {
          ...task,
          title: `${baseTitle}${index + 2}`, // Start numbering from 2
          id: `${task.id}-${index + 2}`,
        }
        updatedBlocks[blockIdx].isRecentlyMoved = true
        affectedBlocks.push(blockId)
      }
    })
    
    // Postpone the displaced tasks to empty, non-pinned blocks after the filled range
    let postponeIdx = lastBlockIdx + 1
    tasksToPostpone.forEach(({ task }) => {
      while (
        postponeIdx < updatedBlocks.length &&
        (updatedBlocks[postponeIdx].isPinned || updatedBlocks[postponeIdx].task)
      ) {
        postponeIdx++
      }
      if (postponeIdx < updatedBlocks.length) {
        updatedBlocks[postponeIdx].task = task
        updatedBlocks[postponeIdx].isRecentlyMoved = true
        affectedBlocks.push(updatedBlocks[postponeIdx].id)
        postponeIdx++
      }
    })
    
    // Update state
    setTimeBlocks(updatedBlocks)
    
    // Clear recently moved status after animation
    setTimeout(() => {
      setTimeBlocks(prev => prev.map(block => ({ ...block, isRecentlyMoved: false })))
    }, 2000)
    
    // Record the change for undo
    const change: TaskChange = {
      type: 'push',
      blockId: blockIds[0],
      oldTask: undefined,
      newTask: task,
      affectedBlocks,
      timestamp: new Date(),
    }
    setRecentChanges(prev => [change, ...prev.slice(0, 4)])
    
    // Show notification
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 3000)
  }

  const fillBlocksWithNumberedTasks = (blockIds: string[], task: any) => {
    const updatedBlocks = [...timeBlocks]
    const affectedBlocks: string[] = []
    
    // Compute baseTitle once for DB persistence and numbering
    const baseTitleAll = task.title.replace(/\d+$/, '').trim()

    // First, collect all existing tasks that need to be postponed
    const tasksToPostpone: Array<{ task: any; originalIndex: number }> = []
    const blockIndices = blockIds.map(id => updatedBlocks.findIndex(b => b.id === id)).filter(idx => idx !== -1)
    
    if (blockIndices.length === 0) return
    
    const minIndex = Math.min(...blockIndices)
    const maxIndex = Math.max(...blockIndices)
    
    // Collect tasks that need to be postponed from the target range
    for (let i = minIndex; i <= maxIndex; i++) {
      if (updatedBlocks[i].task && !blockIds.includes(updatedBlocks[i].id)) {
        continue // Skip blocks not in selection
      }
      if (updatedBlocks[i].task && !updatedBlocks[i].isPinned) {
        tasksToPostpone.push({
          task: updatedBlocks[i].task,
          originalIndex: i,
        })
      }
    }
    
    // Fill selected blocks with numbered versions of the dragged task
    let taskNumber = 1
    blockIds.forEach(blockId => {
      const blockIndex = updatedBlocks.findIndex(b => b.id === blockId)
      if (blockIndex !== -1) {
        if (updatedBlocks[blockIndex].isPinned) {
          return // do not overwrite pinned
        }
        // Create numbered task title
        const numberedTitle = `${baseTitleAll} #${taskNumber}`
        
        updatedBlocks[blockIndex].task = {
          ...task,
          id: `${task.id}-${taskNumber}`,
          title: numberedTitle,
        }
        updatedBlocks[blockIndex].isRecentlyMoved = true
        affectedBlocks.push(blockId)
        taskNumber++
      }
    })
    
    // Postpone original tasks to blocks after the filled range (skip pinned)
    let postponeIndex = maxIndex + 1
    tasksToPostpone.forEach(({ task }) => {
      // Find next available non-pinned empty block
      while (postponeIndex < updatedBlocks.length && (updatedBlocks[postponeIndex].isPinned || updatedBlocks[postponeIndex].task)) {
        postponeIndex++
      }
      
      if (postponeIndex < updatedBlocks.length) {
        updatedBlocks[postponeIndex].task = task
        updatedBlocks[postponeIndex].isRecentlyMoved = true
        affectedBlocks.push(updatedBlocks[postponeIndex].id)
        postponeIndex++
      }
    })
    
    // Update state
    setTimeBlocks(updatedBlocks)
    
    // Clear recently moved status after animation
    setTimeout(() => {
      setTimeBlocks(prev => prev.map(block => ({ ...block, isRecentlyMoved: false })))
    }, 2000)
    
    // Record the change for undo
    const change: TaskChange = {
      type: 'push',
      blockId: blockIds[0],
      affectedBlocks,
      timestamp: new Date(),
    }
    setRecentChanges(prev => [change, ...prev.slice(0, 4)])
    
    // Show notification
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 3000)
  }

  const startTimer = () => {
    setIsTimerRunning(true)
    const currentBlockId = getCurrentBlockId(currentTime || new Date())
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === currentBlockId ? { ...block, isActive: true } : { ...block, isActive: false })),
    )
  }

  const pauseTimer = () => {
    setIsTimerRunning(false)
  }

  const stopTimer = () => {
    setIsTimerRunning(false)
    setTimerSeconds(0)
    const currentBlockId = getCurrentBlockId(currentTime || new Date())
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === currentBlockId ? { ...block, isActive: false, isCompleted: true } : block)),
    )
  }

  const currentBlockId = getCurrentBlockId(currentTime || new Date())
  const currentBlock = timeBlocks.find((b) => b.id === currentBlockId)

  const getRemainingTime = (block: TimeBlock) => {
    const now = new Date()
    const [endHour, endMinute] = block.endTime.split(":").map(Number)
    const blockEnd = new Date()
    blockEnd.setHours(endHour, endMinute, 0, 0)

    const remaining = Math.max(0, Math.floor((blockEnd.getTime() - now.getTime()) / 1000))
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60

    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const handleQuickTaskSave = (taskTitle: string) => {
    if (!editingBlockId) return

    const blockIndex = getBlockIndex(editingBlockId)
    const blockStatus = getBlockTimeStatus(editingBlockId)
    const existingBlock = timeBlocks[blockIndex]
    const existingTask = existingBlock?.task

    const newTask = {
      id: `quick-${Date.now()}`,
      title: taskTitle,
      description: `Quick task: ${taskTitle}`,
      type: "custom" as const,
      color: "bg-blue-500",
      priority: "medium",
    }

    // For past blocks, just edit the specific block
    if (blockStatus === "past") {
      setTimeBlocks((prev) => prev.map((block) => (block.id === editingBlockId ? { ...block, task: newTask } : block)))

      const change: TaskChange = {
        type: "edit",
        blockId: editingBlockId,
        oldTask: existingTask,
        newTask,
        timestamp: new Date(),
      }
      setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

      // Phase 2: persist past edit to DB in supported modes
      if (isDbModeSupported) {
        const [hh, mm] = existingBlock.startTime.split(":").map((x) => parseInt(x, 10))
        const startMinute = hh * 60 + mm
        const endMinute = Math.min(startMinute + stepMinutes, 1440)
        const dateStr = toDateStrLocal(new Date())
        void postSetRange(dateStr, startMinute, endMinute, taskTitle)
          .then(() => refreshDbFrames())
          .catch(() => {})
      }
    } else {
      // For current and future blocks, push tasks forward if there's a change
      const isTaskChanged = !existingTask || existingTask.title !== taskTitle

      if (isTaskChanged && (blockStatus === "current" || blockStatus === "future")) {
        const { updatedBlocks, affectedBlocks } = pushTasksForward(blockIndex)

        // Set the new task in the edited block
        updatedBlocks[blockIndex].task = newTask

        setTimeBlocks(updatedBlocks)

        const change: TaskChange = {
          type: "push",
          blockId: editingBlockId,
          oldTask: existingTask,
          newTask,
          affectedBlocks,
          timestamp: new Date(),
        }
        setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

        // Show notification
        setShowChangeNotification(true)
        setTimeout(() => setShowChangeNotification(false), 3000)

        // Phase 2: persist to DB in supported modes
        if (isDbModeSupported) {
          const [hh, mm] = existingBlock.startTime.split(":").map((x) => parseInt(x, 10))
          const startMinute = hh * 60 + mm
          const endMinute = Math.min(startMinute + stepMinutes, 1440)
          const dateStr = toDateStrLocal(new Date())
          void postSetRange(dateStr, startMinute, endMinute, taskTitle)
            .then(() => refreshDbFrames())
            .catch(() => {})
        }
      } else {
        // No change needed, just update the task
        setTimeBlocks((prev) =>
          prev.map((block) => (block.id === editingBlockId ? { ...block, task: newTask } : block)),
        )

        // Phase 2: persist to DB as simple edit
        if (isDbModeSupported) {
          const [hh, mm] = existingBlock.startTime.split(":").map((x) => parseInt(x, 10))
          const startMinute = hh * 60 + mm
          const endMinute = Math.min(startMinute + stepMinutes, 1440)
          const dateStr = toDateStrLocal(new Date())
          void postSetRange(dateStr, startMinute, endMinute, taskTitle)
            .then(() => refreshDbFrames())
            .catch(() => {})
        }
      }
    }

    setShowQuickInput(false)
    setEditingBlockId(null)
  }

  // Toggle pin/unpin for a block (persisted in DB for supported modes)
  const togglePin = (blockId: string) => {
    setTimeBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, isPinned: !b.isPinned } : b)))
    if (isDbModeSupported) {
      const blk = timeBlocks.find((b) => b.id === blockId)
      if (!blk) return
      const [hh, mm] = blk.startTime.split(":").map((x) => parseInt(x, 10))
      const startMinute = hh * 60 + mm
      const dateStr = toDateStrLocal(new Date())
      const newPinned = !blk.isPinned
      void postPinRange(dateStr, startMinute, stepMinutes, newPinned)
        .then(() => refreshDbFrames())
        .catch(() => {})
    }
  }

  const handleQuickTaskDelete = () => {
    if (!editingBlockId) return

    const blockIndex = getBlockIndex(editingBlockId)
    const existingTask = timeBlocks[blockIndex]?.task

    // Simply delete the task from the specific block - no pushing forward
    setTimeBlocks((prev) => prev.map((block) => (block.id === editingBlockId ? { ...block, task: undefined } : block)))

    // Record the deletion for undo functionality
    const change: TaskChange = {
      type: "edit",
      blockId: editingBlockId,
      oldTask: existingTask,
      newTask: undefined,
      timestamp: new Date(),
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

    setShowQuickInput(false)
    setEditingBlockId(null)
  }

  const undoLastChange = () => {
    if (recentChanges.length === 0) return

    const lastChange = recentChanges[0]
    // Simple undo implementation - in a real app, you'd want more sophisticated undo/redo
    // For now, we'll just show the concept
    console.log("Undoing change:", lastChange)
    setRecentChanges((prev) => prev.slice(1))
  }

  const handleBlockDurationChange = (newDuration: number) => {
    // Snapshot current layout before switching
    prevBlocksRef.current = timeBlocks
    prevDurationRef.current = blockDurationMinutes
    setBlockDurationMinutes(newDuration)
    setShowDurationSelector(false)
    // Clear any existing tasks when changing duration to avoid confusion
    setRecentChanges([])
  }

  // Calculate grid columns based on block duration for better layout
  const getGridColumns = () => {
    // For 1-minute and 3-minute blocks, use exactly 10 columns as requested
    if (blockDurationMinutes === 1) return 10
    if (blockDurationMinutes === 3) return 10
    
    const blocksPerHour = 60 / blockDurationMinutes
    if (blocksPerHour <= 4) return 4
    if (blocksPerHour <= 6) return 6
    if (blocksPerHour <= 8) return 8
    return 12
  }

  const totalBlocks = timeBlocks.length
  const blocksPerHour = 60 / blockDurationMinutes

  // Voice alert function
  const speakTimeAlert = (message: string) => {
    console.log("Speaking:", message) // Debug log
    if ("speechSynthesis" in window) {
      // Cancel any existing speech
      speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 0.8

      // Add event listeners for debugging
      utterance.onstart = () => console.log("Speech started")
      utterance.onend = () => console.log("Speech ended")
      utterance.onerror = (e) => console.error("Speech error:", e)

      speechSynthesis.speak(utterance)
    } else {
      console.log("Speech synthesis not supported")
    }
  }

  // Handle block completion and show progress check
  const handleBlockCompletion = (completedBlock: TimeBlock, nextBlockId: string) => {
    console.log("handleBlockCompletion called:", { completedBlock: completedBlock.id, nextBlockId })

    // Stop current timer
    setIsTimerRunning(false)

    // Mark completed block as finished
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === completedBlock.id ? { ...block, isActive: false, isCompleted: true } : block)),
    )

    // Voice alert
    const now = new Date()
    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    const taskName = completedBlock.task?.title || "time block"
    // If upcoming block is pinned with a task, append the announcement
    const nextBlk = timeBlocks.find((b) => b.id === nextBlockId)
    const nextIsPinned = !!(nextBlk?.isPinned && nextBlk?.task)
    const nextTaskName = nextBlk?.task
      ? (nextBlk.goal?.label ? `${nextBlk.goal.label} : ${nextBlk.task.title}` : nextBlk.task.title)
      : undefined
    const extra = nextIsPinned && nextTaskName ? ` You determined to do ${nextTaskName} for now.` : ""
    speakTimeAlert(`Time block completed. Current time is ${timeString}. How did you do with ${taskName}?${extra}`)

    // Show progress check popup
    setCompletedBlockId(completedBlock.id)
    setShowProgressCheck(true)

    // Set 15-second auto-timeout
    const timeout = setTimeout(() => {
      handleProgressTimeout(nextBlockId)
    }, 15000)
    setProgressCheckTimer(timeout)
  }

  // Handle progress check responses
  const handleProgressDone = () => {
    if (progressCheckTimer) clearTimeout(progressCheckTimer)
    setShowProgressCheck(false)
    setCompletedBlockId(null)
    setProgressCheckTimer(null)

    // Start next block normally
    const currentBlockId = getCurrentBlockId(currentTime || new Date())
    setIsTimerRunning(true)
    setTimerSeconds(0)
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === currentBlockId ? { ...block, isActive: true } : { ...block, isActive: false })),
    )
  }

  // When current block is pinned: user wants to stick to the plan (do the pinned task now),
  // and delay the just-completed block's task to the next available non-pinned empty slot
  const handleProgressStickToPlan = () => {
    if (progressCheckTimer) clearTimeout(progressCheckTimer)
    if (!completedBlockId) return

    const currentId = getCurrentBlockId(currentTime || new Date())
    const currentIndex = getBlockIndex(currentId)
    const completedIndex = getBlockIndex(completedBlockId)
    const updated = [...timeBlocks]

    const completedTask = updated[completedIndex]?.task
    // Move the completed task to the next available non-pinned empty slot after the current block
    if (completedTask) {
      // Clear original (the past block) to reflect it was deferred
      updated[completedIndex].task = undefined
      let place = currentIndex + 1
      while (place < updated.length && (updated[place].isPinned || updated[place].task)) {
        place++
      }
      if (place < updated.length) {
        updated[place].task = { ...completedTask, id: `deferred-${Date.now()}` }
        updated[place].isRecentlyMoved = true
      }
      // Leave a marker in the past block indicating it was pushed to future
      updated[completedIndex].task = {
        ...completedTask,
        id: `note-${Date.now()}`,
        title: `${completedTask.title} + pushed to future`,
      }
    }

    setTimeBlocks(updated)

    // Persist: rename completed block label, and postpone its task by actual gap to next empty slot (mode-aware)
    if (isDbModeSupported && completedTask) {
      const dateStr = toDateStrLocal(new Date())
      const completedBlk = timeBlocks[completedIndex]
      const [ch, cm] = completedBlk.startTime.split(":").map((x) => parseInt(x, 10))
      const completedStart = ch * 60 + cm
      void postRenameRange(dateStr, completedStart, stepMinutes, `${completedTask.title} + pushed to future`).catch(() => {})
      // Find the same 'place' as in UI and compute delta
      let place = currentIndex + 1
      while (place < updated.length && (updated[place].isPinned || updated[place].task)) {
        place++
      }
      if (place < updated.length) {
        const [ph, pm] = updated[place].startTime.split(":").map((x) => parseInt(x, 10))
        const placeStart = ph * 60 + pm
        const delta = Math.max(placeStart - completedStart, stepMinutes)
        void postPostponeRange(dateStr, completedStart, stepMinutes, delta, false)
          .then(() => refreshDbFrames())
          .catch(() => {})
      } else {
        // No available place found in UI; skip postpone
        void refreshDbFrames()
      }
    }

    // Start next block (pinned planned task) normally
    setIsTimerRunning(true)
    setTimerSeconds(0)
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === currentId ? { ...block, isActive: true } : { ...block, isActive: false })),
    )

    setShowProgressCheck(false)
    setCompletedBlockId(null)
    setProgressCheckTimer(null)
  }

  const handleProgressStillDoing = (overrideTitle?: string) => {
    if (progressCheckTimer) clearTimeout(progressCheckTimer)
    if (!completedBlockId) return

    const completedBlock = timeBlocks.find((b) => b.id === completedBlockId)
    if (!completedBlock?.task) return

    // Continue with same task in next block and push all future tasks forward
    const currentBlockId = getCurrentBlockId(currentTime || new Date())
    const currentBlockIndex = getBlockIndex(currentBlockId)
    const completedBlockIndex = getBlockIndex(completedBlockId)

    let { updatedBlocks } = pushTasksForward(
      currentBlockIndex,
      1,
      // If current block is pinned, allow moving that specific pinned block forward
      timeBlocks[currentBlockIndex]?.isPinned ? { forceMovePinnedAtIndices: new Set([currentBlockIndex]) } : undefined
    )

    // If user said "I did <something> instead", rename the just completed block's task
    if (overrideTitle && completedBlockIndex >= 0 && updatedBlocks[completedBlockIndex]?.task) {
      updatedBlocks[completedBlockIndex] = {
        ...updatedBlocks[completedBlockIndex],
        task: {
          ...updatedBlocks[completedBlockIndex].task!,
          title: overrideTitle,
        },
      }
    }

    // Set the continued task in current block
    updatedBlocks[currentBlockIndex].task = {
      ...completedBlock.task,
      id: `continued-${Date.now()}`,
    }

    setTimeBlocks(updatedBlocks)

    // Show notification
    setNotificationType("rescheduled")
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 3000)

    // Record change
    const change: TaskChange = {
      type: "push",
      blockId: currentBlockId,
      oldTask: undefined,
      newTask: completedBlock.task,
      affectedBlocks: [],
      timestamp: new Date(),
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

    setShowProgressCheck(false)
    setCompletedBlockId(null)
    setProgressCheckTimer(null)

    // Start timer for continued task
    setIsTimerRunning(true)
    setTimerSeconds(0)
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === currentBlockId ? { ...block, isActive: true } : { ...block, isActive: false })),
    )
  }

  const handleProgressTimeout = (nextBlockId: string) => {
    console.log("handleProgressTimeout called:", { completedBlockId, nextBlockId, time: new Date().toISOString() })

    if (!completedBlockId) {
      console.log("No completedBlockId, returning early")
      return
    }

    const nextBlockIndex = getBlockIndex(nextBlockId)
    const completedBlockIndex = getBlockIndex(completedBlockId)

    // Step 1: Move all future tasks 2 blocks away (to make room for the undone task)
    // If the current (next) block is pinned, force-move it and transfer the pin
    const nextIsPinned = timeBlocks[nextBlockIndex]?.isPinned
    const { updatedBlocks } = pushTasksForward(
      nextBlockIndex,
      2,
      nextIsPinned ? { forceMovePinnedAtIndices: new Set([nextBlockIndex]) } : undefined
    )

    // Step 2: Move the completed block's task 2 blocks into the future (so user can restart where they left off)
    const completedBlock = updatedBlocks[completedBlockIndex]
    console.log("Completed block at index:", completedBlockIndex, "Task:", completedBlock?.task?.title)
    
    if (completedBlock?.task && 
        !completedBlock.task.title?.includes("Paused") && 
        !completedBlock.task.title?.includes("Disrupted") &&
        !completedBlock.task.title?.includes("Interrupted")) {
      
      // The target should be exactly 2 blocks after the current block (nextBlockIndex + 2)
      let targetIndex = nextBlockIndex + 2
      console.log("Moving completed task from index", completedBlockIndex, "to block index:", targetIndex)
      
      if (targetIndex < updatedBlocks.length) {
        // Store the task before clearing it
        const taskToMove = { ...completedBlock.task }
        
        // Clear the original position first
        const completedWasPinned = !!updatedBlocks[completedBlockIndex].isPinned
        updatedBlocks[completedBlockIndex].task = undefined
        if (completedWasPinned) {
          // Source no longer pinned; we'll pin the destination
          updatedBlocks[completedBlockIndex].isPinned = false
        }
        
        // Find nearest non-pinned empty slot at or after targetIndex
        while (
          targetIndex < updatedBlocks.length &&
          (updatedBlocks[targetIndex].isPinned || updatedBlocks[targetIndex].task)
        ) {
          targetIndex++
        }
        if (targetIndex < updatedBlocks.length) {
          updatedBlocks[targetIndex].task = {
            ...taskToMove,
            id: `rescheduled-${Date.now()}`,
          }
          updatedBlocks[targetIndex].isRecentlyMoved = true
          // If the completed block was pinned, transfer the pin to the destination
          if (completedWasPinned) {
            updatedBlocks[targetIndex].isPinned = true
          }
        }
        
        console.log("Task moved successfully from", completedBlockIndex, "to", targetIndex)
      } else {
        console.log("Target index", targetIndex, "is out of bounds")
      }
    } else {
      console.log("No valid task to reschedule:", completedBlock?.task?.title)
    }

    // Persist DB: postpone next block and completed block by 2 steps
    if (isDbModeSupported) {
      const dateStr = toDateStrLocal(new Date())
      const nextBlk = timeBlocks[nextBlockIndex]
      const compBlk = timeBlocks[completedBlockIndex]
      if (nextBlk && compBlk) {
        const [nH, nM] = nextBlk.startTime.split(":").map((x) => parseInt(x, 10))
        const [cH, cM] = compBlk.startTime.split(":").map((x) => parseInt(x, 10))
        const nextStart = nH * 60 + nM
        const compStart = cH * 60 + cM
        void postPostponeRange(dateStr, nextStart, stepMinutes, 2 * stepMinutes, !!nextIsPinned).catch(() => {})
        void postPostponeRange(dateStr, compStart, stepMinutes, 2 * stepMinutes, false)
          .then(() => refreshDbFrames())
          .catch(() => {})
      }
    }

    // Step 3: Mark the completed block as "Interrupted"
    if (completedBlockIndex >= 0 && completedBlockIndex < updatedBlocks.length) {
      updatedBlocks[completedBlockIndex] = {
        ...updatedBlocks[completedBlockIndex],
        isActive: false,
        isCompleted: false,
        task: {
          id: `interrupted-${Date.now()}`,
          title: "Interrupted - No Response",
          type: "custom",
          color: "bg-red-500",
        },
      }
    }

    // Step 4: Mark the current block as "Paused"
    updatedBlocks[nextBlockIndex].task = {
      id: `paused-${Date.now()}`,
      title: "Paused - Previous Interruption",
      type: "custom",
      color: "bg-gray-500",
    }

    setTimeBlocks(updatedBlocks)

    // Voice alert
    speakTimeAlert(
      "No response detected. Previous block marked as interrupted. Current block marked as paused. All future tasks delayed by 2 blocks.",
    )

    // Show notification
    setNotificationType("disrupted")
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 5000)

    // Record the change for undo functionality
    const change: TaskChange = {
      type: "push",
      blockId: completedBlockId,
      oldTask: completedBlock?.task,
      newTask: {
        id: `interrupted-${Date.now()}`,
        title: "Interrupted - No Response",
        type: "custom",
        color: "bg-red-500",
      },
      affectedBlocks: [nextBlockId],
      timestamp: new Date(),
    }
    setRecentChanges((prev) => [change, ...prev.slice(0, 4)])

    setShowProgressCheck(false)
    setCompletedBlockId(null)
    setProgressCheckTimer(null)

    // Don't auto-start timer for paused block
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Drag Mode Instructions */}
        {dragState.isDragging && (
          <div className={`mb-4 p-3 rounded-lg animate-pulse ${
            dragState.isExpandMode 
              ? 'bg-purple-100 border border-purple-300' 
              : 'bg-blue-100 border border-blue-300'
          }`}>
            <div className="flex items-center gap-2">
              {dragState.isExpandMode ? (
                <>
                  <span className="text-purple-800 font-semibold">📋 Expand Mode:</span>
                  <span className="text-purple-700">
                    Drag to future blocks to fill them with "{dragState.task?.title}" (numbered 2, 3, 4...)
                    Existing tasks will be postponed.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-blue-800 font-semibold">↔️ Simple Move Mode:</span>
                  <span className="text-blue-700">
                    Drop on any future block to move "{dragState.task?.title}" there.
                    If occupied, that task will be postponed.
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time Tracker</h1>
            <p className="text-gray-600">
              {currentTime ? `${currentTime.toLocaleDateString()} - ${currentTime.toLocaleTimeString()}` : 'Loading...'}
            </p>
            <p className="text-xs text-gray-400">
              Current Block: {currentBlockId} | Timer: {isTimerRunning ? "ON" : "OFF"} | Popup:{" "}
              {showProgressCheck ? "OPEN" : "CLOSED"}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              💡 Tip: Drag to move tasks | Use expand button (⬇️) for multi-block planning!
            </p>
          </div>
          <div className="flex gap-2">
            {recentChanges.length > 0 && (
              <Button variant="outline" onClick={undoLastChange} className="flex items-center gap-2 bg-transparent">
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowVoiceInterface(true)} className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Voice Assistant
            </Button>
            <Button variant="outline" onClick={() => setShowNotionTasks(true)} className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Notion Tasks
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                              const testBlock = timeBlocks.find((b) => b.id === getCurrentBlockId(currentTime || new Date()))
              if (testBlock) {
                handleBlockCompletion(testBlock, getCurrentBlockId(currentTime || new Date()))
                }
              }}
              className="flex items-center gap-2 bg-red-100"
            >
              Test Popup
            </Button>
          </div>
        </div>

        {/* Daily Goals (Glass/Silver) */}
        <DailyGoals />

        {/* Block Duration Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <span>Time Block Settings</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{totalBlocks} blocks total</span>
                <span>{blocksPerHour} blocks/hour</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Block Duration:</span>
              </div>
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowDurationSelector(!showDurationSelector)}
                  className="flex items-center gap-2 min-w-32"
                >
                  <span className="font-medium">{blockDurationMinutes} minutes</span>
                  <span className="text-xs text-gray-500">
                    ({blockDurationOptions.find((opt) => opt.value === blockDurationMinutes)?.description})
                  </span>
                </Button>

                {showDurationSelector && (
                  <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-80">
                    <div className="p-2">
                      <div className="text-xs font-medium text-gray-500 mb-2 px-2">Choose your time block size:</div>
                      {blockDurationOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => handleBlockDurationChange(option.value)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors",
                            blockDurationMinutes === option.value ? "bg-blue-50 border border-blue-200" : "",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-gray-500">{option.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Current block: {currentBlock?.startTime} - {currentBlock?.endTime}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Notification */}
        {showChangeNotification && (
          <Card
            className={cn(
              "border-2",
              notificationType === "disrupted"
                ? "border-red-500 bg-red-50"
                : notificationType === "paused"
                  ? "border-gray-500 bg-gray-50"
                  : "border-blue-500 bg-blue-50",
            )}
          >
            <CardContent className="p-4">
              <div
                className={cn(
                  "flex items-center gap-2",
                  notificationType === "disrupted"
                    ? "text-red-700"
                    : notificationType === "paused"
                      ? "text-gray-700"
                      : "text-blue-700",
                )}
              >
                <ArrowRight className="h-4 w-4" />
                <span className="font-medium">
                  {notificationType === "disrupted"
                    ? "Block marked as disrupted"
                    : notificationType === "paused"
                      ? "Session paused due to absence"
                      : "Tasks automatically rescheduled"}
                </span>
                <span className="text-sm">
                  {notificationType === "disrupted"
                    ? "Previous block disrupted, current block paused, all tasks rescheduled"
                    : notificationType === "paused"
                      ? "Manual intervention required to resume"
                      : "Future tasks moved forward to accommodate changes"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timer Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Current Session</span>
              <div className="text-2xl font-mono">{formatTime(timerSeconds)}</div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {currentBlock?.task ? (
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-lg">{currentBlock.task.title}</span>
                    <div className="text-xl font-mono font-bold text-blue-600">
                      {getRemainingTime(currentBlock)}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-lg">No task assigned</span>
                    <div className="text-xl font-mono font-bold text-blue-600">
                      {currentBlock ? getRemainingTime(currentBlock) : "0:00"}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {!isTimerRunning ? (
                  <Button onClick={startTimer} className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Start Focus
                  </Button>
                ) : (
                  <Button onClick={pauseTimer} variant="outline" className="flex items-center gap-2 bg-transparent">
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                )}
                <Button onClick={stopTimer} variant="destructive" className="flex items-center gap-2">
                  <Square className="h-4 w-4" />
                  Complete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                24-Hour Time Grid ({blockDurationMinutes}-minute blocks)
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-8" onClick={exportTodayCsv}>Export CSV</Button>
                {planningMode.isActive && (
                  <Badge className="bg-purple-500 text-white animate-pulse">
                    Selecting {planningMode.selectedBlocks.length} blocks for planning
                  </Badge>
                )}
                {bulkMove.active && (
                  <Badge className="bg-blue-500 text-white animate-pulse">Pick destination start block…</Badge>
                )}
                <Button
                  variant={multiSelect.isActive ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setMultiSelect((prev) => ({ ...prev, isActive: !prev.isActive }))}
                >
                  {multiSelect.isActive ? "Exit Select" : "Select"}
                </Button>
                {multiSelect.selected.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{multiSelect.selected.length} selected</Badge>
                    {/* Goal assignment buttons */}
                    {goalOptions.map((g) => (
                      <Button key={g.id} size="sm" variant="outline" className="h-8" onClick={() => assignGoalToSelected(g.id)}>
                        {g.label}
                      </Button>
                    ))}
                    <Button size="sm" variant="secondary" className="h-8" onClick={clearGoalFromSelected}>Clear Goal</Button>
                    <Button size="sm" className="h-8" onClick={startBulkMove}>Move</Button>
                    <Button size="sm" variant="destructive" className="h-8" onClick={bulkDeleteSelected}>Delete</Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={clearSelection}>Cancel</Button>
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-2 max-h-[600px] overflow-y-auto p-2 pl-12`}
              style={{ gridTemplateColumns: `repeat(${getGridColumns()}, minmax(0, 1fr))` }}
            >
              {timeBlocks.map((block, index) => {
                const isCurrentBlock = block.id === currentBlockId
                const blockStatus = getBlockTimeStatus(block.id)
                const hour = Math.floor(index / 6)
                const currentGradient = aiGradients[gradientIndex]

                const isInPlanningSelection = planningMode.isActive && planningMode.selectedBlocks.includes(block.id)
                const isSelected = multiSelect.selected.includes(block.id)
                const isPlanningSource = dragState.sourceBlockId === block.id
                const isSimpleDragTarget = !dragState.isExpandMode && dragState.isDragging && planningMode.selectedBlocks.includes(block.id)

                return (
                  <div key={block.id} className="relative">
                    <div
                      draggable={!!block.task && !dragState.isDragging && !block.isPinned}
                      onDragStart={(e) => handleDragStart(e, block, false)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, block)}
                      onDrop={(e) => handleDrop(e, block)}
                      onClick={(e) => handleBlockClick(block.id, e)}
                      className={cn(
                        "p-2 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between relative",
                        // Make blocks square-ish to match width while keeping columns the same
                        blockDurationMinutes === 3 ? "aspect-square p-1" : "aspect-square p-2",
                        {
                          "cursor-move": block.task && !isCurrentBlock,
                          "cursor-pointer": !block.task || isCurrentBlock,
                          [`bg-gradient-to-br ${currentGradient} border-transparent text-white shadow-xl`]:
                            isCurrentBlock,
                          "bg-green-100 border-green-300": block.isCompleted && !isCurrentBlock && !isInPlanningSelection,
                          "bg-yellow-100 border-yellow-300 animate-pulse": block.isActive && !isCurrentBlock && !isInPlanningSelection,
                          "bg-red-100 border-red-300": block.task?.title?.includes("Disrupted") && !isCurrentBlock && !isInPlanningSelection,
                          "bg-gray-100 border-gray-400": block.task?.title?.includes("Paused") && !isCurrentBlock && !isInPlanningSelection,
                          "bg-gray-50 border-gray-200 hover:bg-gray-100":
                            !block.task && !isCurrentBlock && !block.isActive && !block.isCompleted && !isInPlanningSelection,
                          "bg-orange-100 border-orange-300 animate-bounce": block.isRecentlyMoved && !isInPlanningSelection && !isSimpleDragTarget,
                          "bg-purple-200 border-purple-500 border-4 shadow-lg": isInPlanningSelection && dragState.isExpandMode,
                          "border-yellow-300 border-2 ring-2 ring-yellow-200": isSelected,
                          // Visual hint when pinned
                          "ring-2 ring-sky-300": block.isPinned,
                        },
                        block.task?.color &&
                          !isCurrentBlock &&
                          !block.isActive &&
                          !block.isCompleted &&
                          !block.task?.title?.includes("Disrupted") &&
                          !block.task?.title?.includes("Paused") &&
                          !isInPlanningSelection
                          ? `${block.task.color} text-white`
                          : "",
                      )}
                      style={{
                        animation: isCurrentBlock
                          ? "breathe 2s ease-in-out infinite, star-glow 1s ease-in-out infinite"
                          : block.isRecentlyMoved
                            ? "slide-in 0.5s ease-out"
                            : isInPlanningSelection
                              ? "pulse 1s ease-in-out infinite"
                              : undefined,
                        boxShadow: isCurrentBlock
                          ? "0 0 30px rgba(59, 130, 246, 0.6), 0 0 60px rgba(147, 51, 234, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.1)"
                          : isInPlanningSelection
                            ? "0 0 15px rgba(147, 51, 234, 0.5)"
                            : undefined,
                      }}
                      title={`${block.startTime} - ${block.endTime}${block.task ? `: ${block.task.title}` : ""} (${blockStatus})${block.isPinned ? " [PINNED]" : ""}${isInPlanningSelection ? " - SELECTED FOR PLANNING" : ""}`}
                    >
                      {/* Pin toggle */}
                      <button
                        className="absolute top-1 right-1 z-10 rounded p-1 hover:bg-black/10"
                        onClick={(e) => { e.stopPropagation(); togglePin(block.id) }}
                        title={block.isPinned ? "Unpin (allow auto-move)" : "Pin (prevent auto-move)"}
                      >
                        {block.isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                      </button>
                      {/* Hour/row label gutter on the left */}
                      {(() => {
                        const [hh, mm] = block.startTime.split(":").map(Number)
                        // For 1-minute mode: label each 10-minute row as HH.1..HH.6
                        if (blockDurationMinutes === 1) {
                          if (mm % 10 === 0) {
                            const segment = Math.floor(mm / 10) + 1 // 0->1,10->2,...,50->6
                            return (
                              <div className="absolute -left-12 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] sm:text-xs select-none">
                                {`${hh.toString().padStart(2, "0")}.${segment}`}
                              </div>
                            )
                          }
                          return null
                        }
                        // Other modes: show plain hour on the first minute of the hour
                        if (mm === 0) {
                          return (
                            <div className="absolute -left-10 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs sm:text-sm select-none">
                              {hh.toString().padStart(2, "0")}
                            </div>
                          )
                        }
                        return null
                      })()}
                      {/* Goal tag on top of block with glassmorphism */}
                      {block.goal && (
                        <div
                          className={cn(
                            "absolute -top-2 left-2 px-3 py-1 rounded-md shadow-md",
                            // Stronger, more visible goal tag backgrounds by goal id
                            block.goal.id === 'goal_1' && 'bg-amber-500',
                            block.goal.id === 'goal_2' && 'bg-emerald-500',
                            block.goal.id === 'goal_3' && 'bg-indigo-500'
                          )}
                          title={`Assigned Goal: ${block.goal.label}`}
                        >
                          <span className="text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow">{block.goal.label}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span
                            className={cn(
                              isCurrentBlock
                                ? (blockDurationMinutes === 3 ? "text-sm" : "text-lg") + " text-white font-bold"
                                : blockDurationMinutes === 3 ? "text-[10px] text-gray-600" : "text-xs text-gray-600",
                              // Make future blocks with a task show white time text for visibility
                              (!isCurrentBlock && blockStatus === 'future' && !!block.task) ? 'text-white' : '',
                              // Push time text down: default a bit lower; even more for 1- and 3-minute modes
                              'inline-block',
                              (blockDurationMinutes === 1 || blockDurationMinutes === 3) ? 'mt-5' : 'mt-2'
                            )}
                          >
                            {isCurrentBlock 
                              ? getRemainingTime(block)
                              : blockDurationMinutes === 3 ? block.startTime : `${block.startTime} - ${block.endTime}`
                            }
                          </span>
                        </div>
                      </div>
                      {block.task && (
                        <>
                          <div
                            className={cn(
                              "absolute left-2 right-3",
                              // Start task text at the vertical middle so it can flow downward into bottom half
                              "top-1/2"
                            )}
                          >
                            <p
                              className={cn(
                                blockDurationMinutes === 3 ? "text-xs font-medium" : "text-sm font-medium",
                                (isCurrentBlock || isInPlanningSelection || (blockStatus === 'future' && !!block.task)) ? "text-white" : "text-gray-900",
                                // Allow multi-line wrap and tighter leading
                                "leading-snug break-words"
                              )}
                            >
                              {block.task.title}
                            </p>
                          </div>
                          {/* Expand Corner Indicator */}
                          {blockStatus !== 'past' && (
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation()
                                handleDragStart(e, block, true)
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation()
                                handleDragEnd()
                              }}
                              className={cn(
                                "absolute bottom-0 right-0 w-3 h-3 cursor-move transition-all z-10",
                                "border-l-4 border-t-4 border-gray-400 hover:border-purple-500",
                                isCurrentBlock && "border-white/60 hover:border-white"
                              )}
                              title="Drag to expand task across multiple blocks"
                            />
                          )}
                        </>
                      )}
                      {!block.task && (
                        <div
                          className={cn(
                            "text-center transition-all duration-300",
                            blockDurationMinutes === 3 ? "text-[10px]" : "text-xs",
                            isCurrentBlock ? "text-white opacity-80" : "text-gray-400",
                          )}
                        >
                          {blockDurationMinutes === 3 ? "+" : "Click to add task"}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Task Selector Modal */}
        {showTaskSelector && selectedBlock && (
          <TaskSelector
            isOpen={showTaskSelector}
            onClose={() => {
              setShowTaskSelector(false)
              setSelectedBlock(null)
            }}
            onTaskSelect={(task) => handleTaskAssign(task, selectedBlock)}
            blockTime={timeBlocks.find((b) => b.id === selectedBlock) || undefined}
          />
        )}

        {/* Voice Interface Modal */}
        {showVoiceInterface && (
          <VoiceInterface
            isOpen={showVoiceInterface}
            onClose={() => setShowVoiceInterface(false)}
            onTaskCreate={(task) => {
              if (selectedBlock) {
                handleTaskAssign(task, selectedBlock)
              }
            }}
          />
        )}

        {/* Notion Tasks Modal */}
        {showNotionTasks && (
          <NotionTasks
            isOpen={showNotionTasks}
            onClose={() => setShowNotionTasks(false)}
            onTaskSelect={(task) => {
              if (selectedBlock) {
                handleTaskAssign(task, selectedBlock)
              }
            }}
          />
        )}
        {/* Quick Task Input */}
        <QuickTaskInput
          isOpen={showQuickInput}
          onClose={() => {
            setShowQuickInput(false)
            setEditingBlockId(null)
          }}
          onSave={handleQuickTaskSave}
          onDelete={handleQuickTaskDelete}
          position={quickInputPosition}
          initialValue={editingBlockId ? timeBlocks.find((b) => b.id === editingBlockId)?.task?.title || "" : ""}
          isEditing={!!editingBlockId && !!timeBlocks.find((b) => b.id === editingBlockId)?.task}
        />
                {/* Progress Check Popup */}
        {showProgressCheck && (
          <ProgressCheckPopup
            isOpen={showProgressCheck}
            completedBlock={(() => {
              const b = completedBlockId ? timeBlocks.find((x) => x.id === completedBlockId) : null
              if (!b) return null
              return {
                id: b.id,
                startTime: b.startTime,
                endTime: b.endTime,
                task: b.task
                  ? { title: b.task.title, type: b.task.type, color: b.task.color }
                  : undefined,
                goal: b.goal
                  ? { id: b.goal.id, label: b.goal.label, color: b.goal.color }
                  : undefined,
              }
            })()}
            onDone={handleProgressDone}
            onStillDoing={handleProgressStillDoing}
            onStickToPlan={handleProgressStickToPlan}
            onTimeout={() => handleProgressTimeout(getCurrentBlockId(currentTime || new Date()))}
            onClose={() => handleProgressTimeout(getCurrentBlockId(currentTime || new Date()))}
            isCurrentPinned={(() => {
              const currId = getCurrentBlockId(currentTime || new Date())
              const blk = timeBlocks.find((b) => b.id === currId)
              return !!(blk?.isPinned && blk?.task)
            })()}
            currentPinnedTaskTitle={(() => {
              const currId = getCurrentBlockId(currentTime || new Date())
              const blk = timeBlocks.find((b) => b.id === currId)
              if (!blk?.task) return undefined
              return blk.goal?.label ? `${blk.goal.label} : ${blk.task.title}` : blk.task.title
            })()}
          />
        )}
      </div>
    </div>
  )
}
