"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Search, Database, RefreshCw, ExternalLink, Loader2, Info, ChevronRight } from "lucide-react"
import { NotionTaskItem } from "@/types/notion"
import { colorFromNotionTask, statusBadgeClass } from "@/lib/task-colors"

interface NotionTasksProps {
  isOpen: boolean
  onClose: () => void
  onTaskSelect: (task: any) => void
}

export default function NotionTasks({ isOpen, onClose, onTaskSelect }: NotionTasksProps) {
  const [tasks, setTasks] = useState<NotionTaskItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedDatabase, setSelectedDatabase] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databaseMeta, setDatabaseMeta] = useState<{ id: string; title: string } | null>(null)
  const [lastQuery, setLastQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"tasks" | "databases">("tasks")

  const fetchTasks = useCallback(async (query: string) => {
    setIsLoading(true)
    setError(null)
    setLastQuery(query)
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (query) params.set("search", query)
      const res = await fetch(`/api/notion/task-calendar?${params.toString()}`)
      const data = await res.json()

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Unable to load Notion tasks. Please check your credentials.")
      }

      setTasks(Array.isArray(data.items) ? data.items : [])
      setDatabaseMeta(data.database ?? null)
    } catch (err: any) {
      setTasks([])
      setDatabaseMeta(null)
      setError(err?.message || "Unable to load Notion tasks. Confirm your Notion settings.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setTasks([])
    setSelectedDatabase("all")
    setSearchQuery("")
    setError(null)
    setDatabaseMeta(null)
    setLastQuery("")
  }, [isOpen])

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    if (!isOpen) return
    fetchTasks(debouncedQuery)
  }, [debouncedQuery, isOpen, fetchTasks])

  const databaseOptions = useMemo(() => {
    const entries = new Map<string, string>()
    if (databaseMeta) {
      entries.set(databaseMeta.id, databaseMeta.title || "Task Calendar")
    }
    tasks.forEach((task) => {
      if (task.databaseId) {
        entries.set(task.databaseId, task.databaseName || "Task Calendar")
      }
    })

    return [
      { id: "all", name: "All tasks" },
      ...Array.from(entries.entries()).map(([id, name]) => ({ id, name })),
    ]
  }, [databaseMeta, tasks])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => selectedDatabase === "all" || task.databaseId === selectedDatabase)
  }, [tasks, selectedDatabase])

  const handleTaskApply = (task: NotionTaskItem) => {
    const color = colorFromNotionTask(task)
    onTaskSelect({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status?.name,
      priority: task.priority,
      tags: task.tags,
      url: task.url,
      dueDate: task.dueDate,
      type: "notion",
      source: "notion",
      color,
    })
  }

  const refreshTasks = () => fetchTasks(lastQuery)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Notion Tasks
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <select
                className="border rounded-md px-3 py-2 text-sm"
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
              >
                {databaseOptions.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={refreshTasks} disabled={isLoading} className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                {error}
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="databases">Database</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="space-y-3">
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tasks...
                </div>
              )}

              {!isLoading && filteredTasks.length === 0 && !error && (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-gray-600">
                    {searchQuery ? "No tasks match this search." : "No tasks found in your Task Calendar."}
                  </CardContent>
                </Card>
              )}

              {filteredTasks.map((task) => (
                <Card key={task.id} className="shadow-sm border border-gray-100">
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-semibold text-gray-900 flex items-center gap-2">
                            {task.title}
                            <a
                              href={task.url}
                              className="text-blue-600 hover:underline"
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Notion"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
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
                          {task.dueDate && (
                            <Badge variant="secondary" className="text-xs">
                              Due {new Date(task.dueDate).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {task.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-xs text-gray-500">
                          Last edited {task.lastEditedTime ? new Date(task.lastEditedTime).toLocaleString() : "recently"}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            className="flex items-center gap-2"
                            onClick={() => handleTaskApply(task)}
                          >
                            <ChevronRight className="h-4 w-4" />
                            Assign to block
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="databases">
              <Card>
                <CardContent className="py-6 space-y-3">
                  <div className="text-sm text-gray-700">
                    {databaseMeta ? (
                      <>
                        <div className="font-medium">Connected database</div>
                        <div>{databaseMeta.title || databaseMeta.id}</div>
                        <div className="text-xs text-gray-500">ID: {databaseMeta.id}</div>
                      </>
                    ) : (
                      <p>No Notion database metadata available. Add your credentials in Settings.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
