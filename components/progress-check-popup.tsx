"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, AlertTriangle, Volume2, X, Mic } from "lucide-react"
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
  onStillDoing: (overrideTitle?: string) => void
  onStickToPlan: () => void
  onTimeout: () => void
  onClose: () => void
  isCurrentPinned?: boolean
  currentPinnedTaskTitle?: string
}

export default function ProgressCheckPopup({
  isOpen,
  completedBlock,
  onDone,
  onStillDoing,
  onStickToPlan,
  onTimeout,
  onClose,
  isCurrentPinned = false,
  currentPinnedTaskTitle,
}: ProgressCheckPopupProps) {
  const [countdown, setCountdown] = useState(15)
  const [isUrgent, setIsUrgent] = useState(false)
  // Refs to avoid stale closure in async callbacks
  const isOpenRef = useRef(isOpen)
  const countdownRef = useRef(countdown)
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])
  useEffect(() => { countdownRef.current = countdown }, [countdown])

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
          // Immediately mark session inactive and stop mic to avoid drift
          sessionActiveRef.current = false
          try { stopRecognition() } catch (_) {}
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
  const recognitionRef = useRef<any | null>(null)
  const decisionMadeRef = useRef(false)
  const [isListening, setIsListening] = useState(false)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const hasInitiatedListeningRef = useRef(false)
  const sessionActiveRef = useRef(false)
  const sessionIdRef = useRef(0)
  const intentionalStopRef = useRef(false)
  const recognitionStartingRef = useRef(false)
  const lastStartAtRef = useRef<number>(0)

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
      try {
        // Pause recognition while we speak to avoid feedback
        stopRecognition()
      } catch (_) {}
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      utterance.onend = () => {
        // After TTS finishes, resume listening if popup is still active
        if (isOpenRef.current && countdownRef.current > 0 && !decisionMadeRef.current && sessionActiveRef.current) {
          // slight delay to allow audio device handoff
          setTimeout(() => startRecognition(), 120)
        }
      }
      speechSynthesis.speak(utterance)
    }
  }

  // Best-effort mic warm-up to ensure permission and open device
  const warmUpMic = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      // Immediately stop to free the device for SpeechRecognition
      stream.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
    } catch (e) {
      // Permission denied or not available; recognition may still work in some engines
      console.warn("Mic warm-up failed:", e)
    }
  }

  const stopMicStream = () => {
    try {
      const s = audioStreamRef.current
      if (s) {
        s.getTracks().forEach((t) => t.stop())
      }
    } catch (_) {
      // no-op
    } finally {
      audioStreamRef.current = null
    }
  }

  // Normalize and evaluate speech transcript to trigger actions
  const handleTranscript = (raw: string) => {
    const text = raw.toLowerCase().trim()
    // Guard: ignore empty
    if (!text) return
    // If user clearly says done
    const donePhrases = [
      "done",
      "i'm done",
      "im done",
      "finished",
      "finish",
      "complete",
      "completed",
      "all done",
      "i'm finished",
      "task done",
    ]
    // If user wants to continue / still doing
    const continuePhrases = [
      "still doing",
      "still working",
      "continue",
      "keep going",
      "keep working",
      "not done",
      "need more time",
      "more time",
      "continue task",
      "carry on",
    ]

    // If user wants to stick to plan (when current is pinned)
    const stickPhrases = [
      "stick to plan",
      "follow the plan",
      "do planned task",
      "do the planned task",
      "go with the plan",
    ]

    // Pattern: "I did <something> instead"
    const insteadMatch = text.match(/^(?:i\s+(?:have\s+)?did|i\s+did|i\'ve\s+done|i\s+did\s+do)\s+(.+?)\s+instead\.?$/i) ||
      text.match(/\b(i\s+did)\s+(.+?)\s+instead\b/i)

    if (insteadMatch && !decisionMadeRef.current) {
      const override = (insteadMatch[1] || insteadMatch[2] || "").trim()
      if (override) {
        decisionMadeRef.current = true
        stopRecognition()
        onStillDoing(override)
        return
      }
    }

    // Basic contains matching
    const saysDone = donePhrases.some((p) => text.includes(p))
    const saysContinue = continuePhrases.some((p) => text.includes(p))
    const saysStick = stickPhrases.some((p) => text.includes(p))

    if (saysDone && !decisionMadeRef.current) {
      decisionMadeRef.current = true
      stopRecognition()
      onDone()
      return
    }
    if (saysContinue && !decisionMadeRef.current) {
      decisionMadeRef.current = true
      stopRecognition()
      onStillDoing()
      return
    }
    if (isCurrentPinned && saysStick && !decisionMadeRef.current) {
      decisionMadeRef.current = true
      stopRecognition()
      onStickToPlan()
      return
    }
  }

  const stopRecognition = () => {
    try {
      intentionalStopRef.current = true
      const rec: any = recognitionRef.current
      if (rec && typeof rec.stop === "function") {
        console.debug("[Voice] Stopping recognition")
        rec.onresult = null
        rec.onend = null
        rec.onerror = null
        if (typeof rec.abort === "function") {
          // Abort to minimize final callbacks; Chrome fires 'aborted' which we'll ignore when inactive
          rec.abort()
        } else {
          rec.stop()
        }
      }
    } catch (_) {
      // no-op
    } finally {
      recognitionRef.current = null
      setIsListening(false)
      // Always stop mic stream with recognition lifecycle
      stopMicStream()
      // Allow future restarts after a tick
      setTimeout(() => {
        intentionalStopRef.current = false
      }, 50)
    }
  }

  const startRecognition = () => {
    // Avoid starting multiple times
    if (isListening || decisionMadeRef.current) return
    if (!sessionActiveRef.current) return
    if (recognitionStartingRef.current) return
    const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    // Debounce rapid restarts
    const now = Date.now()
    if (now - lastStartAtRef.current < 250) {
      console.debug("[Voice] Debounced recognition start")
      return
    }

    try {
      recognitionStartingRef.current = true
      lastStartAtRef.current = now
      const recognition = new SpeechRecognition()
      recognition.lang = navigator.language || "en-US"
      recognition.interimResults = false
      recognition.continuous = true
      recognition.maxAlternatives = 1

      const mySessionId = sessionIdRef.current

      recognition.onresult = (event: any) => {
        if (mySessionId !== sessionIdRef.current || !sessionActiveRef.current) return
        const lastIdx = event.results.length - 1
        const transcript = event.results[lastIdx][0].transcript || ""
        handleTranscript(transcript)
      }

      recognition.onstart = () => {
        if (mySessionId !== sessionIdRef.current || !sessionActiveRef.current) return
        console.debug("[Voice] Recognition started")
        setIsListening(true)
        recognitionStartingRef.current = false
      }

      recognition.onend = () => {
        if (mySessionId !== sessionIdRef.current) return
        // Some browsers auto-end; restart if still within window and no decision
        if (intentionalStopRef.current) {
          console.debug("[Voice] Recognition ended intentionally; not restarting")
          recognitionStartingRef.current = false
          setIsListening(false)
          return
        }
        if (isOpenRef.current && countdownRef.current > 0 && !decisionMadeRef.current && sessionActiveRef.current) {
          try {
            console.debug("[Voice] Recognition ended, restarting...")
            setTimeout(() => {
              if (mySessionId === sessionIdRef.current && sessionActiveRef.current && !decisionMadeRef.current && isOpenRef.current && countdownRef.current > 0) {
                startRecognition()
              }
            }, 200)
          } catch (_) {
            // restart may throw if already started; ignore
          }
        } else {
          console.debug("[Voice] Recognition ended, not restarting")
          setIsListening(false)
        }
      }

      recognition.onerror = (_e: any) => {
        // Ignore late or inactive-session errors
        const code = (_e && (_e.error || _e.name)) || ""
        if (mySessionId !== sessionIdRef.current || !sessionActiveRef.current || !isOpen) {
          if (code === "aborted") {
            // common during intentional abort/stop after close
            return
          }
          return
        }
        // On active session, log once and handle
        console.warn("[Voice] Recognition error", _e)
        if (code === "aborted") {
          // If we didn't intend to stop, schedule a gentle restart
          if (!intentionalStopRef.current && sessionActiveRef.current) {
            setTimeout(() => startRecognition(), 250)
          }
          return
        }
        if (code === "not-allowed" || code === "service-not-allowed") {
          console.warn("[Voice] Mic or service not allowed; disabling for this session")
          sessionActiveRef.current = false
          stopRecognition()
          return
        }
        if (code === "no-speech") {
          // Try a gentle restart once
          if (sessionActiveRef.current && !decisionMadeRef.current) {
            setTimeout(() => startRecognition(), 300)
            return
          }
        }
        stopRecognition()
      }

      recognitionRef.current = recognition
      console.debug("[Voice] Starting recognition")
      recognition.start()
    } catch (_) {
      // If start fails, ensure state is clean
      recognitionRef.current = null
      setIsListening(false)
    }
  }

  // Manage recognition lifecycle within 15s popup window
  useEffect(() => {
    if (!isOpen) {
      // Reset flags when closed
      decisionMadeRef.current = false
      hasInitiatedListeningRef.current = false
      sessionActiveRef.current = false
      try { (window as any).speechSynthesis?.cancel?.() } catch (_) {}
      stopRecognition()
      return
    }
    // When popup opens, begin listening if supported
    if (isOpen && countdown > 0 && !hasInitiatedListeningRef.current) {
      // Fresh session reset to avoid carryover between popups
      decisionMadeRef.current = false
      intentionalStopRef.current = false
      recognitionStartingRef.current = false
      lastStartAtRef.current = 0
      sessionIdRef.current += 1

      sessionActiveRef.current = true
      hasInitiatedListeningRef.current = true
      // Warm up mic first (non-blocking)
      warmUpMic().finally(() => {
        const startAfterTTS = () => {
          // If no TTS support, just start
          if (!("speechSynthesis" in window)) {
            if (isOpenRef.current && countdownRef.current > 0 && !decisionMadeRef.current && sessionActiveRef.current) startRecognition()
            return
          }
          // Wait until speech synthesis is not speaking
          const maxWaitMs = 4000
          const intervalMs = 100
          let waited = 0
          const iv = setInterval(() => {
            const speaking = (window as any).speechSynthesis?.speaking
            if (waited === 0) {
              console.debug("[Voice] Waiting for TTS to finish...")
            }
            if (!speaking || waited >= maxWaitMs) {
              clearInterval(iv)
              if (isOpenRef.current && countdownRef.current > 0 && !decisionMadeRef.current && sessionActiveRef.current) {
                // slight delay to allow audio device handoff from TTS
                console.debug("[Voice] TTS finished or max wait reached, starting recognition soon")
                setTimeout(() => startRecognition(), 120)
              }
            } else {
              waited += intervalMs
            }
          }, intervalMs)
        }
        // Kick off the wait logic
        startAfterTTS()
      })
    }
    // Stop when timer hits 0
    if (countdown === 0) {
      sessionActiveRef.current = false
      stopRecognition()
    }
    return () => {
      // Cleanup on unmount/effect change
      if (!isOpenRef.current || countdownRef.current === 0) {
        sessionActiveRef.current = false
        stopRecognition()
      }
    }
  }, [isOpen, countdown])

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
              {isListening && (
                <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                  <Mic className="h-3 w-3" />
                  Listening
                </div>
              )}
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
            <p className="text-sm text-gray-600">
              Choose your progress to continue with the next block
              {isCurrentPinned && currentPinnedTaskTitle ? (
                <>
                  <br />
                  <span className="text-xs text-blue-600">
                    Upcoming is pinned: {currentPinnedTaskTitle}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          {/* Action Buttons */}
          <div className={cn("grid gap-3", isCurrentPinned ? "grid-cols-3" : "grid-cols-2")}>
            {isCurrentPinned && (
              <Button onClick={onStickToPlan} className="flex flex-col items-center gap-2 h-20 bg-sky-500 hover:bg-sky-600">
                <CheckCircle className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">stick to plan</div>
                  <div className="text-xs opacity-90">postpone last task</div>
                </div>
              </Button>
            )}
            <Button onClick={onDone} className="flex flex-col items-center gap-2 h-20 bg-green-500 hover:bg-green-600">
              <CheckCircle className="h-6 w-6" />
              <div className="text-center">
                <div className="font-medium">Done!</div>
                <div className="text-xs opacity-90">Task completed</div>
              </div>
            </Button>

            <Button
              onClick={() => onStillDoing()}
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
                  }?${isCurrentPinned && currentPinnedTaskTitle ? ` You determined to do ${currentPinnedTaskTitle} for now.` : ""}`,
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
