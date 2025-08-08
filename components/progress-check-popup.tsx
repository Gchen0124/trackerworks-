"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, AlertTriangle, Volume2, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProgressCheckPopupProps {
  isOpen: boolean
  completedBlock: {
    id: string
    startTime: string
    endTime: string
    task?: {
      title: string
      type: string
      color: string
    }
    goal?: {
      id: string
      label: string
      color: string
    }
  } | null
  onDone: () => void
  onStillDoing: () => void
  onTimeout: () => void
  onClose: () => void
}

export default function ProgressCheckPopup({
  isOpen,
  completedBlock,
  onDone,
  onStillDoing,
  onTimeout,
  onClose,
}: ProgressCheckPopupProps) {
  const [countdown, setCountdown] = useState(15)
  const [isUrgent, setIsUrgent] = useState(false)

  // Debug logging
  useEffect(() => {
    console.log("ProgressCheckPopup props:", { isOpen, completedBlock })
  }, [isOpen, completedBlock])

  // Keep a stable reference to onTimeout to avoid restarting the interval on each render
  const onTimeoutRef = useRef(onTimeout)
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Smooth countdown effect (only depends on isOpen)
  useEffect(() => {
    if (!isOpen) {
      setCountdown(15)
      setIsUrgent(false)
      return
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Call the latest onTimeout without recreating the interval
          onTimeoutRef.current()
          return 0
        }

        // Make it urgent in last 5 seconds
        if (prev <= 5) {
          setIsUrgent(true)
        }

        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isOpen])

  const [currentTime, setCurrentTime] = useState<string>("")

  useEffect(() => {
    if (isOpen) {
      setCurrentTime(new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }))
    }
  }, [isOpen])

  const speakMessage = (message: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      speechSynthesis.speak(utterance)
    }
  }

  if (!completedBlock) return null

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className={cn(
          "max-w-md border-2 border-blue-500"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span>Block Completed!</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "text-lg font-mono px-3 py-1 rounded-full",
                  isUrgent ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
                )}
              >
                {countdown}s
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Time Display */}
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-gray-900">{currentTime || "Loading..."}</div>
            <div className="text-sm text-gray-500 mt-1">Current Time</div>
          </div>

          {/* Completed Block Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Just Completed:</span>
              <span className="text-sm text-gray-500">
                {completedBlock.startTime} - {completedBlock.endTime}
              </span>
            </div>

            {completedBlock.task ? (
              <div className="flex items-center gap-2">
                <Badge className={cn("text-white", completedBlock.task.color)}>{completedBlock.task.type}</Badge>
                <span className="font-medium">
                  {completedBlock.goal?.label
                    ? `${completedBlock.goal.label} : ${completedBlock.task.title}`
                    : completedBlock.task.title}
                </span>
              </div>
            ) : (
              <span className="text-gray-500 italic">No task assigned</span>
            )}
          </div>

          {/* Progress Question */}
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">How did you do?</h3>
            <p className="text-sm text-gray-600">Choose your progress to continue with the next block</p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={onDone} className="flex flex-col items-center gap-2 h-20 bg-green-500 hover:bg-green-600">
              <CheckCircle className="h-6 w-6" />
              <div className="text-center">
                <div className="font-medium">Done!</div>
                <div className="text-xs opacity-90">Task completed</div>
              </div>
            </Button>

            <Button
              onClick={onStillDoing}
              variant="outline"
              className="flex flex-col items-center gap-2 h-20 border-orange-500 text-orange-600 hover:bg-orange-50 bg-transparent"
            >
              <Clock className="h-6 w-6" />
              <div className="text-center">
                <div className="font-medium">Still Doing</div>
                <div className="text-xs">Continue task</div>
              </div>
            </Button>
          </div>

          {/* Auto-timeout Warning */}
          <div
            className={cn(
              "text-center text-xs transition-all duration-300",
              isUrgent ? "text-red-600 font-medium" : "text-gray-500",
            )}
          >
            {isUrgent ? (
              <div className="flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>Auto-pause in {countdown} seconds!</span>
              </div>
            ) : (
              <span>Auto-pause if no response in {countdown} seconds</span>
            )}
          </div>

          {/* Voice Repeat Button */}
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                speakMessage(
                  `Time block completed. Current time is ${currentTime}. How did you do with ${
                    completedBlock.task?.title
                      ? completedBlock.goal?.label
                        ? `${completedBlock.goal.label} : ${completedBlock.task.title}`
                        : completedBlock.task.title
                      : "your task"
                  }?`,
                )
              }
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              <Volume2 className="h-3 w-3 mr-1" />
              Repeat Voice Alert
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
