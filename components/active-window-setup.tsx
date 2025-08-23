"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type ActiveWindow = {
  activeStartMinute: number | null
  activeEndMinute: number | null
}

function toMinuteIndex(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export default function ActiveWindowSetup({
  open,
  onClose,
  onSave,
  defaultStart = "08:00",
  defaultEnd = "23:00",
}: {
  open: boolean
  onClose: () => void
  onSave: (payload: ActiveWindow) => Promise<void> | void
  defaultStart?: string
  defaultEnd?: string
}) {
  const [start, setStart] = useState<string>(defaultStart)
  const [end, setEnd] = useState<string>(defaultEnd)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ activeStartMinute: toMinuteIndex(start), activeEndMinute: toMinuteIndex(end) })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your active hours for today</DialogTitle>
          <DialogDescription>
            We'll mark your rest/sleep time as dark hours on the grid to help you focus your day.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div>
            <Label htmlFor="active-start">Wake up time (active start)</Label>
            <Input id="active-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="active-end">Planned rest time (active end)</Label>
            <Input id="active-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

