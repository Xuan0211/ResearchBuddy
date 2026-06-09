"use client"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, CheckCircle2, KeyRound, Trash2, UserRound } from "lucide-react"
import { api, auth } from "@/lib/api"

type Account = { id: string; name: string; email: string }

function SettingsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [account, setAccount] = useState<Account | null>(null)
  const [accountForm, setAccountForm] = useState({ name: "", email: "" })
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" })
  const [deletePassword, setDeletePassword] = useState("")
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [busy, setBusy] = useState<"" | "account" | "password" | "delete">("")
  const [msg, setMsg] = useState(params.get("drive") === "connected" ? "Google Drive connected." : "")
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      auth.me(),
      api.get<{ connected: boolean }>("/api/auth/google-drive/status").catch(() => ({ connected: false })),
    ]).then(([me, drive]) => {
      setAccount(me)
      setAccountForm({ name: me.name, email: me.email })
      setDriveConnected(drive.connected)
    }).catch((err: any) => setError(err.message || "Could not load settings"))
  }, [])

  function showMessage(text: string) {
    setError("")
    setMsg(text)
  }

  function showError(err: unknown, fallback: string) {
    setMsg("")
    setError(err instanceof Error ? err.message : fallback)
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault()
    setBusy("account")
    try {
      const updated = await api.patch<Account>("/api/auth/me", accountForm)
      setAccount(updated)
      setAccountForm({ name: updated.name, email: updated.email })
      showMessage("Account updated.")
    } catch (err) {
      showError(err, "Could not update account")
    } finally {
      setBusy("")
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy("password")
    try {
      await api.patch<void>("/api/auth/password", passwordForm)
      setPasswordForm({ current_password: "", new_password: "" })
      showMessage("Password updated.")
    } catch (err) {
      showError(err, "Could not update password")
    } finally {
      setBusy("")
    }
  }

  async function connectDrive() {
    setConnecting(true)
    try {
      const { url } = await api.get<{ url: string }>("/api/auth/google-drive/authorize")
      window.location.href = url
    } catch (err) {
      showError(err, "Could not start Google Drive authorization")
      setConnecting(false)
    }
  }

  async function disconnectDrive() {
    try {
      await api.delete("/api/auth/google-drive/disconnect")
      setDriveConnected(false)
      showMessage("Google Drive disconnected.")
    } catch (err) {
      showError(err, "Could not disconnect Google Drive")
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm("Delete your account and projects you created? This cannot be undone.")) return
    setBusy("delete")
    try {
      await api.post<void>("/api/auth/delete-account", { password: deletePassword })
      auth.clearToken()
      router.push("/register")
    } catch (err) {
      showError(err, "Could not delete account")
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <div>
          <h2 className="text-xl font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-gray-500">Global account settings. Project settings live on each project Home page.</p>
        </div>

        {(msg || error) && (
          <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-100 bg-red-50 text-red-700" : "border-green-100 bg-green-50 text-green-700"}`}>
            {error ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
            <p className="whitespace-pre-line">{error || msg}</p>
          </div>
        )}

        <form onSubmit={saveAccount} className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserRound size={18} />
            <h3 className="font-medium">Account</h3>
          </div>
          {!account ? (
            <p className="text-sm text-gray-400">Loading account…</p>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Name</span>
                <input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Email</span>
                <input type="email" value={accountForm.email} onChange={e => setAccountForm({ ...accountForm, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              </label>
              <button disabled={busy === "account"} className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
                {busy === "account" ? "Saving…" : "Save account"}
              </button>
            </div>
          )}
        </form>

        <form onSubmit={savePassword} className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={18} />
            <h3 className="font-medium">Password</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="password" value={passwordForm.current_password}
              onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
              placeholder="Current password" required
              className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
            <input type="password" value={passwordForm.new_password}
              onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
              placeholder="New password" required minLength={8}
              className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <button disabled={busy === "password"} className="mt-3 rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === "password" ? "Updating…" : "Update password"}
          </button>
        </form>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M6.5 20L1 11l4.5-8h13L23 11l-4.5 8H6.5z" stroke="#4285F4" strokeWidth="1.5"/>
              <path d="M12 3l5 9H7l5-9z" fill="#FBBC05"/>
              <path d="M1 11h22" stroke="#34A853" strokeWidth="1.5"/>
            </svg>
            <h3 className="font-medium">Google Drive account</h3>
            {driveConnected === true && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Connected</span>
            )}
          </div>
          <p className="text-sm text-gray-500">Connect the Google account ResearchBuddy uses for Drive and Docs sync. Folder selection is configured per project in Home.</p>
          <div className="mt-4">
            {driveConnected === null ? (
              <p className="text-sm text-gray-400">Checking…</p>
            ) : driveConnected ? (
              <button onClick={disconnectDrive} className="rounded-lg border px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                Disconnect Google Drive
              </button>
            ) : (
              <button onClick={connectDrive} disabled={connecting}
                className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
                {connecting ? "Redirecting…" : "Connect Google Drive"}
              </button>
            )}
          </div>
        </section>

        <form onSubmit={deleteAccount} className="rounded-xl border border-red-100 bg-red-50 p-5">
          <div className="mb-3 flex items-center gap-2 text-red-700">
            <Trash2 size={18} />
            <h3 className="font-medium">Delete account</h3>
          </div>
          <p className="text-sm text-red-700/80">This removes your account, API keys, Drive token, memberships, and projects you created.</p>
          <div className="mt-3 flex gap-2">
            <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
              placeholder="Confirm password" required
              className="min-w-0 flex-1 rounded-lg border border-red-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
            <button disabled={busy === "delete"} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
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
