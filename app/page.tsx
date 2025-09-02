"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Play, Pause, Square, Mic, Calendar, Database, ArrowRight, Undo2, Clock, Settings, Pin, PinOff, ListChecks, MoonStar } from "lucide-react"
import { cn } from "@/lib/utils"
import TaskSelector from "@/components/task-selector"
import VoiceInterface from "@/components/voice-interface"
import NotionTasks from "@/components/notion-tasks"
import QuickTaskInput from "@/components/quick-task-input"
import ProgressCheckPopup from "@/components/progress-check-popup"
import DailyGoals from "@/components/daily-goals"
import NestedTodosPanel from "@/components/nested-todos-panel"
import ActiveWindowSetup from "@/components/active-window-setup"

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

  // Nested todos side panel
  const [showNestedTodos, setShowNestedTodos] = useState(true)

  // Drag and drop state for planning feature
  const [dragState, setDragState] = useState<DragState>({
    sourceBlockId: null,
    task: null,
    isDragging: false,
    isExpandMode: false,
  })

  // Manually trigger the next upcoming half-hour alert (for testing)
  const triggerNextHalfHourAlert = async () => {
    try {
      const now = new Date()
      const m = now.getMinutes()
      const hh = now.getHours()
      await playJoyfulChime()
      // Respect popup gating to simulate real behavior
      if (showProgressCheck) return
      
      // Calculate progress information using component-scoped variables
      const passedBlocks = activePassedBlocks || 0
      const leftBlocks = activeLeftBlocks || 0
      const passedTime = blocksToTime(passedBlocks)
      const leftTime = blocksToTime(leftBlocks)
      
      if (m < 29) {
        const targetHour = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
        const targetPeriod = hh < 12 ? 'AM' : 'PM'
        const target = `${targetHour}:30 ${targetPeriod}`
        const text = `cheer up, it's almost ${target}`
        const progressText = passedBlocks > 0 || leftBlocks > 0 
          ? `. ${passedBlocks} blocks, ${passedTime} passed, ${leftBlocks} blocks, ${leftTime} left for today`
          : ''
        const fullText = text + progressText
        maybeShowSystemNotification(fullText)
        await playMaleTts(fullText)
      } else {
        const nextHour = (hh + 1) % 24
        const targetHour = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour
        const targetPeriod = nextHour < 12 ? 'AM' : 'PM'
        const target = `${targetHour} ${targetPeriod}`
        const text = `cheer up, it's almost ${target}`
        const progressText = passedBlocks > 0 || leftBlocks > 0 
          ? `. ${passedBlocks} blocks, ${passedTime} passed, ${leftBlocks} blocks, ${leftTime} left for today`
          : ''
        const fullText = text + progressText
        maybeShowSystemNotification(fullText)
        await playMaleTts(fullText)
      }
    } catch {}
  }

  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>({
    isActive: false,
    startBlockId: null,
    endBlockId: null,
    selectedBlocks: [],
    taskToFill: null,
  })
  // Half-hour voice alerts (male TTS) toggle
  const [enableHalfHourAlerts, setEnableHalfHourAlerts] = useState(false)
  const lastHalfHourAnnouncedRef = useRef<string | null>(null)
  // Keep a mirror of 1-minute blocks for the full day. This lets us:
  // - Sync any 30/3-minute edits downward into 1-minute resolution
  // - Use 1-minute edits locally without affecting higher-level modes
  const oneMinuteMirrorRef = useRef<TimeBlock[]>([])
  // Guard to avoid clobbering 1-min mirror during mode switches
  const isSwitchingModeRef = useRef<boolean>(false)
  // Snapshots for restoring exact state when returning to a mode
  const snapshot30Ref = useRef<TimeBlock[]>([])
  const snapshot3Ref = useRef<TimeBlock[]>([])
  const [lastAssignedGoalId, setLastAssignedGoalId] = useState<string | null>(null)
  // Active window (for dark/inactive hours)
  const [activeWindow, setActiveWindow] = useState<{ activeStartMinute: number | null; activeEndMinute: number | null } | null>(null)
  const [showActiveWindowSetup, setShowActiveWindowSetup] = useState(false)


  // Multi-select and bulk move state
  const [multiSelect, setMultiSelect] = useState<{ isActive: boolean; selected: string[]; lastAnchorId: string | null }>({
    isActive: false,
    selected: [],
    lastAnchorId: null,
  })
  const [bulkMove, setBulkMove] = useState<{ active: boolean }>({ active: false })

  // Block duration options
  const blockDurationOptions: BlockDurationOption[] = [
    { value: 1, label: "1 min", description: "1440 blocks/day - Ultra micro focus" },
    { value: 3, label: "3 min", description: "480 blocks/day - Micro focus" },
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

  // Handle assignment from Breakdown Drawer
  const assignBreakdownToSelection = (items: Array<{ title: string }>) => {
    if (!items || items.length === 0) return
    const targets = multiSelect.selected.length > 0
      ? [...multiSelect.selected]
      : (selectedBlock ? [selectedBlock] : [])

    if (targets.length === 0) return

    const updated = [...timeBlocks]
    const affected: string[] = []
    let assignedCount = 0

    for (let i = 0; i < targets.length && i < items.length; i++) {
      const blockId = targets[i]
      const idx = updated.findIndex(b => b.id === blockId)
      if (idx === -1) continue
      // Skip past or pinned blocks
      const status = getBlockTimeStatus(blockId)
      if (status === 'past' || updated[idx].isPinned) continue

      const item = items[i]
      updated[idx].task = {
        id: `bd-${Date.now()}-${i}`,
        title: item.title || `Task ${i+1}`,
        type: 'custom',
        color: updated[idx].task?.color || 'bg-blue-500',
      }
      updated[idx].isRecentlyMoved = true
      affected.push(blockId)
      assignedCount++
    }

    if (assignedCount === 0) return

    setTimeBlocks(updated)
    setTimeout(() => {
      setTimeBlocks(prev => prev.map(b => ({ ...b, isRecentlyMoved: false })))
    }, 1500)

    const change: TaskChange = {
      type: 'edit',
      blockId: affected[0],
      timestamp: new Date(),
      affectedBlocks: affected,
    }
    setRecentChanges(prev => [change, ...prev.slice(0, 4)])
    setNotificationType('rescheduled')
    setShowChangeNotification(true)
    setTimeout(() => setShowChangeNotification(false), 2000)
  }

  useEffect(() => {
    const onAssign = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { items?: Array<{ title: string }> }
        if (detail?.items) assignBreakdownToSelection(detail.items)
      } catch {}
    }
    const onGetSelected = () => {
      try {
        const ids = multiSelect.selected.length > 0 ? [...multiSelect.selected] : (selectedBlock ? [selectedBlock] : [])
        const details = ids.map(id => {
          const b = timeBlocks.find(tb => tb.id === id)
          return { id, startTime: b?.startTime, endTime: b?.endTime }
        })
        window.dispatchEvent(new CustomEvent('selectedBlocks', { detail: { ids, details } }))
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('assignBreakdownToSelection', onAssign as EventListener)
      window.addEventListener('getSelectedBlocks', onGetSelected as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('assignBreakdownToSelection', onAssign as EventListener)
        window.removeEventListener('getSelectedBlocks', onGetSelected as EventListener)
      }
    }
  }, [multiSelect.selected, selectedBlock, timeBlocks])

  const goalOptions: { id: string; label: string; color: string }[] = [
    { id: 'goal_1', label: dailyGoals[0] || 'Goal 1', color: 'bg-amber-200 text-amber-900' },
    { id: 'goal_2', label: dailyGoals[1] || 'Goal 2', color: 'bg-emerald-200 text-emerald-900' },
    { id: 'goal_3', label: dailyGoals[2] || 'Goal 3', color: 'bg-indigo-200 text-indigo-900' },
  ]

  // Calendar events: none by default (no placeholders).
  // Integrations or user actions should populate this state.
  const [calendarEvents] = useState<CalendarEvent[]>([])

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

    // Restore from snapshots when available; otherwise apply propagation rules
    try {
      const prevDuration = prevDurationRef.current
      // 1) If entering 30-min mode, restore from 30-min snapshot (authoritative)
      if (blockDurationMinutes === 30 && snapshot30Ref.current.length) {
        const byStart = new Map(snapshot30Ref.current.map((b) => [b.startTime, b]))
        blocks.forEach((b, i) => {
          const snap = byStart.get(b.startTime)
          if (snap) {
            blocks[i] = { ...b, task: snap.task ? { ...snap.task } : undefined, goal: snap.goal ? { ...snap.goal } : undefined, isPinned: !!snap.isPinned, isCompleted: !!snap.isCompleted }
          }
        })
      }

      // 2) If entering 3-min mode, restore from 3-min snapshot if present 
      // BUT only if we're not coming from 30-minute mode (prioritize 30->3 propagation)
      if (blockDurationMinutes === 3 && snapshot3Ref.current.length && prevDurationRef.current !== 30) {
        const byStart = new Map(snapshot3Ref.current.map((b) => [b.startTime, b]))
        blocks.forEach((b, i) => {
          const snap = byStart.get(b.startTime)
          if (snap) {
            blocks[i] = { ...b, task: snap.task ? { ...snap.task } : undefined, goal: snap.goal ? { ...snap.goal } : undefined, isPinned: !!snap.isPinned, isCompleted: !!snap.isCompleted }
          }
        })
      }
      // When switching into 1-minute mode and we have a mirror, prefer using the mirror content
      if (blockDurationMinutes === 1 && oneMinuteMirrorRef.current.length) {
        const toMin = (hhmm: string) => {
          const [h, m] = hhmm.split(":").map(Number)
          return h * 60 + m
        }
        for (let i = 0; i < blocks.length; i++) {
          const startMin = toMin(blocks[i].startTime)
          const mirror = oneMinuteMirrorRef.current[startMin]
          if (mirror) {
            blocks[i].task = mirror.task ? { ...mirror.task } : undefined
            blocks[i].goal = mirror.goal ? { ...mirror.goal } : undefined
            blocks[i].isPinned = !!mirror.isPinned
            blocks[i].isCompleted = !!mirror.isCompleted
          }
        }
      }
      // 2b) If entering 1-minute mode but mirror is empty, propagate from previous 30-min blocks
      if (
        prevDuration === 30 &&
        blockDurationMinutes === 1 &&
        prevBlocksRef.current.length &&
        oneMinuteMirrorRef.current.length === 0
      ) {
        const toMin = (hhmm: string) => {
          const [h, m] = hhmm.split(":").map(Number)
          return h * 60 + m
        }
        const newStarts = blocks.map((b) => toMin(b.startTime))
        for (const prev of prevBlocksRef.current) {
          const pStart = toMin(prev.startTime)
          const pEnd = toMin(prev.endTime)
          const hasContent = !!prev.task || !!prev.goal
          if (!hasContent) continue
          for (let i = 0; i < blocks.length; i++) {
            const ns = newStarts[i]
            if (ns >= pStart && ns < pEnd) {
              if (!blocks[i].task && prev.task) {
                blocks[i].task = { ...prev.task }
                // Propagate pin when the task is copied from 30-min block
                if (prev.isPinned) blocks[i].isPinned = true
              }
              if (!blocks[i].goal && prev.goal) {
                blocks[i].goal = { ...prev.goal }
              }
            }
          }
        }
      }
      // 3) Fallback: if we just changed from 30-minute mode to a smaller mode, propagate tasks/goals/pins
      // This now takes priority over restoring old snapshots when coming from 30-minute mode
      if (prevDuration === 30 && blockDurationMinutes < 30 && prevBlocksRef.current.length && blockDurationMinutes !== 1) {
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
              if (!blocks[i].task && prev.task) {
                blocks[i].task = { ...prev.task }
                // Propagate pin when the task is copied from 30-min block
                if (prev.isPinned) blocks[i].isPinned = true
              }
              if (!blocks[i].goal && prev.goal) {
                blocks[i].goal = { ...prev.goal }
              }
            }
          }
        }
      }

      // Policy: Do NOT aggregate changes from smaller modes back into 30-minute blocks.
      // Rationale: 30-min blocks represent the high-level plan and only change when edited in 30-min mode.
      // Therefore, when returning to 30-minute mode, leave blocks as-is (DB/state preserves prior 30-min values).
    } catch (e) {
      console.warn("Remap from 30-min to smaller failed:", e)
    }

    console.log("Generated time blocks:", blocks.length, "blocks")
    setTimeBlocks(blocks)
  }, [calendarEvents, blockDurationMinutes])

  // Keep 1-minute mirror in sync with current view's edits
  useEffect(() => {
    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number)
      return h * 60 + m
    }

    const totalMinutesInDay = 24 * 60
    // Initialize full-day mirror if needed
    if (oneMinuteMirrorRef.current.length !== totalMinutesInDay) {
      const arr: TimeBlock[] = []
      for (let m = 0; m < totalMinutesInDay; m++) {
        const hh = Math.floor(m / 60).toString().padStart(2, '0')
        const mm = (m % 60).toString().padStart(2, '0')
        const start = `${hh}:${mm}`
        const endMin = m + 1
        const eh = Math.floor(endMin / 60).toString().padStart(2, '0')
        const em = (endMin % 60).toString().padStart(2, '0')
        arr.push({
          id: `m${m}`,
          startTime: start,
          endTime: `${eh}:${em}`,
          isActive: false,
          isCompleted: false,
          isPinned: false,
        } as TimeBlock)
      }
      oneMinuteMirrorRef.current = arr
    }

    if (blockDurationMinutes === 1) {
      // In 1-minute mode, mirror equals current blocks
      for (const b of timeBlocks) {
        const idx = toMin(b.startTime)
        if (oneMinuteMirrorRef.current[idx]) {
          oneMinuteMirrorRef.current[idx] = { ...oneMinuteMirrorRef.current[idx], task: b.task ? { ...b.task } : undefined, goal: b.goal ? { ...b.goal } : undefined, isPinned: !!b.isPinned, isCompleted: !!b.isCompleted }
        }
      }
      return
    }

    // If we just switched modes, skip one downsync cycle to preserve prior 1-min edits
    if (isSwitchingModeRef.current) {
      isSwitchingModeRef.current = false
      return
    }

    // In 3- or 30-minute modes, push changes down to all covered 1-minute blocks
    for (const b of timeBlocks) {
      const start = toMin(b.startTime)
      const end = toMin(b.endTime)
      for (let m = start; m < end; m++) {
        const mirror = oneMinuteMirrorRef.current[m]
        if (!mirror) continue
        mirror.task = b.task ? { ...b.task } : undefined
        mirror.goal = b.goal ? { ...b.goal } : undefined
        mirror.isPinned = !!b.isPinned
        mirror.isCompleted = !!b.isCompleted
      }
    }
  }, [timeBlocks, blockDurationMinutes])

  // --- Half-hour Voice Alerts Scheduler (:29 and :59) ---
  const speakFallback = (text: string) => {
    try {
      if (typeof window === 'undefined') return
      if (!('speechSynthesis' in window)) return
      if (Notification.permission !== 'granted') return
      const utter = new SpeechSynthesisUtterance(text)
      // Prefer a male-sounding English voice if available
      const voices = window.speechSynthesis.getVoices()
      const enMale = voices.find(v => /en/i.test(v.lang) && /male/i.test((v as any).name || ''))
      if (enMale) utter.voice = enMale
      window.speechSynthesis.speak(utter)
    } catch {}
  }

  const playMaleTts = async (text: string) => {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch('/api/tts/male', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, format: 'mp3' }),
        signal: ctrl.signal,
      })
      clearTimeout(to)
      if (!res.ok) throw new Error('tts_failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      await audio.play().catch(() => speakFallback(text))
      // Revoke later (no leak for short-lived URL)
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch {
      speakFallback(text)
    }
  }

  // Short joyful chime before announcing (longer + louder)
  const playJoyfulChime = async () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const now = ctx.currentTime
      const master = ctx.createGain()
      // Max volume; envelope per-note prevents clicks
      master.gain.value = 1.0
      master.connect(ctx.destination)

      const notes = [523.25, 659.25, 783.99] // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const t0 = now + i * 0.25
        const t1 = t0 + 0.6
        gain.gain.setValueAtTime(0, t0)
        gain.gain.linearRampToValueAtTime(1.0, t0 + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, t1)
        osc.connect(gain)
        gain.connect(master)
        osc.start(t0)
        osc.stop(t1 + 0.01)
      })
      // Auto close after ~1.3s
      await new Promise((r) => setTimeout(r, 1300))
      try { ctx.close() } catch {}
    } catch {}
  }

  // Try to show a system notification (helps when tab is backgrounded)
  const maybeShowSystemNotification = (body: string) => {
    try {
      if (typeof window === 'undefined') return
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') return
      new Notification('Time Reminder', { body, silent: false })
    } catch {}
  }



  useEffect(() => {
    if (!enableHalfHourAlerts) return
    if (!currentTime) return
    if (showProgressCheck) return // avoid conflict with progress popup

    const now = currentTime
    const m = now.getMinutes()
    const s = now.getSeconds()
    if (!(m === 29 || m === 59)) return
    // Only trigger near the top of the minute to avoid multiple fires
    if (s > 5) return

    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${m}`
    if (lastHalfHourAnnouncedRef.current === key) return
    lastHalfHourAnnouncedRef.current = key

    const hh = now.getHours()
    ;(async () => {
      // Play chime first
      await playJoyfulChime()
      // If popup opened during chime, skip announcement
      if (showProgressCheck) return
      
      // Calculate progress information using component-scoped variables
      const passedBlocks = activePassedBlocks || 0
      const leftBlocks = activeLeftBlocks || 0
      const passedTime = blocksToTime(passedBlocks)
      const leftTime = blocksToTime(leftBlocks)
      
      if (m === 29) {
        const targetHour = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
        const targetPeriod = hh < 12 ? 'AM' : 'PM'
        const target = `${targetHour}:30 ${targetPeriod}`
        const progressText = passedBlocks > 0 || leftBlocks > 0 
          ? `. ${passedBlocks} blocks, ${passedTime} passed, ${leftBlocks} blocks, ${leftTime} left for today`
          : ''
        const text = `cheer up, it's almost ${target}${progressText}`
        maybeShowSystemNotification(text)
        await playMaleTts(text)
      } else {
        const nextHour = (hh + 1) % 24
        const targetHour = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour
        const targetPeriod = nextHour < 12 ? 'AM' : 'PM'
        const target = `${targetHour} ${targetPeriod}`
        const progressText = passedBlocks > 0 || leftBlocks > 0 
          ? `. ${passedBlocks} blocks, ${passedTime} passed, ${leftBlocks} blocks, ${leftTime} left for today`
          : ''
        const text = `cheer up, it's almost ${target}${progressText}`
        maybeShowSystemNotification(text)
        await playMaleTts(text)
      }
    })()
  }, [currentTime, enableHalfHourAlerts, showProgressCheck])

  // Snapshot the current mode's blocks so we can restore when returning to that mode
  useEffect(() => {
    const deepCopy = (b: TimeBlock): TimeBlock => ({
      ...b,
      task: b.task ? { ...b.task } : undefined,
      goal: b.goal ? { ...b.goal } : undefined,
      isPinned: !!b.isPinned,
      isCompleted: !!b.isCompleted,
    })
    if (blockDurationMinutes === 30) {
      snapshot30Ref.current = timeBlocks.map(deepCopy)
    } else if (blockDurationMinutes === 3) {
      snapshot3Ref.current = timeBlocks.map(deepCopy)
    }
  }, [timeBlocks, blockDurationMinutes])

  // Fetch today's active window and prompt if missing
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/local/active-window', { cache: 'no-store' })
        const json = await res.json()
        setActiveWindow({ activeStartMinute: json.activeStartMinute, activeEndMinute: json.activeEndMinute })
        if (json.activeStartMinute == null || json.activeEndMinute == null) {
          setShowActiveWindowSetup(true)
        }
      } catch (e) {
        console.warn('Failed to load active window', e)
      }
    }
    run()
  }, [])

  const saveActiveWindow = async (payload: { activeStartMinute: number | null; activeEndMinute: number | null }) => {
    try {
      await fetch('/api/local/active-window', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setActiveWindow(payload)
    } catch (e) {
      console.warn('Failed to save active window', e)
    }
  }

  // Save half-hour alerts setting to database
  const toggleHalfHourAlerts = async () => {
    const newValue = !enableHalfHourAlerts
    setEnableHalfHourAlerts(newValue)
    try {
      await fetch('/api/local/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableHalfHourAlerts: newValue })
      })
    } catch (error) {
      console.warn('Failed to save half-hour alerts setting:', error)
    }
  }

  // Load settings from API on app startup
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/local/settings')
        if (response.ok) {
          const settings = await response.json()
          setBlockDurationMinutes(settings.blockDurationMinutes ?? 30)
          setEnableHalfHourAlerts(settings.enableHalfHourAlerts ?? true)
        } else {
          // If API fails, set default to enable half-hour alerts
          setEnableHalfHourAlerts(true)
        }
      } catch (error) {
        console.warn('Failed to load settings:', error)
        // If API fails, set default to enable half-hour alerts
        setEnableHalfHourAlerts(true)
      }
    }
    loadSettings()
  }, [])

  // Initialize current time on client side to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date())
  }, [])

  // Request Notification permission upfront so alerts can surface during screensaver/background
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (!('Notification' in window)) return
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    } catch {}
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
    const updated = timeBlocks.map((b) => {
      if (multiSelect.selected.includes(b.id)) {
        const goal = goalOptions.find((g) => g.id === goalId)
        return {
          ...b,
          goal: goal ? { id: goal.id, label: goal.label, color: goal.color } : undefined,
        }
      }
      return b
    })
    setTimeBlocks(updated)
    setLastAssignedGoalId(goalId)
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
      // Find next available non-pinned empty block
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
        const baseTitle = task.title.replace(/\d+$/, '').trim() // Remove existing numbers
        const numberedTitle = `${baseTitle} #${taskNumber}`

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
      } else {
        // No change needed, just update the task
        setTimeBlocks((prev) =>
          prev.map((block) => (block.id === editingBlockId ? { ...block, task: newTask } : block)),
        )
      }
    }

    setShowQuickInput(false)
    setEditingBlockId(null)
  }

  // Toggle pin/unpin for a block
  const togglePin = async (blockId: string) => {
    setTimeBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, isPinned: !b.isPinned } : b)))
    try {
      const blk = timeBlocks.find(b => b.id === blockId)
      const nextPinned = !(blk?.isPinned)
      await fetch('/api/local/time-blocks/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId, pinned: nextPinned }) })
    } catch {}
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
    // Prevent immediate downsync to 1-min mirror on the next render
    isSwitchingModeRef.current = true
    // Explicitly snapshot current mode for reliable restore when returning
    const deepCopy = (b: TimeBlock): TimeBlock => ({
      ...b,
      task: b.task ? { ...b.task } : undefined,
      goal: b.goal ? { ...b.goal } : undefined,
      isPinned: !!b.isPinned,
      isCompleted: !!b.isCompleted,
    })
    if (blockDurationMinutes === 30) {
      snapshot30Ref.current = timeBlocks.map(deepCopy)
    } else if (blockDurationMinutes === 3) {
      snapshot3Ref.current = timeBlocks.map(deepCopy)
    }
    setBlockDurationMinutes(newDuration)
    setShowDurationSelector(false)
    // Clear any existing tasks when changing duration to avoid confusion
    setRecentChanges([])
  }

  // Calculate focus blocks vs unproductive blocks statistics
  const calculateBlockStatistics = () => {
    const now = currentTime || new Date()
    const currentBlockId = getCurrentBlockId(now)
    const currentBlockIndex = getBlockIndex(currentBlockId)
    
    let focusBlocks = 0 // Green blocks
    let unproductiveBlocks = 0 // Red blocks
    
    timeBlocks.forEach((block, index) => {
      // Only count past blocks and current block if it's completed
      if (index > currentBlockIndex) return
      
      const isNoise = (title?: string) => 
        title && (title.includes('Paused') || title.includes('Disrupted') || title.includes('Interrupted'))
      
      // Count focus blocks (green)
      if (block.isCompleted && block.task && !isNoise(block.task.title)) {
        focusBlocks++
      }
      // Count unproductive blocks (red)
      else if (
        // Interrupted/Paused/Disrupted blocks
        (block.task && isNoise(block.task.title)) ||
        // Past active blocks that are blank (no task but was active)
        (index < currentBlockIndex && block.isActive && !block.task) ||
        // Past blocks that were active but not completed and had tasks
        (index < currentBlockIndex && block.isActive && block.task && !block.isCompleted && !isNoise(block.task.title))
      ) {
        unproductiveBlocks++
      }
    })
    
    return { focusBlocks, unproductiveBlocks }
  }

  const { focusBlocks, unproductiveBlocks } = calculateBlockStatistics()

  // Active window derived metrics helpers  
  const formatMinAsHHMM = (m: number) => {
    const hh = Math.floor(m / 60).toString().padStart(2, '0')
    const mm = (m % 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
  }
  const activeStartMin = activeWindow?.activeStartMinute ?? null
  const activeEndMin = activeWindow?.activeEndMinute ?? null
  const totalActiveMinutes = (activeStartMin != null && activeEndMin != null && activeEndMin > activeStartMin) ? (activeEndMin - activeStartMin) : null
  const activeBlocksCount = totalActiveMinutes != null ? Math.floor(totalActiveMinutes / blockDurationMinutes) : null

  // --- Focus Overview derived metrics ---
  const isWindowValid = activeStartMin != null && activeEndMin != null && (activeEndMin as number) > (activeStartMin as number)
  const nowIdx = currentTime ? (currentTime.getHours() * 60 + currentTime.getMinutes()) : null
  const blocksToTime = (n: number) => {
    const mins = n * blockDurationMinutes
    const hh = Math.floor(mins / 60)
    const mm = mins % 60
    return `${hh}h ${mm}m`
  }
  const parseIdx = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number)
    return h * 60 + m
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

  const inactiveCount = isWindowValid ? timeBlocks.reduce((acc, b) => {
    const s = parseIdx(b.startTime), e = parseIdx(b.endTime)
    return acc + ((e <= (activeStartMin as number) || s >= (activeEndMin as number)) ? 1 : 0)
  }, 0) : 0
  const availableCount = Math.max(0, totalBlocks - inactiveCount)
  const activePassedBlocks = (isWindowValid && nowIdx != null) ? timeBlocks.reduce((acc, b) => {
    const s = parseIdx(b.startTime), e = parseIdx(b.endTime)
    const inside = !(e <= (activeStartMin as number) || s >= (activeEndMin as number))
    return acc + (inside && e <= nowIdx ? 1 : 0)
  }, 0) : 0
  const activeLeftBlocks = (isWindowValid && nowIdx != null) ? timeBlocks.reduce((acc, b) => {
    const s = parseIdx(b.startTime), e = parseIdx(b.endTime)
    const inside = !(e <= (activeStartMin as number) || s >= (activeEndMin as number))
    return acc + (inside && s >= nowIdx ? 1 : 0)
  }, 0) : 0
  const goalsForToday = [
    { id: 'goal_1', label: dailyGoals[0] || 'Goal 1' },
    { id: 'goal_2', label: dailyGoals[1] || 'Goal 2' },
    { id: 'goal_3', label: dailyGoals[2] || 'Goal 3' },
  ]
  const goalsAchieved = goalsForToday.filter(g => timeBlocks.some(b => b.goal?.id === g.id && b.isCompleted))
  const goalsUnfinished = (isWindowValid && nowIdx != null)
    ? goalsForToday.filter(g => timeBlocks.some(b => {
        const s = parseIdx(b.startTime), e = parseIdx(b.endTime)
        const inside = !(e <= (activeStartMin as number) || s >= (activeEndMin as number))
        return b.goal?.id === g.id && inside && s >= nowIdx && !b.isCompleted
      }))
    : []
  const isNoise = (t?: string) => !!t && (t.includes('Paused') || t.includes('Disrupted') || t.includes('Interrupted'))
  const tasksDoneMap = new Map<string, number>()
  const tasksUndoneMap = new Map<string, number>()
  timeBlocks.forEach(b => {
    const title = b.task?.title || undefined
    if (!title || isNoise(title)) return
    if (b.isCompleted) {
      tasksDoneMap.set(title, (tasksDoneMap.get(title) || 0) + 1)
    } else if (isWindowValid && nowIdx != null) {
      const s = parseIdx(b.startTime), e = parseIdx(b.endTime)
      const inside = !(e <= (activeStartMin as number) || s >= (activeEndMin as number))
      if (inside && s >= nowIdx) tasksUndoneMap.set(title, (tasksUndoneMap.get(title) || 0) + 1)
    }
  })
  const toList = (m: Map<string, number>, cap = 5) => {
    const arr = Array.from(m.entries()).sort((a,b) => b[1]-a[1])
    const more = Math.max(0, arr.length - cap)
    return { top: arr.slice(0, cap), more }
  }
  const tasksDone = toList(tasksDoneMap)
  const tasksUndone = toList(tasksUndoneMap)

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
  const handleBlockCompletion = async (completedBlock: TimeBlock, nextBlockId: string) => {
    console.log("handleBlockCompletion called:", { completedBlockId, nextBlockId, time: new Date().toISOString() })

    // Stop current timer
    setIsTimerRunning(false)

    // Mark completed block as finished
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === completedBlock.id ? { ...block, isActive: false, isCompleted: true } : block)),
    )
    // Persist block status locally
    try { await fetch('/api/local/time-blocks/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId: completedBlock.id, status: 'completed' }) }) } catch {}

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
    
    // Mark the completed block as successfully completed (green)
    if (completedBlockId) {
      setTimeBlocks((prev) =>
        prev.map((block) => 
          block.id === completedBlockId 
            ? { ...block, isCompleted: true, isActive: false }
            : block
        ),
      )
    }
    
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
      // Mark the completed block as successfully completed (green) with "stick to plan"
      updated[completedIndex].isCompleted = true
      updated[completedIndex].isActive = false
    }

    setTimeBlocks(updated)

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

    // Mark the completed block as successfully completed (green) even if still doing
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
        isCompleted: true,  // Mark as completed (green)
        isActive: false,
      }
    } else if (completedBlockIndex >= 0) {
      // Mark the completed block as successfully completed (green)
      updatedBlocks[completedBlockIndex] = {
        ...updatedBlocks[completedBlockIndex],
        isCompleted: true,
        isActive: false,
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

  const handleProgressClose = () => {
    if (progressCheckTimer) clearTimeout(progressCheckTimer)
    if (!completedBlockId) return

    const completedBlockIndex = getBlockIndex(completedBlockId)
    const nextBlockId = getCurrentBlockId(currentTime || new Date())
    const nextBlockIndex = getBlockIndex(nextBlockId)

    // Step 1: Move all future tasks 2 blocks away (to make room for the undone task)
    const updatedBlocks = [...timeBlocks]
    let { updatedBlocks: movedBlocks } = pushTasksForward(
      nextBlockIndex + 1, // Start from the block after current
      2, // Push by 2 blocks
    )
    updatedBlocks.splice(0, updatedBlocks.length, ...movedBlocks)

    const completedBlock = updatedBlocks[completedBlockIndex]

    if (completedBlock?.task &&
        !completedBlock.task.title?.includes("Paused") &&
        !completedBlock.task.title?.includes("Disrupted") &&
        !completedBlock.task.title?.includes("Interrupted")) {

      // The target should be exactly 2 blocks after the current block (nextBlockIndex + 2)
      let targetIndex = nextBlockIndex + 2

      if (targetIndex < updatedBlocks.length) {
        const taskToMove = { ...completedBlock.task }

        // Clear the original position first
        updatedBlocks[completedBlockIndex].task = undefined

        // Place the task in the target position
        updatedBlocks[targetIndex] = {
          ...updatedBlocks[targetIndex],
          task: { ...taskToMove, id: `deferred-${Date.now()}` },
          isRecentlyMoved: true,
        }

        // Clear recently moved after 2 seconds
        setTimeout(() => {
          setTimeBlocks((prev) =>
            prev.map((block) => (block.id === updatedBlocks[targetIndex].id ? { ...block, isRecentlyMoved: false } : block)),
          )
        }, 2000)
      }
    }

    // Step 3: Mark the completed block as "Interrupted - User Closed"
    if (completedBlockIndex >= 0 && completedBlockIndex < updatedBlocks.length) {
      updatedBlocks[completedBlockIndex] = {
        ...updatedBlocks[completedBlockIndex],
        isActive: false,
        isCompleted: false,
        task: {
          id: `interrupted-close-${Date.now()}`,
          title: "Interrupted - User Closed",
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

    const change: TaskChange = {
      type: "push",
      blockId: completedBlockId,
      oldTask: completedBlock?.task,
      newTask: {
        id: `interrupted-close-${Date.now()}`,
        title: "Interrupted - User Closed",
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
    <div className={cn("min-h-screen bg-gray-50 p-4 pb-24", showNestedTodos ? "pl-80" : "")}>
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
            {/* Half-hour Alerts controls moved to header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Half-hour Alerts:</span>
              <Button
                variant={enableHalfHourAlerts ? "default" : "secondary"}
                onClick={toggleHalfHourAlerts}
                className="min-w-28"
                title="Announce at :29 and :59 using a male voice"
              >
                {enableHalfHourAlerts ? "On" : "Off"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerNextHalfHourAlert}
                title="Play the chime and announce the next upcoming half-hour"
              >
                Test
              </Button>
            </div>

            <Button variant="outline" className="flex items-center gap-2" onClick={() => setShowNestedTodos(v => !v)}>
              <ListChecks className="h-4 w-4" />
              {showNestedTodos ? "Hide Todos" : "Show Todos"}
            </Button>
            <Button variant="outline" className="flex items-center gap-2" onClick={exportTodayCsv}>
              Export CSV
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowActiveWindowSetup(true)} title="Set wake/start and sleep times">
              <MoonStar className="h-4 w-4" />
            </Button>

            {/* Quick Block Duration Dropdown (moved next to header buttons) */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <Select
                value={String(blockDurationMinutes)}
                onValueChange={(val) => handleBlockDurationChange(parseInt(val, 10))}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Block size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="3">3 minutes</SelectItem>
                  <SelectItem value="1">1 minute</SelectItem>
                </SelectContent>
              </Select>
            </div>


          </div>
        </div>

        {/* Daily Goals (Glass/Silver) */}
        <DailyGoals />


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


        {/* Time Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                24-Hour Time Grid ({blockDurationMinutes}-minute blocks)
                <div className="flex items-center gap-3 ml-4">
                  <div className="flex items-center gap-1 text-sm">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium text-green-700">{focusBlocks}</span>
                    <span className="text-gray-500">focus</span>
                  </div>
                  <div className="text-gray-400">vs</div>
                  <div className="flex items-center gap-1 text-sm">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="font-medium text-red-700">{unproductiveBlocks}</span>
                    <span className="text-gray-500">unproductive</span>
                  </div>
                </div>
              </span>
              <div className="flex items-center gap-2">
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
                {multiSelect.isActive && (
                  <Button
                    variant="secondary"
                    className="h-8"
                    disabled={!lastAssignedGoalId}
                    onClick={() => {
                      if (!lastAssignedGoalId) return
                      const which = lastAssignedGoalId === 'goal_1' ? 'goal1' : lastAssignedGoalId === 'goal_2' ? 'goal2' : lastAssignedGoalId === 'goal_3' ? 'goal3' : null
                      if (!which) return
                      const goal = goalOptions.find(g => g.id === lastAssignedGoalId)
                      const label = goal?.label || 'Goal'
                      try { window.dispatchEvent(new CustomEvent('openBreakdownFor', { detail: { which, label } })) } catch {}
                    }}
                  >
                    Break down
                  </Button>
                )}
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
              className={`grid gap-x-2 gap-y-6 max-h-[600px] overflow-y-auto p-2 pl-12`}
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
                      {/* Goal tag as a compact "hat" above the block; extra row gap prevents overlap with previous row */}
                      {block.goal && (
                        <div
                          className={cn(
                            "absolute left-2 top-0 -translate-y-full px-2 py-0.5 rounded-md shadow-md z-10",
                            // Stronger, more visible goal tag backgrounds by goal id
                            block.goal.id === 'goal_1' && 'bg-amber-500',
                            block.goal.id === 'goal_2' && 'bg-emerald-500',
                            block.goal.id === 'goal_3' && 'bg-indigo-500'
                          )}
                          title={`Assigned Goal: ${block.goal.label}`}
                        >
                          <span className="text-white text-[10px] sm:text-xs font-semibold tracking-wide drop-shadow leading-tight break-words whitespace-normal">
                            {block.goal.label}
                          </span>
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
                      {/* Dark hours overlay (always rendered, not only when there is a task) */}
                      {(() => {
                        if (!activeWindow || activeWindow.activeStartMinute == null || activeWindow.activeEndMinute == null) return null
                        const [sh, sm] = block.startTime.split(":").map(Number)
                        const [eh, em] = block.endTime.split(":").map(Number)
                        const startIdx = sh * 60 + sm
                        const endIdx = eh * 60 + em
                        const aS = activeWindow.activeStartMinute
                        const aE = activeWindow.activeEndMinute
                        const isInactive = (endIdx <= aS) || (startIdx >= aE)
                        if (!isInactive) return null
                        return (
                          <div className="absolute inset-0 rounded-lg bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                            <MoonStar className="w-4 h-4 text-slate-200 opacity-80" />
                          </div>
                        )
                      })()}


                      {block.task && (
                        <>

                          <div
                            className={cn(
                              "absolute left-2 right-3",
                              // Start task text at the vertical middle so it can flow downward into bottom half
                              "top-1/2"
                            )}
                          >
                            {(() => {
                              const title = block.task?.title || ""
                              const len = title.length
                              // Base sizes by mode
                              let sizeClass = blockDurationMinutes === 3 ? "text-xs" : "text-sm"
                              // Shrink progressively when long to preserve visibility with long goals
                              if (blockDurationMinutes === 3) {
                                if (len > 70) sizeClass = "text-[9px]"
                                else if (len > 40) sizeClass = "text-[10px]"
                              } else if (blockDurationMinutes === 1) {
                                if (len > 70) sizeClass = "text-[9px]"
                                else if (len > 45) sizeClass = "text-[10px]"
                              } else {
                                if (len > 90) sizeClass = "text-[10px]"
                                else if (len > 60) sizeClass = "text-[11px]"
                              }
                              return (
                                <p
                                  className={cn(

                                    `${sizeClass} font-medium`,
                                    (isCurrentBlock || isInPlanningSelection || (blockStatus === 'future' && !!block.task)) ? "text-white" : "text-gray-900",
                                    // Allow multi-line wrap and tighter leading
                                    "leading-snug break-words"
                                  )}
                                >
                                  {title}
                                </p>
                              )
                            })()}
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

        {/* Block Duration Selector (moved below Time Grid) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <span>Focus Overview</span>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{totalBlocks} blocks total</span>
                <span>{blocksPerHour} blocks/hour</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700">
              <div className="space-y-2">
                <div className="font-medium text-gray-900">Today capacity</div>
                <div>
                  <span className="font-semibold">{availableCount}</span> blocks
                  <span className="text-gray-500"> ({blocksToTime(availableCount)})</span>
                </div>
                {!isWindowValid && (
                  <div className="text-xs text-orange-600">Set your active window to compute available time.</div>
                )}
              </div>
              <div className="space-y-2">
                <div className="font-medium text-gray-900">Today so far</div>
                <div>
                  <span className="font-semibold">{activePassedBlocks}</span> blocks
                  <span className="text-gray-500"> ({blocksToTime(activePassedBlocks)})</span>
                </div>
                <div className="mt-1 text-gray-600">Goals achieved:</div>
                <div className="flex flex-wrap gap-1">
                  {goalsAchieved.length === 0 ? (
                    <span className="text-gray-400">None yet</span>
                  ) : goalsAchieved.map(g => (
                    <span key={g.id} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">{g.label}</span>
                  ))}
                </div>
                <div className="mt-1 text-gray-600">Tasks done:</div>
                <div className="flex flex-wrap gap-1">
                  {tasksDone.top.length === 0 ? (
                    <span className="text-gray-400">None yet</span>
                  ) : tasksDone.top.map(([t, c]) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">{t} ×{c}</span>
                  ))}
                  {tasksDone.more > 0 && (
                    <span className="text-gray-400 text-xs">+{tasksDone.more} more</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-gray-900">Remaining today</div>
                <div>
                  <span className="font-semibold">{activeLeftBlocks}</span> blocks
                  <span className="text-gray-500"> ({blocksToTime(activeLeftBlocks)})</span>
                </div>
                <div className="mt-1 text-gray-600">Goals unfinished:</div>
                <div className="flex flex-wrap gap-1">
                  {goalsUnfinished.length === 0 ? (
                    <span className="text-gray-400">None</span>
                  ) : goalsUnfinished.map(g => (
                    <span key={g.id} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">{g.label}</span>
                  ))}
                </div>
                <div className="mt-1 text-gray-600">Tasks undone:</div>
                <div className="flex flex-wrap gap-1">
                  {tasksUndone.top.length === 0 ? (
                    <span className="text-gray-400">None</span>
                  ) : tasksUndone.top.map(([t, c]) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">{t} ×{c}</span>
                  ))}
                  {tasksUndone.more > 0 && (
                    <span className="text-gray-400 text-xs">+{tasksUndone.more} more</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timer Controls (moved below Time Grid) */}
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
        {/* Nested Todos Side Panel */}
        <NestedTodosPanel open={showNestedTodos} onOpenChange={setShowNestedTodos} />
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
            onClose={() => handleProgressClose()}
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

        {/* Active Window Setup Modal */}
        <ActiveWindowSetup
          open={showActiveWindowSetup}
          onClose={() => setShowActiveWindowSetup(false)}
          onSave={saveActiveWindow}
          defaultStart="08:00"
          defaultEnd="23:00"
        />
      </div>

        {/* Bottom Toolbar: Voice, Notion, Test Popup */}
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border border-gray-200 shadow-lg rounded-full px-3 py-2">
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
    </div>
  )
}
