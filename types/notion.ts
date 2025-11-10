export interface NotionTaskStatus {
  name: string
  color?: string
}

export interface NotionTaskItem {
  id: string
  title: string
  url: string
  status?: NotionTaskStatus
  priority?: string
  tags: string[]
  description?: string
  dueDate?: string
  databaseId?: string
  databaseName?: string
  createdTime?: string
  lastEditedTime?: string
  source: "notion"
}

export interface NotionTaskResponse {
  ok: boolean
  items: NotionTaskItem[]
  hasMore?: boolean
  nextCursor?: string | null
  database?: {
    id: string
    title: string
  }
  error?: string
}
