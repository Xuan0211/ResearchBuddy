"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Database, ExternalLink, Folder, RefreshCw, Settings2 } from "lucide-react"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"

type DriveRootResponse = {
  configured: boolean
  settings_path: string
  root_folder_id: string
  root_folder_name: string
  root_folder_link: string
  source: string
}

type BatchDriveSyncResponse = {
  ok: boolean
  root: { root_folder_name: string; root_folder_link: string }
  docs?: { synced: number; warnings?: string[] } | null
  meetings?: { synced: number; warnings?: string[] } | null
}

function SettingsContent() {
  const params = useSearchParams()
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [driveRoot, setDriveRoot] = useState<DriveRootResponse | null>(null)
  const [driveMode, setDriveMode] = useState<"default" | "existing" | "new">("default")
  const [folderUrl, setFolderUrl] = useState("")
  const [folderName, setFolderName] = useState("")
  const [parentFolderUrl, setParentFolderUrl] = useState("")
  const [syncScope, setSyncScope] = useState<"all" | "docs" | "meetings">("all")
  const [syncMode, setSyncMode] = useState<"mapped" | "new">("mapped")
  const [syncResult, setSyncResult] = useState<BatchDriveSyncResponse | null>(null)
  const [projectBusy, setProjectBusy] = useState<"" | "root" | "sync">("")
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg] = useState(params.get("drive") === "connected" ? "Google Drive connected!" : "")

  useEffect(() => {
    Promise.all([
      api.get<{ connected: boolean }>("/api/auth/google-drive/status").catch(() => ({ connected: false })),
      api.get<Project[]>("/api/projects").catch(() => [] as Project[]),
    ]).then(([drive, list]) => {
      setDriveConnected(drive.connected)
      setProjects(list)
      setSelectedProjectId(prev => prev || list[0]?.id || "")
    })
  }, [])

  useEffect(() => {
    if (!selectedProjectId) return
    api.get<DriveRootResponse>(`/api/projects/${selectedProjectId}/drive-root`)
      .then(setDriveRoot)
      .catch(() => setDriveRoot(null))
    setSyncResult(null)
  }, [selectedProjectId])

  async function connectDrive() {
    setConnecting(true)
    try {
      const { url } = await api.get<{ url: string }>("/api/auth/google-drive/authorize")
      window.location.href = url
    } catch (err: any) {
      setMsg(err.message)
      setConnecting(false)
    }
  }

  async function disconnectDrive() {
    await api.delete("/api/auth/google-drive/disconnect")
    setDriveConnected(false)
    setMsg("")
  }

  async function saveDriveRoot() {
    if (!selectedProjectId) return
    setProjectBusy("root")
    setMsg("")
    try {
      const root = await api.put<DriveRootResponse>(`/api/projects/${selectedProjectId}/drive-root`, {
        mode: driveMode,
        folder_url: folderUrl,
        folder_name: folderName,
        parent_folder_url: parentFolderUrl,
      })
      setDriveRoot(root)
      setMsg("Google Drive workspace saved.")
    } catch (err: any) {
      setMsg(err.message || "Google Drive workspace setup failed.")
    } finally {
      setProjectBusy("")
    }
  }

  async function syncProjectDrive() {
    if (!selectedProjectId) return
    setProjectBusy("sync")
    setMsg("")
    try {
      const result = await api.post<BatchDriveSyncResponse>(`/api/projects/${selectedProjectId}/drive/sync`, {
        scope: syncScope,
        mode: syncMode,
      })
      setSyncResult(result)
      setMsg("Google Drive sync finished.")
    } catch (err: any) {
      setMsg(err.message || "Google Drive sync failed.")
    } finally {
      setProjectBusy("")
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
    <div className="p-8 max-w-4xl space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* Google Drive */}
      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M6.5 20L1 11l4.5-8h13L23 11l-4.5 8H6.5z" stroke="#4285F4" strokeWidth="1.5"/>
            <path d="M12 3l5 9H7l5-9z" fill="#FBBC05"/>
            <path d="M1 11h22" stroke="#34A853" strokeWidth="1.5"/>
          </svg>
          <h3 className="font-medium">Google Drive Account</h3>
          {driveConnected === true && (
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Connected</span>
          )}
        </div>

        <p className="text-sm text-gray-500">
          Sync docs and meetings to your Google Drive.
          Files are saved under <code className="bg-gray-100 px-1 rounded">ResearchBuddy / &lt;project&gt; /</code>
        </p>

        {msg && (
          <p className={`text-sm ${msg.toLowerCase().includes("failed") || msg.toLowerCase().includes("error") ? "text-red-600" : "text-green-600"}`}>{msg}</p>
        )}

        {driveConnected === null ? (
          <p className="text-sm text-gray-400">Checking…</p>
        ) : driveConnected ? (
          <div className="flex gap-2">
            <span className="text-sm text-green-600">✓ Your Drive is connected</span>
            <button onClick={disconnectDrive} className="ml-auto text-xs text-red-500 hover:underline">
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connectDrive}
            disabled={connecting}
            className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {connecting ? "Redirecting…" : "Connect Google Drive"}
          </button>
        )}
      </section>

      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Folder size={18} />
          <h3 className="font-medium">Google Drive Workspace</h3>
        </div>
        <p className="text-sm text-gray-500">
          Choose the Drive folder used by a project. ResearchBuddy keeps the git workspace as source of truth and syncs Docs/Meetings into this folder.
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm text-gray-700"
          >
            {projects.length === 0 ? (
              <option value="">No projects yet</option>
            ) : projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          {driveRoot?.root_folder_link && (
            <a href={driveRoot.root_folder_link} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-blue-600 hover:bg-blue-50">
              Open Drive <ExternalLink size={13} />
            </a>
          )}
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          {driveRoot?.configured ? (
            <span>Current folder: <b className="text-gray-700">{driveRoot.root_folder_name}</b> · <code>{driveRoot.settings_path}</code></span>
          ) : (
            <span>No Drive folder configured for this project yet.</span>
          )}
        </div>

        <div className="grid gap-3">
          <select value={driveMode} onChange={e => setDriveMode(e.target.value as any)}
            className="rounded-lg border px-3 py-2 text-sm text-gray-700">
            <option value="default">Use ResearchBuddy / project name</option>
            <option value="existing">Use an existing Drive folder</option>
            <option value="new">Create a new Drive folder</option>
          </select>
          {driveMode === "existing" && (
            <input value={folderUrl} onChange={e => setFolderUrl(e.target.value)}
              placeholder="Drive folder URL or id"
              className="rounded-lg border px-3 py-2 text-sm" />
          )}
          {driveMode === "new" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={folderName} onChange={e => setFolderName(e.target.value)}
                placeholder="Folder name"
                className="rounded-lg border px-3 py-2 text-sm" />
              <input value={parentFolderUrl} onChange={e => setParentFolderUrl(e.target.value)}
                placeholder="Optional parent folder URL"
                className="rounded-lg border px-3 py-2 text-sm" />
            </div>
          )}
          <button
            onClick={saveDriveRoot}
            disabled={!selectedProjectId || !driveConnected || !!projectBusy}
            className="w-fit rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {projectBusy === "root" ? "Saving…" : "Save workspace folder"}
          </button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RefreshCw size={15} /> Manual sync
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select value={syncScope} onChange={e => setSyncScope(e.target.value as any)}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700">
              <option value="all">Docs and meetings</option>
              <option value="docs">Docs only</option>
              <option value="meetings">Meetings only</option>
            </select>
            <select value={syncMode} onChange={e => setSyncMode(e.target.value as any)}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700">
              <option value="mapped">Update mapped Drive files</option>
              <option value="new">Create new Drive files</option>
            </select>
            <button
              onClick={syncProjectDrive}
              disabled={!selectedProjectId || !driveConnected || !!projectBusy}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {projectBusy === "sync" ? "Syncing…" : "Sync"}
            </button>
          </div>
          {syncResult && (
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              Synced to {syncResult.root.root_folder_name}. Docs: {syncResult.docs?.synced ?? 0}; Meetings: {syncResult.meetings?.synced ?? 0}.
            </div>
          )}
        </div>
      </section>

      <section className="border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database size={18} />
          <h3 className="font-medium">Zotero</h3>
        </div>
        <p className="text-sm text-gray-500">
          Zotero is configured per project so Papers can preserve library keys, BibTeX, and local citation workflows. Open a project’s Papers page to connect or resync; this Settings area keeps the integration visible as part of workspace setup.
        </p>
      </section>

      <section className="border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Settings2 size={18} />
          <h3 className="font-medium">Agent-readable workspace</h3>
        </div>
        <p className="text-sm text-gray-500">
          Docs and Skills attach into module-local folders in the git workspace. After clone, local agents can see the same papers, writing projects, prototypes, images, docs, and skills that humans see in the app.
        </p>
      </section>
    </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <SettingsContent />
    </Suspense>
  )
}
