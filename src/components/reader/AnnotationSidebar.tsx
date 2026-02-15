import { useReaderStore, Annotation } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { Trash2, Edit2, Bookmark, Highlighter, StickyNote, X } from '@/components/icons';
import { useState } from 'react';
import { formatDate } from '@/lib/utils';

export function AnnotationSidebar() {
  const { annotations, removeAnnotation, updateAnnotation, showAnnotationSidebar, toggleAnnotationSidebar } = useReaderStore();
  const [filter, setFilter] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState('');

  if (!showAnnotationSidebar) return null;

  const filteredAnnotations = annotations.filter((a) => {
    if (filter === 'all') return true;
    return a.annotationType === filter;
  });

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
      case 'bookmark':
        return <Bookmark className="w-4 h-4 text-blue-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Annotations</h2>
        <button
          onClick={toggleAnnotationSidebar}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
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
        <button
          onClick={() => setFilter('bookmark')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            filter === 'bookmark'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Bookmarks
        </button>
      </div>

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto">
        {filteredAnnotations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No {filter === 'all' ? '' : filter} annotations yet.</p>
            <p className="text-sm mt-2">
              {filter === 'highlight' && 'Select text to create a highlight.'}
              {filter === 'bookmark' && 'Click the bookmark button to add one.'}
              {filter === 'note' && 'Add notes to your highlights.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getAnnotationIcon(annotation.annotationType)}
                    <span className="text-xs text-gray-500">
                      {formatDate(annotation.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {annotation.annotationType !== 'bookmark' && (
                      <button
                        onClick={() => handleEditStart(annotation)}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Edit note"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
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
                    {annotation.noteContent}
                  </div>
                ) : null}

                {/* Location info */}
                <div className="text-xs text-gray-400 mt-2">
                  Location: {annotation.location}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
