"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Database, RefreshCw, ExternalLink, Zap, Globe, Server } from "lucide-react"

interface NotionMCPProps {
  isOpen: boolean
  onClose: () => void
  onTaskSelect: (task: any) => void
}

interface MCPTask {
  id: string
  title: string
  description: string
  status: string
  priority: string
  database_id: string
  url: string
  color: string
  tags: string[]
  dueDate?: string
  source: 'mcp' | 'api'
  created_time: string
  last_edited_time: string
}

interface MCPDatabase {
  id: string
  name: string
  description: string
  properties: string[]
  last_edited: string
  source: string
}

export default function NotionMCP({ isOpen, onClose, onTaskSelect }: NotionMCPProps) {
  const [tasks, setTasks] = useState<MCPTask[]>([])
  const [databases, setDatabases] = useState<MCPDatabase[]>([])
  const [filteredTasks, setFilteredTasks] = useState<MCPTask[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDatabase, setSelectedDatabase] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(false)
  const [mcpStatus, setMcpStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown')
  const [activeTab, setActiveTab] = useState<'tasks' | 'databases'>('tasks')

  // Check MCP server health on component mount
  useEffect(() => {
    checkMCPHealth()
  }, [])

  // Load databases when dialog opens
  useEffect(() => {
    if (isOpen && mcpStatus === 'healthy') {
      loadDatabases()
    }
  }, [isOpen, mcpStatus])

  // Filter tasks when search/database changes
  useEffect(() => {
    let filtered = tasks

    if (selectedDatabase !== "all") {
      filtered = filtered.filter((task) => task.database_id === selectedDatabase)
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    }

    setFilteredTasks(filtered)
  }, [tasks, selectedDatabase, searchQuery])

  const checkMCPHealth = async () => {
    try {
      const response = await fetch('/api/notion-mcp?action=health-check')
      const data = await response.json()
      
      if (data.available && data.status === 'healthy') {
        setMcpStatus('healthy')
      } else {
        setMcpStatus('error')
      }
    } catch (error) {
      console.error('MCP health check failed:', error)
      setMcpStatus('error')
    }
  }

  const loadDatabases = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/notion-mcp?action=list-databases')
      const data = await response.json()
      
      if (data.databases) {
        setDatabases(data.databases)
        if (data.databases.length > 0) {
          // Auto-load first database
          loadTasks(data.databases[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load MCP databases:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadTasks = async (databaseId: string) => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/notion-mcp?action=query-database&databaseId=${databaseId}`)
      const data = await response.json()
      
      if (data.tasks) {
        setTasks(data.tasks)
        setSelectedDatabase(databaseId)
      }
    } catch (error) {
      console.error('Failed to load MCP tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshTasks = () => {
    if (selectedDatabase && selectedDatabase !== 'all') {
      loadTasks(selectedDatabase)
    } else if (databases.length > 0) {
      loadTasks(databases[0].id)
    }
  }

  const syncToTimeBlocks = async (selectedTasks: MCPTask[]) => {
    try {
      const response = await fetch('/api/notion-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-to-timeblocks',
          data: {
            tasks: selectedTasks,
            date: new Date().toISOString().split('T')[0]
          }
        })
      })
      
      const result = await response.json()
      if (result.success) {
        // Show success message
        console.log('Synced to time blocks:', result.message)
      }
    } catch (error) {
      console.error('Sync to time blocks failed:', error)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high": return "destructive"
      case "medium": return "default"
      case "low": return "secondary"
      default: return "outline"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "in progress": return "bg-yellow-100 text-yellow-800"
      case "to do": return "bg-blue-100 text-blue-800"
      case "done": return "bg-green-100 text-green-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-500" />
            Notion MCP Integration
            <Badge variant={mcpStatus === 'healthy' ? 'default' : 'destructive'} className="ml-2">
              {mcpStatus === 'healthy' ? 'Connected' : 'Disconnected'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {mcpStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-red-500" />
              <span className="text-red-700 text-sm">
                MCP server not available. Please check your MCP_NOTION_SERVER_URL configuration.
              </span>
              <Button 
                onClick={checkMCPHealth} 
                variant="outline" 
                size="sm"
                className="ml-auto"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tasks' | 'databases')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="databases">Databases</TabsTrigger>
          </TabsList>

          <TabsContent value="databases" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Available Databases</h3>
              <Button onClick={loadDatabases} disabled={isLoading} size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {databases.map((db) => (
                <Card key={db.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-blue-500" />
                          <h3 className="font-medium">{db.name}</h3>
                          <Badge variant="outline">MCP</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{db.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {db.properties.map((prop) => (
                            <span key={prop} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                              {prop}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button onClick={() => loadTasks(db.id)}>
                        Load Tasks
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search MCP tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All Databases</option>
                  {databases.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={refreshTasks}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Tasks List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Loading MCP tasks...</span>
                  </div>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {tasks.length === 0 
                    ? "No tasks loaded. Select a database to load tasks."
                    : "No tasks found matching your criteria"
                  }
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{task.title}</h3>
                            <Zap className="h-3 w-3 text-blue-500" />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(task.url, "_blank")
                              }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm text-gray-600">{task.description}</p>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className={getStatusColor(task.status)}>
                              {task.status}
                            </Badge>
                            <Badge variant={getPriorityColor(task.priority)}>{task.priority}</Badge>
                            <Badge variant="outline" className="text-blue-600">
                              MCP
                            </Badge>
                            {task.dueDate && (
                              <Badge variant="outline" className="text-orange-600">
                                Due: {new Date(task.dueDate).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {task.tags.map((tag) => (
                              <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <Button
                          onClick={() =>
                            onTaskSelect({
                              ...task,
                              type: "notion",
                              source: "mcp"
                            })
                          }
                          className="ml-4"
                        >
                          Select
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* MCP Status Footer */}
            <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${mcpStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span>MCP Server: {mcpStatus}</span>
                <Globe className="h-3 w-3 ml-2" />
              </div>
              <span>{filteredTasks.length} tasks available</span>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}