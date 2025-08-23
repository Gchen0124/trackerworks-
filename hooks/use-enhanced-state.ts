"use client"

import { useState, useEffect, useCallback } from "react"

// Hook to gradually migrate localStorage state to database
// Can be adopted component by component without breaking existing functionality

interface StateOptions {
  enableDatabaseSync?: boolean
  fallbackToLocalStorage?: boolean
}

export function useTaskCompletions(itemIds: string[], options: StateOptions = {}) {
  const { enableDatabaseSync = false, fallbackToLocalStorage = true } = options
  
  const [completions, setCompletions] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(false)

  // Load from database if enabled, otherwise from localStorage
  useEffect(() => {
    const loadCompletions = async () => {
      if (!itemIds.length) return

      setIsLoading(true)
      try {
        if (enableDatabaseSync) {
          // Try database first
          const response = await fetch(`/api/local/state-sync?action=bulk-completions&itemIds=${itemIds.join(',')}`)
          if (response.ok) {
            const data = await response.json()
            setCompletions(data.completions || {})
            setIsLoading(false)
            return
          }
        }
        
        // Fallback to localStorage (existing behavior)
        if (fallbackToLocalStorage) {
          const STORAGE_KEY = "nestedTodosDone:v1"
          try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) {
              const data = JSON.parse(raw)
              const filtered: Record<string, boolean> = {}
              itemIds.forEach(id => {
                if (data[id] !== undefined) {
                  filtered[id] = Boolean(data[id])
                }
              })
              setCompletions(filtered)
            }
          } catch (e) {
            console.warn('Failed to load from localStorage:', e)
          }
        }
      } catch (error) {
        console.error('Failed to load task completions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadCompletions()
  }, [itemIds.join(','), enableDatabaseSync, fallbackToLocalStorage])

  const setTaskCompletion = useCallback(async (itemId: string, completed: boolean) => {
    // Update local state immediately
    setCompletions(prev => ({ ...prev, [itemId]: completed }))
    
    // Sync to both database and localStorage for redundancy during transition
    try {
      if (enableDatabaseSync) {
        await fetch('/api/local/state-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'task-completion',
            itemId,
            completed
          })
        })
      }
      
      if (fallbackToLocalStorage) {
        const STORAGE_KEY = "nestedTodosDone:v1"
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        existing[itemId] = completed
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
      }
    } catch (error) {
      console.error('Failed to sync task completion:', error)
      // Revert local state on error
      setCompletions(prev => ({ ...prev, [itemId]: !completed }))
    }
  }, [enableDatabaseSync, fallbackToLocalStorage])

  return {
    completions,
    setTaskCompletion,
    isLoading,
    isChecked: (itemId: string) => Boolean(completions[itemId]),
    setChecked: (itemId: string, checked: boolean) => setTaskCompletion(itemId, checked)
  }
}

// Hook for progress popup analytics (optional enhancement)
export function useProgressTracking() {
  const logProgressResponse = useCallback(async (
    blockId: string, 
    responseType: 'done' | 'still_doing' | 'stick_to_plan' | 'timeout',
    options: {
      responseTimeMs?: number
      overrideTitle?: string
      voiceTranscript?: string
      affectedBlockIds?: string[]
    } = {}
  ) => {
    try {
      await fetch('/api/local/state-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'progress-response',
          blockId,
          responseType,
          options
        })
      })
    } catch (error) {
      console.error('Failed to log progress response:', error)
    }
  }, [])

  return { logProgressResponse }
}

// Hook for drag operation analytics (optional enhancement)
export function useDragTracking() {
  const logDragOperation = useCallback(async (operation: {
    type: 'simple_move' | 'expand_fill' | 'bulk_move'
    sourceBlockId?: string
    targetBlockIds: string[]
    taskData: any
    affectedBlocks?: string[]
    wasExpandMode?: boolean
    pinnedBlocksHit?: string[]
  }) => {
    try {
      await fetch('/api/local/state-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'drag-operation',
          operation
        })
      })
    } catch (error) {
      console.error('Failed to log drag operation:', error)
    }
  }, [])

  return { logDragOperation }
}