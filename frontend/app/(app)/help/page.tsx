"use client"
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api } from "@/lib/api"

export default function HelpPage() {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ content: string }>("/api/help")
      .then(r => setContent(r.content))
      .catch(() => setContent("Failed to load help content."))
  }, [])

  if (content === null) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-5xl">
      <article className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  )
}
