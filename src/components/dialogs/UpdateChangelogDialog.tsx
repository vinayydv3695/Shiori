import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import ReactMarkdown from 'react-markdown'
import { isAndroid } from '@/lib/tauri'

interface UpdateChangelogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version: string
  notes: string
  onConfirm: () => void
}

export function UpdateChangelogDialog({
  open,
  onOpenChange,
  version,
  notes,
  onConfirm,
}: UpdateChangelogDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-1/2 top-1/2 z-[100] w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl p-0 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
              >
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 bg-muted/30">
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
                    Update Available: v{version}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="rounded-full p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-5 w-5 opacity-70" />
                    </button>
                  </Dialog.Close>
                </div>
                
                <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                  <div className="prose dark:prose-invert prose-sm max-w-none 
                    prose-h1:text-xl prose-h1:font-semibold prose-h1:mb-4
                    prose-h2:text-lg prose-h2:font-medium prose-h2:mt-6 prose-h2:mb-3
                    prose-h3:text-base prose-h3:font-medium
                    prose-p:text-muted-foreground prose-p:leading-relaxed
                    prose-ul:text-muted-foreground prose-ul:my-2
                    prose-li:my-1
                    prose-strong:text-foreground prose-strong:font-medium
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  ">
                    {notes ? (
                      <ReactMarkdown>{notes}</ReactMarkdown>
                    ) : (
                      <p>No release notes provided for this update.</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/50 bg-muted/30 px-6 py-4 flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <Button variant="secondary" className="rounded-xl">
                      Later
                    </Button>
                  </Dialog.Close>
                  <Button onClick={onConfirm} className="rounded-xl gap-2 shadow-md">
                    {isAndroid ? (
                      <>
                        <ExternalLink size={16} />
                        View Release
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Download & Install
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
