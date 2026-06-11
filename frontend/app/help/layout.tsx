"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("rb_current_project")
      if (stored) {
        const { id } = JSON.parse(stored)
        if (id) setProjectId(id)
      }
    } catch {}
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          {projectId ? (
            <Link
              href={`/projects/${projectId}/home`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black"
            >
              <ArrowLeft size={14} />
              Back to project
            </Link>
          ) : (
            <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black">
              <ArrowLeft size={14} />
              Projects
            </Link>
          )}
          <span className="text-gray-300">|</span>
          <Link href="/" className="font-semibold text-sm hover:text-gray-600">
            ResearchBuddy
          </Link>
        </div>
        <span className="text-sm text-gray-400">Documentation</span>
      </header>
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 49px)" }}>
        {children}
      </div>
    </div>
  )
}
