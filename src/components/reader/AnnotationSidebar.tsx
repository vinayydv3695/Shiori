import { useReaderStore, Annotation } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { Trash2, Edit2, Highlighter, StickyNote, X } from '@/components/icons';
import { useState, useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import { AnnotationExportDialog } from './AnnotationExportDialog';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

export function AnnotationSidebar() {
  const annotations = useReaderStore(state => state.annotations);
  const removeAnnotation = useReaderStore(state => state.removeAnnotation);
  const updateAnnotation = useReaderStore(state => state.updateAnnotation);
  const showAnnotationSidebar = useReaderStore(state => state.showAnnotationSidebar);
  const toggleAnnotationSidebar = useReaderStore(state => state.toggleAnnotationSidebar);
  const currentBookId = useReaderStore(state => state.currentBookId);
  const [filter, setFilter] = useState<'all' | 'highlight' | 'note'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const dragControls = useDragControls();
  
  const isMobile = useIsMobile();

  const filteredAnnotations = useMemo(() => {
    return annotations.filter((a) => {
      if (filter !== 'all' && a.annotationType !== filter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = a.selectedText?.toLowerCase().includes(query) || false;
        const noteMatch = a.noteContent?.toLowerCase().includes(query) || false;
        if (!textMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [annotations, filter, searchQuery]);

  const handleDelete = async (annotation: Annotation) => {
    if (!annotation.id) return;
    
    if (confirm('Delete this annotation?')) {
      await api.deleteAnnotation(annotation.id);
      removeAnnotation(annotation.id);
    }
  };

  const handleEditStart = (annotation: Annotation) => {
    if (!annotation.id) return;
    setEditingId(annotation.id);
    setEditNote(annotation.noteContent || '');
  };

  const handleEditSave = async (annotation: Annotation) => {
    if (!annotation.id) return;

    await api.updateAnnotation(annotation.id, editNote);
    updateAnnotation(annotation.id, { noteContent: editNote });
    setEditingId(null);
    setEditNote('');
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditNote('');
  };

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'highlight':
        return <Highlighter className="w-4 h-4 text-yellow-600" />;
      case 'note':
        return <StickyNote className="w-4 h-4 text-blue-600" />;

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {showAnnotationSidebar && (
        <>
          {isMobile && (
            <motion.div
              className="fixed inset-0 bg-black/60 z-[400] backdrop-blur-sm"
              onClick={toggleAnnotationSidebar}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          )}
          <motion.div 
            initial={isMobile ? { y: "100%" } : { x: "100%", width: "0px", opacity: 0 }}
            animate={isMobile ? { y: 0 } : { x: 0, width: "320px", opacity: 1 }}
            exit={isMobile ? { y: "100%" } : { x: "100%", width: "0px", opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            drag={isMobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                toggleAnnotationSidebar();
              }
            }}
            className={cn(
              "bg-white flex flex-col overflow-hidden",
              isMobile
                ? "fixed inset-x-0 bottom-0 h-[80vh] z-[500] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
                : "relative h-full z-10 border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] w-80 shrink-0"
            )}
          >
            {isMobile && (
              <div 
                className="w-full flex justify-center pb-2 pt-3"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none', cursor: 'grab' }}
              >
                <div className="w-12 h-1.5 rounded-full bg-gray-200 pointer-events-none" />
              </div>
            )}
            {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-lg text-gray-900">Annotations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExportDialogOpen(true)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
            title="Export annotations"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={toggleAnnotationSidebar}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search annotations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            filter === 'all'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All ({annotations.length})
        </button>
        <button
          onClick={() => setFilter('highlight')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            filter === 'highlight'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Highlights
        </button>
        <button
          onClick={() => setFilter('note')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            filter === 'note'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Notes
        </button>

      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filteredAnnotations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>No annotations found</p>
          </div>
        ) : (
          <motion.div 
            className="divide-y divide-gray-100"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
            initial="hidden" animate="show"
          >
            {filteredAnnotations.map((annotation) => (
              <motion.div 
                key={annotation.id} 
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                className="group p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      {getAnnotationIcon(annotation.annotationType)}
                      {annotation.annotationType === 'highlight' && annotation.color && (
                        <div 
                          className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-white"
                          style={{ backgroundColor: annotation.color }}
                        />
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(annotation.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditStart(annotation)}
                      className="p-1 hover:bg-gray-200 rounded"
                      title="Edit note"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(annotation)}
                      className="p-1 hover:bg-red-100 rounded text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Selected text (for highlights) */}
                {annotation.selectedText && (
                  <div
                    className="text-sm mb-2 p-2 rounded"
                    style={{ backgroundColor: `${annotation.color}20` }}
                  >
                    "{annotation.selectedText}"
                  </div>
                )}

                {/* Note content */}
                {editingId === annotation.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Add a note..."
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleEditSave(annotation)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : annotation.noteContent ? (
                  <div className="text-sm text-gray-700 mt-2 p-2 bg-gray-50 rounded">
                    {(() => {
                      try {
                        const vocabData = JSON.parse(annotation.noteContent);
                        if (vocabData && vocabData.type === 'define') {
                          return (
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-purple-600">Definition:</span>
                              {vocabData.data?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition found.'}
                            </div>
                          );
                        }
                        if (vocabData && vocabData.type === 'translate') {
                          return (
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-purple-600">Translation:</span>
                              {vocabData.data?.translated_text || 'No translation found.'}
                            </div>
                          );
                        }
                      } catch {
                        // Not JSON, just return raw note
                      }
                      return annotation.noteContent;
                    })()}
                  </div>
                ) : null}

                {/* Location info */}
                <div className="text-xs text-gray-400 mt-2">
                  Location: {annotation.location}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnnotationExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        bookId={currentBookId ?? undefined}
      />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
