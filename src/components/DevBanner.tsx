import { AlertCircle } from "lucide-react"
import { isTauri } from "@/lib/tauri"

export function DevBanner() {
  if (isTauri) return null

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-500" />
      <span className="text-amber-700 dark:text-amber-300">
        Running in <strong>browser mode</strong> with mock data. For full functionality, run:{" "}
        <code className="px-1.5 py-0.5 bg-amber-500/20 rounded font-mono text-xs">
          npm run tauri dev
        </code>
      </span>
    </div>
  )
}
