import { useEffect, useRef, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import { api, type LibraryMetadataImportPreview } from '@/lib/tauri'
import { useLibraryStore } from '@/store/libraryStore'

export function MetadataImportSection() {
  const [filePath, setFilePath] = useState<string>()
  const [preview, setPreview] = useState<LibraryMetadataImportPreview>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const request = useRef(0)
  const locked = useRef(false)

  useEffect(() => () => { request.current++ }, [])

  const chooseFile = async () => {
    if (locked.current) return
    locked.current = true
    try {
      const path = await openDialog({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (typeof path !== 'string') return
      request.current++
      setFilePath(path)
      setPreview(undefined)
      setMessage('')
    } catch (error) {
      request.current++
      setPreview(undefined)
      setMessage(String(error))
    } finally {
      locked.current = false
    }
  }

  const previewFile = async () => {
    if (!filePath || locked.current) return
    locked.current = true
    const id = ++request.current
    setBusy(true)
    setPreview(undefined)
    setMessage('')
    try {
      const result = await api.previewLibraryMetadataImport(filePath)
      if (request.current === id) setPreview(result)
    } catch (error) {
      if (request.current === id) setMessage(String(error))
    } finally {
      if (request.current === id) setBusy(false)
      locked.current = false
    }
  }

  const apply = async () => {
    if (!filePath || !preview || locked.current) return
    if (!window.confirm(`Fill missing metadata for ${preview.wouldUpdate} books? Existing values will not be overwritten.`)) return
    locked.current = true
    const id = ++request.current
    setBusy(true)
    setMessage('')
    try {
      const result = await api.importLibraryMetadata(filePath, preview.fingerprint)
      if (request.current === id) {
      await useLibraryStore.getState().refreshLibrary()
      if (request.current !== id) return
        setPreview(undefined)
        setMessage(`Filled missing metadata for ${result.updated} books; ${result.unchanged + result.unmatched} skipped.`)
      }
    } catch (error) {
      if (request.current === id) {
        setPreview(undefined)
        setMessage(String(error))
      }
    } finally {
      if (request.current === id) setBusy(false)
      locked.current = false
    }
  }

  return <section className="space-y-3" aria-label="Import book metadata">
    <h3 className="font-medium">Fill missing book metadata</h3>
    <p className="text-sm text-muted-foreground">Only fills empty metadata for books at the exact same file path. It does not restore files, reading progress, authors, tags, or shelves; unmatched books are skipped.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={chooseFile} disabled={busy}>Choose JSON file</Button>
      {filePath && <Button variant="outline" onClick={previewFile} disabled={busy}>Preview</Button>}
      {preview && <Button onClick={apply} disabled={busy || !preview.wouldUpdate}>Fill missing metadata</Button>}
    </div>
    {preview && <p role="status" className="text-sm">{preview.matched} matched · {preview.unmatched} unmatched · {preview.wouldUpdate} would be updated · {preview.unchanged} unchanged</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
