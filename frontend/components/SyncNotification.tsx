"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, CloudUpload, Loader2, X } from "lucide-react"
import { api } from "@/lib/api"

interface SyncItem {
  project_id: string
  project_name: string
  item_type: string
  item_id: string
  item_title: string
  sync_target: "drive" | "zotero"
  last_modified: string | null
  last_synced: string | null
}

type Phase = "idle" | "checking" | "pending" | "syncing" | "done" | "error"

const TYPE_LABEL: Record<string, string> = {
  doc: "Doc",
  meeting: "Meeting",
  "paper_notes": "Paper notes",
  "mtg-log": "MTG Log",
  "paper_zotero": "Paper",
}

const TARGET_LABEL: Record<string, string> = {
  drive: "Drive",
  zotero: "Zotero",
}

export default function SyncNotification() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [items, setItems] = useState<SyncItem[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const checkedRef = useRef(false)

  const check = useCallback(async () => {
    if (checkedRef.current) return
    checkedRef.current = true
    setPhase("checking")
    try {
      const res = await api.get<{ items: SyncItem[]; total: number; drive_connected: boolean }>("/api/sync/status")
      if (res.total > 0) {
        setItems(res.items)
        setPhase("pending")
      } else {
        setPhase("idle")
      }
    } catch {
      setPhase("idle")
    }
  }, [])

  useEffect(() => {
    // Delay slightly so auth token is definitely available
    const t = setTimeout(check, 1500)
    return () => clearTimeout(t)
  }, [check])

  async function syncAll() {
    setPhase("syncing")
    setProgress({ done: 0, total: items.length, failed: 0 })
    try {
      const res = await api.post<{ synced: number; failed: number; skipped: number; results: any[] }>(
        "/api/sync/bulk",
        { items: null }
      )
      setProgress({ done: res.synced, total: items.length, failed: res.failed })
      setPhase("done")
      // Auto-dismiss success after 5 seconds
      if (res.failed === 0) setTimeout(() => setDismissed(true), 5000)
    } catch (err: any) {
      setPhase("error")
    }
  }

  function dismiss() {
    setDismissed(true)
  }

  if (dismissed || phase === "idle" || phase === "checking") return null

  // Group by project for display
  const byProject: Record<string, SyncItem[]> = {}
  for (const item of items) {
    if (!byProject[item.project_id]) byProject[item.project_id] = []
    byProject[item.project_id].push(item)
  }

  return (
    <div className="fixed bottom-5 left-5 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 border-b border-gray-100">
        {phase === "syncing" ? (
          <Loader2 size={15} className="text-blue-500 animate-spin flex-shrink-0" />
        ) : phase === "done" ? (
          <CheckCircle2 size={15} className={progress.failed > 0 ? "text-yellow-500" : "text-green-500"} />
        ) : phase === "error" ? (
          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
        ) : (
          <CloudUpload size={15} className="text-amber-500 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {phase === "pending" && (
            <p className="text-xs font-medium text-gray-800">
              {items.length} {items.length === 1 ? "item" : "items"} not synced
            </p>
          )}
          {phase === "syncing" && (
            <p className="text-xs font-medium text-gray-800">
              Syncing… {progress.done}/{progress.total}
            </p>
          )}
          {phase === "done" && progress.failed === 0 && (
            <p className="text-xs font-medium text-green-700">All synced!</p>
          )}
          {phase === "done" && progress.failed > 0 && (
            <p className="text-xs font-medium text-yellow-700">
              {progress.done} synced · {progress.failed} failed
            </p>
          )}
          {phase === "error" && (
            <p className="text-xs font-medium text-red-700">Sync failed</p>
          )}
        </div>

        <button
          onClick={dismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body — only in pending/error states */}
      {(phase === "pending" || phase === "error") && (
        <>
          <div className="px-4 py-2.5">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Some documents were edited after the last sync. Sync now to keep your data safe.
            </p>

            {/* Item list (collapsible) */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 text-[11px] text-blue-500 hover:underline"
            >
              {expanded ? "Hide details" : "Show details"}
            </button>

            {expanded && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {Object.entries(byProject).map(([pid, pitems]) => (
                  <div key={pid}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      {pitems[0].project_name}
                    </p>
                    {pitems.map(item => (
                      <div key={`${item.item_type}-${item.item_id}`} className="flex items-center gap-1.5 py-0.5">
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {TYPE_LABEL[item.item_type] || item.item_type}
                        </span>
                        <span className="text-[11px] text-gray-700 truncate flex-1">{item.item_title}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">→ {TARGET_LABEL[item.sync_target]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 pb-3 flex gap-2">
            <button
              onClick={syncAll}
              className="flex-1 bg-black text-white text-xs py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Sync all
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border hover:bg-gray-50"
            >
              Later
            </button>
          </div>
        </>
      )}

      {/* Progress bar */}
      {phase === "syncing" && progress.total > 0 && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
