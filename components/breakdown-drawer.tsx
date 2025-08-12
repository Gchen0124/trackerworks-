"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, ArrowUp, ArrowDown, Save, ListChecks, Send, Sparkles, MessageSquare } from "lucide-react"

export type ScopeType = "task" | "microstep"

interface BreakdownItemDraft {
  id?: string
  title: string
  estimate_min?: number
  order_index?: number
}

interface BreakdownDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Identify the parent context
  parentId?: string // for microsteps under a task
  goalId?: string // for tasks under a goal
  scopeType: ScopeType
  parentLabel: string
}

export default function BreakdownDrawer({ open, onOpenChange, parentId, goalId, scopeType, parentLabel }: BreakdownDrawerProps) {
  const [items, setItems] = useState<BreakdownItemDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [selectedCount, setSelectedCount] = useState<number>(0)
  const [selectedDetails, setSelectedDetails] = useState<Array<{ id: string; startTime?: string; endTime?: string }>>([])

  const formatRange = (s?: string, e?: string) => {
    if (!s || !e) return ""
    // Expecting HH:MM strings
    return `${s}–${e}`
  }

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (parentId) p.set("parentId", parentId)
    if (goalId) p.set("goalId", goalId)
    if (scopeType) p.set("scopeType", scopeType)
    return p.toString()
  }, [parentId, goalId, scopeType])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let selectedListener: ((e: Event) => void) | null = null
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/local/breakdown?${query}`)
        if (!res.ok) throw new Error("Failed to load breakdown")
        const data = await res.json()
        const drafts: BreakdownItemDraft[] = (data.items || []).map((r: any, i: number) => ({ id: r.id, title: r.title || "", estimate_min: r.estimate_min ?? undefined, order_index: r.order_index ?? i }))
        if (!cancelled) setItems(drafts)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Load error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()

    // Ask the grid for currently selected blocks
    const askSelected = () => {
      try {
        window.dispatchEvent(new Event('getSelectedBlocks'))
      } catch {}
    }
    selectedListener = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { ids?: string[]; details?: Array<{ id: string; startTime?: string; endTime?: string }> }
        const ids = Array.isArray(detail?.ids) ? detail!.ids! : []
        const dets = Array.isArray(detail?.details) ? detail!.details! : []
        if (!cancelled) setSelectedCount(ids.length)
        if (!cancelled) setSelectedDetails(dets)
        // If there is no draft loaded and we have a selection, seed empty rows equal to selection count
        if (!cancelled && ids.length > 0) {
          setItems(prev => {
            if (prev.length > 0) return prev
            return Array.from({ length: ids.length }).map((_, i) => ({ title: "", order_index: i }))
          })
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('selectedBlocks', selectedListener as EventListener)
      // Defer to ensure listeners are attached, then request
      setTimeout(askSelected, 0)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined' && selectedListener) {
        window.removeEventListener('selectedBlocks', selectedListener as EventListener)
      }
    }
  }, [open, query])

  const loadItemsFromAI = (aiItems: Array<{ title: string; estimate_min?: number }>) => {
    let arr = (aiItems || []).map((it) => ({ title: it.title }))
    if (selectedCount > 0) {
      if (arr.length > selectedCount) arr = arr.slice(0, selectedCount)
      if (arr.length < selectedCount) {
        arr = [...arr, ...Array.from({ length: selectedCount - arr.length }).map(() => ({ title: "" }))]
      }
    }
    const mapped: BreakdownItemDraft[] = arr.map((it, i) => ({ title: it.title, order_index: i }))
    setItems(mapped)
  }

  const callAI = async (extraUserMessage?: string) => {
    try {
      setGenerating(true)
      setError(null)
      const chat = [...chatMessages]
      if (extraUserMessage && extraUserMessage.trim()) {
        chat.push({ role: 'user', content: extraUserMessage.trim() })
      }
      const res = await fetch('/api/ai/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, parentId, scopeType, parentLabel, chat }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`AI error: ${t}`)
      }
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        loadItemsFromAI(data.items)
      }
      if (data?.reply) {
        setChatMessages(prev => [...chat, { role: 'assistant', content: data.reply }])
      } else if (extraUserMessage) {
        setChatMessages(prev => [...chat])
      }
    } catch (e: any) {
      setError(e?.message || 'AI request failed')
    } finally {
      setGenerating(false)
    }
  }

  const onSendChat = async () => {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput("")
    await callAI(msg)
  }

  const addItem = () => {
    const next: BreakdownItemDraft = { title: "", estimate_min: undefined, order_index: items.length }
    setItems((prev) => [...prev, next])
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, order_index: i })))
  }

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const copy = [...items]
    const tmp = copy[idx]
    copy[idx] = copy[j]
    copy[j] = tmp
    copy.forEach((it, i) => { it.order_index = i })
    setItems(copy)
  }

  const saveDraft = async () => {
    try {
      setSaving(true)
      setError(null)
      const res = await fetch("/api/local/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, goalId, scopeType, items }),
      })
      if (!res.ok) throw new Error("Failed to save draft")
    } catch (e: any) {
      setError(e?.message || "Save error")
    } finally {
      setSaving(false)
    }
  }

  const clearDraft = async () => {
    try {
      setSaving(true)
      setError(null)
      // Overwrite with empty items for this scope
      const res = await fetch("/api/local/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, goalId, scopeType, items: [] }),
      })
      if (!res.ok) throw new Error("Failed to clear draft")
      // Reset UI
      setItems([])
      setChatMessages([])
    } catch (e: any) {
      setError(e?.message || "Clear error")
    } finally {
      setSaving(false)
    }
  }

  const assignToSelection = async () => {
    // Emit an app-wide event so the grid/selection layer can handle actual placement
    try {
      window.dispatchEvent(new CustomEvent("assignBreakdownToSelection", { detail: { scopeType, parentId, goalId, items } }))
    } catch {}
    // Keep drawer open so user can iterate; or close if desired
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[min(100vw-2rem,960px)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Break down: <span className="text-zinc-700">{parentLabel}</span></DialogTitle>
          <DialogDescription>
            Create and edit a list of {{task: 'tasks', microstep: 'micro-steps'}[scopeType]}.
            You can Save as draft, then Assign to current selection when ready.
          </DialogDescription>
        </DialogHeader>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : (
          <div className="space-y-3">
            {/* Header showing selection context */}
            {selectedCount > 0 && (
              <div className="text-xs text-zinc-600">{selectedCount} selected 30-min block{selectedCount>1? 's':''}. Add tasks below or use Generate with AI.</div>
            )}

            {(() => {
              const displayItems = (items.length > 0)
                ? items
                : Array.from({ length: Math.max(selectedCount, 0) }).map((_, i) => ({ title: "", order_index: i }))
              return displayItems
            })().map((it, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Badge variant="outline" className="mt-2">{idx + 1}</Badge>
                {selectedDetails[idx] && (
                  <div className="w-28 mt-2 text-[11px] text-zinc-500 font-mono">{formatRange(selectedDetails[idx]?.startTime, selectedDetails[idx]?.endTime)}</div>
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    value={it.title}
                    placeholder={scopeType === 'task' ? "Task title" : "Micro-step title"}
                    onChange={(e) => {
                      const v = e.target.value
                      setItems((prev) => {
                        const copy = [...prev]
                        while (copy.length <= idx) {
                          copy.push({ title: "", order_index: copy.length })
                        }
                        copy[idx] = { ...(copy[idx] || { order_index: idx }), title: v }
                        return copy
                      })
                    }}
                  />
                  <div className="flex items-center gap-1 ml-auto">
                    <Button size="icon" variant="ghost" onClick={() => move(idx, -1)} title="Move up"><ArrowUp className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(idx, +1)} title="Move down"><ArrowDown className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} title="Remove"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={addItem} className="flex items-center gap-2"><Plus className="h-4 w-4"/> Add</Button>
                <Button variant="outline" onClick={() => callAI()} disabled={generating} className="flex items-center gap-2"><Sparkles className="h-4 w-4"/> {generating ? 'Generating…' : 'Generate with AI'}</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveDraft} disabled={saving} className="flex items-center gap-2"><Save className="h-4 w-4"/> Save draft</Button>
                <Button variant="outline" onClick={clearDraft} disabled={saving} className="flex items-center gap-2"><Trash2 className="h-4 w-4"/> Clear draft</Button>
                <Button variant="secondary" onClick={assignToSelection} className="flex items-center gap-2"><Send className="h-4 w-4"/> Assign to selection</Button>
              </div>
            </div>

            {/* Chat panel */}
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-600">
                <MessageSquare className="h-4 w-4"/>
                <span>Discuss with AI to refine tasks</span>
              </div>
              <div className="max-h-40 overflow-auto space-y-2 pr-1">
                {chatMessages.length === 0 && (
                  <div className="text-xs text-zinc-500">No conversation yet. Ask for help like: "Make these tasks more concrete" or "Prioritize for this afternoon."</div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`text-sm break-words ${m.role === 'assistant' ? 'text-zinc-800' : 'text-zinc-700'}`}>
                    <span className="font-semibold mr-1">{m.role === 'assistant' ? 'AI' : 'You'}:</span>
                    <span>{m.content}</span>
                  </div>)
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Input className="flex-1 min-w-0" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask the AI about this goal…" onKeyDown={(e) => { if (e.key === 'Enter') onSendChat() }} />
                <Button onClick={onSendChat} disabled={generating || !chatInput.trim()} className="flex items-center gap-2 shrink-0"><Send className="h-4 w-4"/> Send</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
