import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Compass,
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Trash2,
  Edit2,
  Filter,
  Layers,
  ChevronDown,
  Navigation,
  Info,
  Check,
  ImageOff,
  AlertCircle,
  ExternalLink,
  Search,
  Wand2,
  FolderOpen,
  Globe,
  Sparkles,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { api, type BookMap, type BookMapPin } from '@/lib/tauri';
import { useReadingSettings, READER_THEME_COLORS } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';
import {
  normalizeMapImageUrl,
  searchOnlineBookMaps,
  generateProceduralRealmMap,
  type DiscoveredMap,
} from '@/lib/mapDiscoveryService';

interface CartographyHUDProps {
  bookId: number;
  bookTitle?: string;
  currentChapterIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

const PIN_COLORS = [
  { name: 'Red', hex: '#f43f5e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Purple', hex: '#a855f7' },
];

export function CartographyHUD({
  bookId,
  bookTitle = '',
  currentChapterIndex = 0,
  isOpen,
  onClose,
}: CartographyHUDProps) {
  const readerTheme = useReadingSettings((s) => s.theme);
  const themeVars = (READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper) as React.CSSProperties;

  const [maps, setMaps] = useState<BookMap[]>([]);
  const [activeMap, setActiveMap] = useState<BookMap | null>(null);
  const [pins, setPins] = useState<BookMapPin[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Pan & Zoom state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);

  // Pin modes and filtering
  const [isAddPinMode, setIsAddPinMode] = useState(false);
  const [filterUpToCurrentChapter, setFilterUpToCurrentChapter] = useState(false);
  const [selectedPin, setSelectedPin] = useState<BookMapPin | null>(null);

  // Pin editor / modal
  const [newPinCoords, setNewPinCoords] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const [pinNotes, setPinNotes] = useState('');
  const [pinColor, setPinColor] = useState('#f43f5e');
  const [pinChapter, setPinChapter] = useState(currentChapterIndex);

  // Add / Discover map dialog state
  const [isAddMapDialogOpen, setIsAddMapDialogOpen] = useState(false);
  const [addMapTab, setAddMapTab] = useState<'online' | 'generate' | 'custom'>('online');
  const [newMapTitle, setNewMapTitle] = useState('');
  const [newMapImageUrl, setNewMapImageUrl] = useState('');

  // Online search state
  const [onlineSearchQuery, setOnlineSearchQuery] = useState(bookTitle);
  const [onlineCandidates, setOnlineCandidates] = useState<DiscoveredMap[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [isGeneratingMap, setIsGeneratingMap] = useState(false);

  // Load maps when opened
  const loadMaps = useCallback(async () => {
    setIsLoading(true);
    try {
      const bookMaps = await api.getBookMaps(bookId);
      setMaps(bookMaps);
      if (bookMaps.length > 0 && !activeMap) {
        setActiveMap(bookMaps[0]);
      } else if (bookMaps.length === 0) {
        // Auto-extract candidate maps from chapter images if available
        const discovered = discoverBookIllustrations();
        if (discovered.length > 0) {
          const autoMap = await api.addBookMap(
            bookId,
            discovered[0].title || 'World Map',
            discovered[0].url
          );
          setMaps([autoMap]);
          setActiveMap(autoMap);
        }
      }
    } catch (err) {
      console.error('[CartographyHUD] Failed to load maps:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, activeMap]);

  // Load pins for the active map
  const loadPins = useCallback(async (mapId: number) => {
    try {
      const mapPins = await api.getMapPins(mapId);
      setPins(mapPins);
    } catch (err) {
      console.error('[CartographyHUD] Failed to load map pins:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadMaps();
      setOnlineSearchQuery(bookTitle);
    }
  }, [isOpen, loadMaps, bookTitle]);

  useEffect(() => {
    if (activeMap) {
      setImageError(false);
      void loadPins(activeMap.id);
      // Reset view
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setSelectedPin(null);
    }
  }, [activeMap, loadPins]);

  // Helper to discover image assets in DOM or resources
  function discoverBookIllustrations(): Array<{ title: string; url: string }> {
    const list: Array<{ title: string; url: string }> = [];
    const images = Array.from(document.querySelectorAll('.premium-reader-container img, .epub-content img'));
    for (const img of images) {
      const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
      const alt = (img as HTMLImageElement).alt?.toLowerCase() || '';
      if (src && (alt.includes('map') || alt.includes('cartograph') || alt.includes('world') || src.includes('map'))) {
        list.push({ title: (img as HTMLImageElement).alt || 'Discovered Map', url: src });
      }
    }
    return list;
  }

  // Zoom handlers
  const handleZoom = (delta: number) => {
    setScale((prev) => Math.min(4.5, Math.max(0.6, prev + delta)));
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
    handleZoom(zoomFactor);
  };

  // Drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isAddPinMode) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Click on map to add pin
  const handleMapClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (isAddPinMode || e.detail === 2) {
      // Single click in Add Pin mode, or double-click anytime
      setNewPinCoords({ xPercent, yPercent });
      setPinLabel('');
      setPinNotes('');
      setPinColor('#f43f5e');
      setPinChapter(currentChapterIndex);
      setIsAddPinMode(false);
    } else {
      setSelectedPin(null);
    }
  };

  // Save new pin
  const handleSavePin = async () => {
    if (!activeMap || !newPinCoords || !pinLabel.trim()) return;
    try {
      const saved = await api.saveMapPin({
        mapId: activeMap.id,
        bookId,
        label: pinLabel.trim(),
        notes: pinNotes.trim() || undefined,
        chapterIndex: pinChapter,
        xPercent: newPinCoords.xPercent,
        yPercent: newPinCoords.yPercent,
        color: pinColor,
      });
      setPins((prev) => [...prev, saved]);
      setNewPinCoords(null);
      setSelectedPin(saved);
      useToastStore.getState().addToast({
        title: 'Map Pin Placed',
        description: `"${saved.label}" added to ${activeMap.title}`,
        variant: 'success',
        duration: 2000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to place pin',
        description: String(err),
        variant: 'error',
      });
    }
  };

  // Delete pin
  const handleDeletePin = async (pinId: number) => {
    try {
      await api.deleteMapPin(pinId);
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      if (selectedPin?.id === pinId) setSelectedPin(null);
      useToastStore.getState().addToast({
        title: 'Pin removed',
        variant: 'info',
        duration: 1500,
      });
    } catch (err) {
      console.error('[CartographyHUD] Failed to delete pin:', err);
    }
  };

  // Native File Picker
  const handleBrowseLocalFile = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [
          {
            name: 'Image Files',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'],
          },
        ],
      });
      if (selected && typeof selected === 'string') {
        const normalized = normalizeMapImageUrl(selected);
        setNewMapImageUrl(normalized);
        if (!newMapTitle.trim()) {
          const fileName = selected.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'World Map';
          setNewMapTitle(fileName);
        }
      }
    } catch (err) {
      console.error('[CartographyHUD] File picker error:', err);
    }
  };

  // Add custom map (URL or Local path)
  const handleAddNewMap = async () => {
    if (!newMapTitle.trim() || !newMapImageUrl.trim()) return;
    try {
      const normalizedUrl = normalizeMapImageUrl(newMapImageUrl.trim());
      const added = await api.addBookMap(bookId, newMapTitle.trim(), normalizedUrl);
      setMaps((prev) => [...prev, added]);
      setActiveMap(added);
      setImageError(false);
      setIsAddMapDialogOpen(false);
      setNewMapTitle('');
      setNewMapImageUrl('');
      useToastStore.getState().addToast({
        title: 'Map added to book',
        variant: 'success',
        duration: 2000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to add map',
        description: String(err),
        variant: 'error',
      });
    }
  };

  // Online search for maps
  const handlePerformOnlineSearch = async (query = onlineSearchQuery) => {
    if (!query.trim()) return;
    setIsSearchingOnline(true);
    try {
      const results = await searchOnlineBookMaps(query.trim());
      setOnlineCandidates(results);
      if (results.length === 0) {
        useToastStore.getState().addToast({
          title: 'No online maps found',
          description: 'Try refining the search terms or generate a procedural map instead.',
          variant: 'info',
          duration: 3000,
        });
      }
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Search failed',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setIsSearchingOnline(false);
    }
  };

  // Import online map candidate
  const handleImportDiscoveredMap = async (candidate: DiscoveredMap) => {
    try {
      const added = await api.addBookMap(bookId, candidate.title, candidate.imageUrl);
      setMaps((prev) => [...prev, added]);
      setActiveMap(added);
      setImageError(false);
      setIsAddMapDialogOpen(false);
      useToastStore.getState().addToast({
        title: 'Map Imported',
        description: `"${candidate.title}" attached from ${candidate.source}`,
        variant: 'success',
        duration: 2500,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to import map',
        description: String(err),
        variant: 'error',
      });
    }
  };

  // Procedural AI Realm Map Generator
  const handleGenerateRealmMap = async () => {
    setIsGeneratingMap(true);
    try {
      const generated = generateProceduralRealmMap(bookTitle || 'Realm');
      const added = await api.addBookMap(bookId, generated.title, generated.imageUrl);

      // Pre-populate interactive landmark pins
      for (const pin of generated.defaultPins) {
        try {
          await api.saveMapPin({
            mapId: added.id,
            bookId,
            label: pin.label,
            notes: pin.notes,
            xPercent: pin.xPercent,
            yPercent: pin.yPercent,
            color: pin.color,
            chapterIndex: currentChapterIndex,
          });
        } catch {
          // Ignore individual pin error
        }
      }

      setMaps((prev) => [...prev, added]);
      setActiveMap(added);
      setImageError(false);
      setIsAddMapDialogOpen(false);
      void loadPins(added.id);

      useToastStore.getState().addToast({
        title: 'Realm Map Generated!',
        description: `Interactive antique fantasy cartography generated for "${bookTitle || 'Book'}".`,
        variant: 'success',
        duration: 3500,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Generation failed',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setIsGeneratingMap(false);
    }
  };

  // Delete map
  const handleDeleteMap = async (mapId: number) => {
    try {
      await api.deleteBookMap(mapId);
      const remaining = maps.filter((m) => m.id !== mapId);
      setMaps(remaining);
      setActiveMap(remaining.length > 0 ? remaining[0] : null);
      setImageError(false);
      useToastStore.getState().addToast({
        title: 'Map removed',
        variant: 'info',
        duration: 1500,
      });
    } catch (err) {
      console.error('[CartographyHUD] Failed to delete map:', err);
    }
  };

  const filteredPins = pins.filter((pin) => {
    if (!filterUpToCurrentChapter) return true;
    if (pin.chapterIndex === null || pin.chapterIndex === undefined) return true;
    return pin.chapterIndex <= currentChapterIndex;
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        data-reader-theme={readerTheme}
        style={themeVars}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5 bg-black/90 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full h-full sm:h-[92vh] sm:max-w-6xl bg-[var(--bg-elevated)] border-0 sm:border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] rounded-none sm:rounded-2xl shadow-2xl overflow-hidden text-[var(--text-primary)] select-none font-sans isolate"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[var(--bg-secondary)] shrink-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shadow-2xs shrink-0">
                <Compass size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold truncate leading-tight text-[var(--text-primary)]">
                    Slide-Over Cartography HUD
                  </h3>
                  <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-[var(--text-tertiary)] font-mono border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] font-medium">
                    Press M to toggle
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                  {activeMap ? activeMap.title : bookTitle || 'Interactive Book Map'}
                </p>
              </div>
            </div>

            {/* Map switcher / Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {maps.length > 1 && (
                <div className="relative">
                  <select
                    value={activeMap?.id || ''}
                    onChange={(e) => {
                      const found = maps.find((m) => m.id === Number(e.target.value));
                      if (found) setActiveMap(found);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer focus:outline-none shadow-2xs"
                  >
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setAddMapTab('online');
                  setIsAddMapDialogOpen(true);
                  if (onlineCandidates.length === 0) {
                    void handlePerformOnlineSearch(bookTitle);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,var(--bg-secondary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
                title="Search online or add a custom map"
              >
                <Plus size={13} strokeWidth={2.4} />
                <span className="hidden sm:inline">Add Map</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer active:scale-95"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Map Viewer Canvas (Theme-Adaptive Parchment / Drafting Table) */}
          <div
            ref={viewportRef}
            style={{
              backgroundImage:
                'radial-gradient(circle, color-mix(in srgb, var(--text-primary) 12%, transparent) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
            className="relative flex-1 bg-[var(--bg-primary)] overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 text-[var(--text-tertiary)]">
                <div className="w-8 h-8 border-2 border-[var(--ui-focus)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading world map...</span>
              </div>
            ) : !activeMap ? (
              /* Empty State Card with 3 Power Options */
              <div className="flex flex-col items-center text-center p-8 max-w-lg bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] rounded-2xl shadow-xl z-10 m-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] mb-4 border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shadow-2xs">
                  <Compass size={36} strokeWidth={2} />
                </div>
                <h4 className="text-lg font-bold mb-1 text-[var(--text-primary)]">
                  No Map Attached to this Book
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mb-6 leading-relaxed max-w-md">
                  Chart characters' journeys, locate kingdoms, and explore your book's realm with an interactive map viewer.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMapTab('online');
                      setIsAddMapDialogOpen(true);
                      void handlePerformOnlineSearch(bookTitle);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shadow-md border-t border-white/20 active:scale-[0.98]"
                  >
                    <Globe size={15} strokeWidth={2.2} />
                    <span>Find Map Online</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateRealmMap}
                    disabled={isGeneratingMap}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,var(--bg-secondary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-50"
                  >
                    {isGeneratingMap ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Wand2 size={15} className="text-[var(--ui-focus)]" />
                    )}
                    <span>Generate Realm Map</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAddMapTab('custom');
                    setIsAddMapDialogOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors py-1"
                >
                  <FolderOpen size={13} />
                  <span>Browse local image file or paste URL...</span>
                </button>
              </div>
            ) : imageError ? (
              /* Fallback Error Card with 1-Click Recovery Actions */
              <div className="flex flex-col items-center text-center p-7 max-w-lg bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] rounded-2xl shadow-2xl z-10 m-4 text-[var(--text-primary)]">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 mb-3 border border-amber-500/30 shadow-2xs">
                  <ImageOff size={28} strokeWidth={2} />
                </div>
                <h4 className="text-base font-bold mb-1 text-[var(--text-primary)]">
                  Unable to Load Map Image
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mb-2 leading-relaxed">
                  Could not load "{activeMap.title}" from the given path:
                </p>
                <p className="text-[11px] font-mono text-[var(--text-tertiary)] bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] max-w-full break-all mb-5">
                  {activeMap.imageUrl}
                </p>

                {/* Instant Recovery Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMapTab('online');
                      setIsAddMapDialogOpen(true);
                      void handlePerformOnlineSearch(bookTitle);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shadow-md border-t border-white/20"
                  >
                    <Globe size={14} />
                    <span>Search Online for Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateRealmMap}
                    disabled={isGeneratingMap}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,var(--bg-secondary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-2xs"
                  >
                    {isGeneratingMap ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} className="text-[var(--ui-focus)]" />}
                    <span>Generate Map</span>
                  </button>
                </div>

                <div className="flex items-center justify-between w-full pt-3 border-t border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)]">
                  <button
                    type="button"
                    onClick={() => handleDeleteMap(activeMap.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Remove Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAddMapTab('custom');
                      setIsAddMapDialogOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors cursor-pointer"
                  >
                    <FolderOpen size={13} />
                    <span>Browse File...</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
                className="relative inline-block max-w-none select-none"
              >
                <img
                  ref={mapImageRef}
                  src={normalizeMapImageUrl(activeMap.imageUrl)}
                  alt={activeMap.title}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onClick={handleMapClick}
                  onError={() => setImageError(true)}
                  className="max-w-[85vw] max-h-[75vh] object-contain rounded-xl shadow-2xl pointer-events-auto border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)]"
                />

                {/* Interactive Pins on Map */}
                {filteredPins.map((pin) => (
                  <div
                    key={pin.id}
                    style={{
                      left: `${pin.xPercent}%`,
                      top: `${pin.yPercent}%`,
                      transform: 'translate(-50%, -100%)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin);
                    }}
                    className="absolute z-10 cursor-pointer group transition-transform hover:scale-125"
                  >
                    <div className="relative flex items-center justify-center">
                      <div
                        style={{ backgroundColor: pin.color }}
                        className="w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-white animate-bounce group-hover:animate-none"
                      >
                        <MapPin size={10} className="fill-current" />
                      </div>
                      <span
                        style={{ backgroundColor: pin.color }}
                        className="absolute bottom-full mb-1 px-2 py-0.5 rounded-md text-[9px] font-bold text-white whitespace-nowrap shadow-md opacity-90 group-hover:opacity-100 transition-opacity drop-shadow-xs"
                      >
                        {pin.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Pin Popover */}
            <AnimatePresence>
              {selectedPin && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
                  className="absolute bottom-6 left-6 z-30 w-72 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl text-[var(--text-primary)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        style={{ backgroundColor: selectedPin.color }}
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white/30"
                      />
                      <h4 className="font-bold text-sm leading-tight truncate text-[var(--text-primary)]">
                        {selectedPin.label}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPin(null)}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {selectedPin.chapterIndex !== null && selectedPin.chapterIndex !== undefined && (
                    <span className="inline-block text-[10px] font-mono font-bold text-[var(--ui-focus)] mb-2 px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                      Chapter {selectedPin.chapterIndex + 1}
                    </span>
                  )}

                  {selectedPin.notes && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3 whitespace-pre-wrap">
                      {selectedPin.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-end pt-2 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                    <button
                      type="button"
                      onClick={() => void handleDeletePin(selectedPin.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Remove Pin</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Map HUD Controls (Bottom Right) */}
            <div className="absolute bottom-5 right-5 z-20 flex flex-col items-center gap-1.5 bg-[var(--bg-elevated)] p-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl text-[var(--text-primary)]">
              <button
                type="button"
                onClick={() => handleZoom(0.25)}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn size={16} />
              </button>

              <button
                type="button"
                onClick={() => handleZoom(-0.25)}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut size={16} />
              </button>

              <button
                type="button"
                onClick={resetZoom}
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors cursor-pointer font-mono text-[10px] font-bold"
                title="Reset zoom"
              >
                {Math.round(scale * 100)}%
              </button>

              <div className="w-full h-px bg-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] my-0.5" />

              <button
                type="button"
                onClick={() => setIsAddPinMode(!isAddPinMode)}
                className={cn(
                  'p-2 rounded-xl transition-all cursor-pointer relative',
                  isAddPinMode
                    ? 'bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white shadow-md scale-105 border-t border-white/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))]'
                )}
                title={isAddPinMode ? 'Click on map to drop pin' : 'Add Pin mode (or double click on map)'}
              >
                <MapPin size={16} />
                {isAddPinMode && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setFilterUpToCurrentChapter(!filterUpToCurrentChapter)}
                className={cn(
                  'p-2 rounded-xl transition-colors cursor-pointer',
                  filterUpToCurrentChapter
                    ? 'bg-[color-mix(in_srgb,var(--ui-focus)_15%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))]'
                )}
                title={
                  filterUpToCurrentChapter
                    ? 'Showing pins up to current chapter (spoiler-free)'
                    : 'Showing all map pins'
                }
              >
                <Filter size={16} />
              </button>
            </div>
          </div>

          {/* Add Pin Modal Dialog */}
          <AnimatePresence>
            {newPinCoords && (
              <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-sm p-5 sm:p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl space-y-4 text-[var(--text-primary)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">Place Journey Pin</h4>
                    <button
                      type="button"
                      onClick={() => setNewPinCoords(null)}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                      Location / Event Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Winterfell, Lugnica Capital, Arrakeen"
                      value={pinLabel}
                      onChange={(e) => setPinLabel(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                      Journey Notes
                    </label>
                    <textarea
                      placeholder="e.g. Characters camp here in Chapter 4 after escaping..."
                      value={pinNotes}
                      onChange={(e) => setPinNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                        Color
                      </label>
                      <div className="flex items-center gap-1.5">
                        {PIN_COLORS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setPinColor(c.hex)}
                            style={{ backgroundColor: c.hex }}
                            className={cn(
                              'w-5 h-5 rounded-full cursor-pointer transition-transform',
                              pinColor === c.hex ? 'scale-125 ring-2 ring-[var(--text-primary)]' : 'opacity-80 hover:opacity-100'
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                        Chapter Tag
                      </label>
                      <span className="inline-block px-2 py-1 rounded bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] text-xs font-mono font-bold text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)]">
                        Ch {pinChapter + 1}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                    <button
                      type="button"
                      onClick={() => setNewPinCoords(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePin}
                      disabled={!pinLabel.trim()}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 cursor-pointer disabled:opacity-40 transition-all shadow-md border-t border-white/20 active:scale-[0.98]"
                    >
                      Drop Pin
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Add / Discover Map Dialog with Tabs */}
          <AnimatePresence>
            {isAddMapDialogOpen && (
              <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-xl p-5 sm:p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl space-y-4 text-[var(--text-primary)] max-h-[85vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Compass size={18} className="text-[var(--ui-focus)]" />
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">
                        Add Map to "{bookTitle || 'Book'}"
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddMapDialogOpen(false)}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Segmented Mode Switcher */}
                  <div className="grid grid-cols-3 p-1 bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] rounded-xl text-xs font-bold shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAddMapTab('online');
                        if (onlineCandidates.length === 0) {
                          void handlePerformOnlineSearch(onlineSearchQuery);
                        }
                      }}
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer',
                        addMapTab === 'online'
                          ? 'bg-[var(--ui-focus)] text-white shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <Globe size={13} />
                      <span>Find Online</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddMapTab('generate')}
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer',
                        addMapTab === 'generate'
                          ? 'bg-[var(--ui-focus)] text-white shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <Wand2 size={13} />
                      <span>Generate Map</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddMapTab('custom')}
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer',
                        addMapTab === 'custom'
                          ? 'bg-[var(--ui-focus)] text-white shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <FolderOpen size={13} />
                      <span>Local / URL</span>
                    </button>
                  </div>

                  {/* Tab 1: Search Online */}
                  {addMapTab === 'online' && (
                    <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px]">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                          <input
                            type="text"
                            placeholder="Search franchise or world name..."
                            value={onlineSearchQuery}
                            onChange={(e) => setOnlineSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handlePerformOnlineSearch();
                            }}
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handlePerformOnlineSearch()}
                          disabled={isSearchingOnline}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--ui-focus)] text-white hover:brightness-105 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {isSearchingOnline ? <Loader2 size={13} className="animate-spin" /> : 'Search'}
                        </button>
                      </div>

                      {isSearchingOnline ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                          <Loader2 size={24} className="animate-spin text-[var(--ui-focus)]" />
                          <span className="text-xs">Searching official lore & Wikimedia cartography archives...</span>
                        </div>
                      ) : onlineCandidates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center text-[var(--text-tertiary)] px-4">
                          <Compass size={32} className="opacity-40 mb-2" />
                          <p className="text-xs">
                            No online maps found for "{onlineSearchQuery}".
                          </p>
                          <p className="text-[11px] opacity-75 mt-1">
                            Try searching for the main series name (e.g. "Re:Zero", "Middle-earth", "Westeros") or use the "Generate Map" tab.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {onlineCandidates.map((cand) => (
                            <div
                              key={cand.id}
                              className="flex flex-col rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] bg-[var(--bg-secondary)] shadow-2xs group"
                            >
                              <div className="relative h-28 bg-black/10 overflow-hidden flex items-center justify-center">
                                <img
                                  src={normalizeMapImageUrl(cand.thumbnail || cand.imageUrl)}
                                  alt={cand.title}
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    if (cand.imageUrl && target.src !== cand.imageUrl) {
                                      target.src = cand.imageUrl;
                                    }
                                  }}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/75 text-white backdrop-blur-xs">
                                  {cand.source}
                                </span>
                              </div>
                              <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                                <div>
                                  <h5 className="font-bold text-xs line-clamp-1 text-[var(--text-primary)]">
                                    {cand.title}
                                  </h5>
                                  {cand.description && (
                                    <p className="text-[10px] text-[var(--text-tertiary)] line-clamp-2 mt-0.5 leading-snug">
                                      {cand.description}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleImportDiscoveredMap(cand)}
                                  className="w-full py-1.5 rounded-lg text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
                                >
                                  Attach This Map
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Generate Map */}
                  {addMapTab === 'generate' && (
                    <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 text-center space-y-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shadow-2xs">
                        <Wand2 size={28} />
                      </div>
                      <div>
                        <h5 className="font-bold text-sm text-[var(--text-primary)]">
                          Procedural AI Realm Cartographer
                        </h5>
                        <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1 leading-relaxed">
                          Generates a high-resolution, antique fantasy parchment SVG map tailored to "{bookTitle || 'Your Book'}", featuring mountain ridges, rivers, kingdoms, and starter landmark pins.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateRealmMap}
                        disabled={isGeneratingMap}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shadow-md border-t border-white/20 active:scale-[0.98] disabled:opacity-50"
                      >
                        {isGeneratingMap ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Inking Realm Cartography...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 size={14} />
                            <span>Generate &amp; Attach Realm Map</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Tab 3: Local File / Custom URL */}
                  {addMapTab === 'custom' && (
                    <div className="flex-1 space-y-3 py-2">
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                          Map Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. World Map, Middle-earth, Lugnica"
                          value={newMapTitle}
                          onChange={(e) => setNewMapTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-[var(--text-secondary)]">
                            Image Path or Web URL
                          </label>
                          <button
                            type="button"
                            onClick={handleBrowseLocalFile}
                            className="flex items-center gap-1 text-[11px] font-bold text-[var(--ui-focus)] hover:underline cursor-pointer"
                          >
                            <FolderOpen size={12} />
                            <span>Browse Computer...</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="/home/user/map.png, C:\..., or https://..."
                          value={newMapImageUrl}
                          onChange={(e) => setNewMapImageUrl(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] font-mono text-[11px]"
                        />
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                          Supports local files (.png, .jpg, .webp, .svg) as well as online URLs.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                        <button
                          type="button"
                          onClick={() => setIsAddMapDialogOpen(false)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddNewMap}
                          disabled={!newMapTitle.trim() || !newMapImageUrl.trim()}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 cursor-pointer disabled:opacity-40 transition-all shadow-md border-t border-white/20 active:scale-[0.98]"
                        >
                          Save Map
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
