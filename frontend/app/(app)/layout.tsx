"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("rb_token")
    if (!token) router.push("/login")
  }, [router])

  function handleLogout() {
    auth.clearToken()
    router.push("/login")
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between flex-shrink-0">
        <Link href="/projects" className="font-semibold text-sm">ResearchBuddy</Link>
        <div className="flex items-center gap-4">
          <Link href="/help" className="text-sm text-gray-500 hover:text-black">Help</Link>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-black">Settings</Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black">Sign out</button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
