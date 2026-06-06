"use client"
import { useEffect, useState } from "react"
import { RefreshCw, ArrowUp, ArrowDown } from "lucide-react"
import { api } from "@/lib/api"

export default function DriveSyncControls({
  projectId,
  resource,
  itemId,
}: {
  projectId: string
  resource: "docs" | "meetings"
  itemId: string
}) {
  const [link, setLink] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastDirection, setLastDirection] = useState<"push" | "pull" | null>(null)
  const [mode, setMode] = useState<"mapped" | "new" | "existing">("mapped")
  const [driveTarget, setDriveTarget] = useState("")

  useEffect(() => {
    api.get<{ drive_link: string | null }>(`/api/projects/${projectId}/${resource}/${itemId}/drive-link`)
      .then(r => setLink(r.drive_link))
      .catch(() => {})
  }, [projectId, resource, itemId])

  async function sync(e: React.MouseEvent) {
    e.stopPropagation()
    setSyncing(true)
    setLastDirection(null)
    try {
      if (mode === "mapped" && link) {
        // Smart sync: auto-detect direction based on timestamps
        const res = await api.post<{ direction: "push" | "pull" | "noop"; drive_link?: string }>(
          `/api/projects/${projectId}/${resource}/${itemId}/smart-sync`,
          {},
        )
        if (res.direction === "push" || res.direction === "pull") setLastDirection(res.direction)
        if (res.drive_link) setLink(res.drive_link)
      } else {
        // Explicit push for new/existing modes
        const res = await api.post<{ drive_link: string }>(
          `/api/projects/${projectId}/${resource}/${itemId}/sync-to-drive`,
          { mode, drive_url: driveTarget },
        )
        setLink(res.drive_link)
        setLastDirection("push")
        setMode("mapped")
        setDriveTarget("")
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline">Drive</a>}
      <select value={mode} onChange={e => setMode(e.target.value as any)}
        className="text-[10px] border rounded px-1 py-0.5 text-gray-500">
        <option value="mapped">linked</option>
        <option value="new">new</option>
        <option value="existing">existing</option>
      </select>
      {mode === "existing" && (
        <input value={driveTarget} onChange={e => setDriveTarget(e.target.value)}
          placeholder="Drive URL" className="w-24 text-[10px] border rounded px-1 py-0.5" />
      )}
      <button onClick={sync} disabled={syncing}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-black disabled:opacity-50">
        {syncing
          ? <RefreshCw size={10} className="animate-spin" />
          : lastDirection === "push"
            ? <ArrowUp size={10} />
            : lastDirection === "pull"
              ? <ArrowDown size={10} />
              : <RefreshCw size={10} />}
        {syncing ? "…" : "Sync"}
      </button>
    </div>
  )
}
