"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { api } from "@/lib/api"

function SettingsContent() {
  const params = useSearchParams()
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg] = useState(params.get("drive") === "connected" ? "Google Drive connected!" : "")

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/auth/google-drive/status")
      .then(r => setDriveConnected(r.connected))
      .catch(() => setDriveConnected(false))
  }, [])

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

  return (
    <div className="p-8 max-w-lg space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* Google Drive */}
      <section className="border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M6.5 20L1 11l4.5-8h13L23 11l-4.5 8H6.5z" stroke="#4285F4" strokeWidth="1.5"/>
            <path d="M12 3l5 9H7l5-9z" fill="#FBBC05"/>
            <path d="M1 11h22" stroke="#34A853" strokeWidth="1.5"/>
          </svg>
          <h3 className="font-medium">Google Drive</h3>
          {driveConnected === true && (
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Connected</span>
          )}
        </div>

        <p className="text-sm text-gray-500">
          Sync docs and meetings to your Google Drive.
          Files are saved under <code className="bg-gray-100 px-1 rounded">ResearchBuddy / &lt;project&gt; /</code>
        </p>

        {msg && (
          <p className={`text-sm ${msg.includes("connected") ? "text-green-600" : "text-red-600"}`}>{msg}</p>
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
