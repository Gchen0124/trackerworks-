import { NotionTaskItem, NotionTaskStatus } from "@/types/notion"

const PRIORITY_COLOR_MAP: Record<string, string> = {
  high: "bg-red-500",
  urgent: "bg-red-600",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  normal: "bg-blue-500",
}

const STATUS_COLOR_MAP: Record<string, string> = {
  done: "bg-emerald-500",
  completed: "bg-emerald-500",
  "in progress": "bg-blue-500",
  doing: "bg-blue-500",
  "to do": "bg-gray-500",
  todo: "bg-gray-500",
  blocked: "bg-orange-500",
  waiting: "bg-yellow-500",
}

const NOTION_COLOR_TO_TAILWIND: Record<string, string> = {
  default: "bg-slate-500",
  gray: "bg-gray-500",
  brown: "bg-amber-700",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  red: "bg-red-500",
}

const STATUS_BADGE_MAP: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  "in progress": "bg-blue-100 text-blue-800",
  doing: "bg-blue-100 text-blue-800",
  "to do": "bg-gray-100 text-gray-700",
  todo: "bg-gray-100 text-gray-700",
  blocked: "bg-orange-100 text-orange-800",
  waiting: "bg-yellow-100 text-amber-800",
}

const NOTION_BADGE_COLOR: Record<string, string> = {
  default: "bg-slate-100 text-slate-700",
  gray: "bg-gray-100 text-gray-700",
  brown: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  pink: "bg-pink-100 text-pink-800",
  red: "bg-red-100 text-red-800",
}

export function colorFromNotionTask(task: Pick<NotionTaskItem, "priority" | "status">, fallback = "bg-indigo-500"): string {
  const priorityKey = task.priority?.trim().toLowerCase()
  if (priorityKey && PRIORITY_COLOR_MAP[priorityKey]) {
    return PRIORITY_COLOR_MAP[priorityKey]
  }

  const statusKey = task.status?.name?.trim().toLowerCase()
  if (statusKey && STATUS_COLOR_MAP[statusKey]) {
    return STATUS_COLOR_MAP[statusKey]
  }

  const notionColor = task.status?.color?.toLowerCase() || ""
  if (notionColor && NOTION_COLOR_TO_TAILWIND[notionColor]) {
    return NOTION_COLOR_TO_TAILWIND[notionColor]
  }

  return fallback
}

export function statusBadgeClass(status?: NotionTaskStatus): string {
  const statusKey = status?.name?.trim().toLowerCase()
  if (statusKey && STATUS_BADGE_MAP[statusKey]) {
    return STATUS_BADGE_MAP[statusKey]
  }

  const notionColor = status?.color?.toLowerCase()
  if (notionColor && NOTION_BADGE_COLOR[notionColor]) {
    return NOTION_BADGE_COLOR[notionColor]
  }

  return "bg-gray-100 text-gray-700"
}
