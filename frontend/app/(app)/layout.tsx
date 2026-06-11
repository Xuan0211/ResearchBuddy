"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"
import SyncNotification from "@/components/SyncNotification"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [currentProject, setCurrentProject] = useState<{ id: string; name?: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("rb_token")
    if (!token) router.push("/login")
  }, [router])

  useEffect(() => {
    const raw = localStorage.getItem("rb_current_project")
    if (!raw) { setCurrentProject(null); return }
    try { setCurrentProject(JSON.parse(raw)) } catch { setCurrentProject(null) }
  }, [pathname])

  function handleLogout() {
    auth.clearToken()
    router.push("/login")
  }

  const headerPage = pathname.startsWith("/global-skills") || pathname.startsWith("/help") || pathname.startsWith("/settings") || pathname.startsWith("/feedback")

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between flex-shrink-0">
        <Link href="/projects" className="font-semibold text-sm">ResearchBuddy</Link>
        <div className="flex items-center gap-4">
          {headerPage && currentProject && (
            <Link href={`/projects/${currentProject.id}/home`} className="text-sm text-gray-500 hover:text-black">
              Back to project
            </Link>
          )}
          <Link href="/global-skills" className="text-sm text-gray-500 hover:text-black">Global Skills</Link>
          <Link href="/feedback" className="text-sm text-gray-500 hover:text-black">Feedback</Link>
          <Link href="/help" className="text-sm text-gray-500 hover:text-black">Help</Link>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-black">Settings</Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black">Sign out</button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
      <SyncNotification />
    </div>
  )
}
