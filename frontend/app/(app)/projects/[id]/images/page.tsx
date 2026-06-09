"use client"
import { useParams } from "next/navigation"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"

export default function ImagesPage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Images</h2>
      </div>
      <SectionResourcesPanel projectId={projectId} section="images" />
      <ModuleLinksPanel
        projectId={projectId}
        section="images"
        kind="figma"
        title="Figma links"
        labelPlaceholder="Figma file or frame"
        urlPlaceholder="https://figma.com/..."
      />
    </div>
  )
}
