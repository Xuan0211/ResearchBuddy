"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Help is now a public page at /help — redirect there from the app shell.
export default function HelpRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/help") }, [router])
  return null
}
