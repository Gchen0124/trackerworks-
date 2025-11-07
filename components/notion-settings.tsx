"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react"

interface NotionSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export default function NotionSettings({ isOpen, onClose }: NotionSettingsProps) {
  const [notionToken, setNotionToken] = useState("")
  const [notionDailyRitualDbId, setNotionDailyRitualDbId] = useState("")
  const [notionTaskCalDbId, setNotionTaskCalDbId] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Load existing settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/local/settings")
      if (res.ok) {
        const data = await res.json()
        setNotionToken(data.notionToken || "")
        setNotionDailyRitualDbId(data.notionDailyRitualDbId || "")
        setNotionTaskCalDbId(data.notionTaskCalDbId || "")
      }
    } catch (error) {
      console.error("Failed to load settings:", error)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)
    setTestResult(null)

    try {
      const res = await fetch("/api/local/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionToken,
          notionDailyRitualDbId,
          notionTaskCalDbId,
        }),
      })

      if (res.ok) {
        setSaveMessage("Settings saved successfully!")
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      } else {
        setSaveMessage("Failed to save settings. Please try again.")
      }
    } catch (error) {
      console.error("Save error:", error)
      setSaveMessage("An error occurred while saving.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      // First save the credentials
      await handleSave()

      // Then test the connection
      const res = await fetch("/api/notion/verify")
      const data = await res.json()

      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: `✓ Connected! Daily Ritual: "${data.dailyRitual?.title || "Found"}", Task Calendar: "${data.taskCalendar?.title || "Found"}"`,
        })
      } else {
        setTestResult({
          ok: false,
          message: `✗ Connection failed: ${data.error || "Unknown error"}`,
        })
      }
    } catch (error: any) {
      setTestResult({
        ok: false,
        message: `✗ Connection error: ${error.message || "Network error"}`,
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Notion Integration Settings</DialogTitle>
          <DialogDescription>
            Connect your Notion workspace to import goals and tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Instructions */}
          <Alert>
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold">How to get your Notion credentials:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>
                  Create a Notion integration at{" "}
                  <a
                    href="https://www.notion.so/my-integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    notion.so/my-integrations
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Copy the "Internal Integration Token"</li>
                <li>Share your databases with the integration</li>
                <li>Copy the database IDs from the database URLs</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Notion Token */}
          <div className="space-y-2">
            <Label htmlFor="notionToken">Notion Integration Token</Label>
            <Input
              id="notionToken"
              type="password"
              placeholder="secret_xxxxxxxxxxxx"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your Notion internal integration token
            </p>
          </div>

          {/* Daily Ritual DB ID */}
          <div className="space-y-2">
            <Label htmlFor="dailyRitualDbId">Daily Ritual Database ID</Label>
            <Input
              id="dailyRitualDbId"
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={notionDailyRitualDbId}
              onChange={(e) => setNotionDailyRitualDbId(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Database ID from your Daily Ritual database URL
            </p>
          </div>

          {/* Task Calendar DB ID */}
          <div className="space-y-2">
            <Label htmlFor="taskCalDbId">Task Calendar Database ID</Label>
            <Input
              id="taskCalDbId"
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={notionTaskCalDbId}
              onChange={(e) => setNotionTaskCalDbId(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Database ID from your Task Calendar database URL
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              <div className="flex items-start gap-2">
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5" />
                )}
                <AlertDescription className="text-sm">
                  {testResult.message}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Save Message */}
          {saveMessage && (
            <Alert>
              <AlertDescription className="text-sm">{saveMessage}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
            <Button
              onClick={handleTest}
              disabled={isTesting || !notionToken || !notionDailyRitualDbId || !notionTaskCalDbId}
              variant="outline"
              className="flex-1"
            >
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
