"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Calendar, Database, Plus, Loader2, RefreshCw } from "lucide-react"
import { NotionTaskItem } from "@/types/notion"
import { colorFromNotionTask, statusBadgeClass } from "@/lib/task-colors"

interface TaskSelectorProps {
  isOpen: boolean
  onClose: () => void
  onTaskSelect: (task: any) => void
  blockTime?: {
    startTime: string
    endTime: string
  }
}

export default function TaskSelector({ isOpen, onClose, onTaskSelect, blockTime }: TaskSelectorProps) {
  const [activeTab, setActiveTab] = useState<"calendar" | "notion" | "custom">("calendar")
  const [customTask, setCustomTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    color: "bg-blue-500",
  })
  const [notionTasks, setNotionTasks] = useState<NotionTaskItem[]>([])
  const [notionLoading, setNotionLoading] = useState(false)
  const [notionError, setNotionError] = useState<string | null>(null)
  const [notionSearch, setNotionSearch] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false)

  // Mock calendar events for this time slot
  const suggestedCalendarEvents = [
    {
      id: "cal-1",
      title: "Focus Time",
      description: "Deep work session",
      color: "bg-blue-500",
    },
    {
      id: "cal-2",
      title: "Email Processing",
      description: "Check and respond to emails",
      color: "bg-green-500",
    },
  ]

  const fetchNotionTasks = useCallback(async (query: string) => {
    setNotionLoading(true)
    setNotionError(null)
    try {
      const params = new URLSearchParams({ limit: "20" })
      if (query) params.set("search", query)
      const res = await fetch(`/api/notion/task-calendar?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Unable to load Notion tasks.")
      }
      setNotionTasks(Array.isArray(data.items) ? data.items : [])
      setHasFetchedOnce(true)
    } catch (err: any) {
      setNotionTasks([])
      setNotionError(err?.message || "Unable to load Notion tasks. Configure Notion settings first.")
    } finally {
      setNotionLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(notionSearch.trim()), 350)
    return () => clearTimeout(timeout)
  }, [notionSearch])

  useEffect(() => {
    if (!isOpen) return
    if (activeTab !== "notion") return
    fetchNotionTasks(debouncedQuery)
  }, [isOpen, activeTab, debouncedQuery, fetchNotionTasks])

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("calendar")
      setHasFetchedOnce(false)
      setNotionSearch("")
    }
  }, [isOpen])

  const handleNotionTaskSelect = (task: NotionTaskItem) => {
    const color = colorFromNotionTask(task)
    onTaskSelect({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      type: "notion",
      color,
      url: task.url,
    })
  }

  const handleCustomTaskCreate = () => {
    if (customTask.title.trim()) {
      onTaskSelect({
        id: `custom-${Date.now()}`,
        ...customTask,
        type: "custom",
      })
      setCustomTask({ title: "", description: "", priority: "medium", color: "bg-blue-500" })
    }
  }

  const colorOptions = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-red-500",
    "bg-yellow-500",
    "bg-indigo-500",
    "bg-pink-500",
    "bg-gray-500",
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Select Task for {blockTime?.startTime} - {blockTime?.endTime}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("calendar")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === "calendar" ? "bg-white shadow-sm" : "hover:bg-gray-200"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Calendar Events
            </button>
            <button
              onClick={() => setActiveTab("notion")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === "notion" ? "bg-white shadow-sm" : "hover:bg-gray-200"
              }`}
            >
              <Database className="h-4 w-4" />
              Notion Tasks
            </button>
            <button
              onClick={() => setActiveTab("custom")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === "custom" ? "bg-white shadow-sm" : "hover:bg-gray-200"
              }`}
            >
              <Plus className="h-4 w-4" />
              Create New
            </button>
          </div>

          {/* Calendar Events Tab */}
          {activeTab === "calendar" && (
            <div className="space-y-3">
              <h3 className="font-medium">Suggested Calendar Events</h3>
              {suggestedCalendarEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => onTaskSelect(event)}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{event.title}</h4>
                      <p className="text-sm text-gray-600">{event.description}</p>
                    </div>
                    <Badge className={`text-white ${event.color}`}>Calendar</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notion Tasks Tab */}
          {activeTab === "notion" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search Notion tasks"
                    value={notionSearch}
                    onChange={(e) => setNotionSearch(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => fetchNotionTasks(debouncedQuery)}
                    disabled={notionLoading}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${notionLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                {notionError && <p className="text-sm text-red-500">{notionError}</p>}
              </div>

              {notionLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Notion tasks...
                </div>
              )}

              {!notionLoading && notionTasks.length === 0 && hasFetchedOnce && !notionError && (
                <p className="text-sm text-gray-600">No tasks found. Try a different search.</p>
              )}

              {notionTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleNotionTaskSelect(task)}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      {task.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">{task.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {task.status && (
                        <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(task.status)}`}>
                          {task.status.name}
                        </span>
                      )}
                      {task.priority && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {task.priority}
                        </Badge>
                      )}
                      <Badge className={`text-white ${colorFromNotionTask(task)}`}>Notion</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create New Task Tab */}
          {activeTab === "custom" && (
            <div className="space-y-4">
              <h3 className="font-medium">Create New Task</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="title">Task Title</Label>
                  <Input
                    id="title"
                    value={customTask.title}
                    onChange={(e) => setCustomTask((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter task title..."
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={customTask.description}
                    onChange={(e) => setCustomTask((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter task description..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <div className="flex gap-2 mt-1">
                    {["low", "medium", "high"].map((priority) => (
                      <button
                        key={priority}
                        onClick={() => setCustomTask((prev) => ({ ...prev, priority }))}
                        className={`px-3 py-1 rounded-md text-sm capitalize transition-colors ${
                          customTask.priority === priority ? "bg-blue-500 text-white" : "bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-1">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        onClick={() => setCustomTask((prev) => ({ ...prev, color }))}
                        className={`w-6 h-6 rounded-full ${color} ${
                          customTask.color === color ? "ring-2 ring-offset-2 ring-gray-400" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <Button onClick={handleCustomTaskCreate} className="w-full">
                  Create Task
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
