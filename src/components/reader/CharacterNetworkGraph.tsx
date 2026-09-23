import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  BookOpen,
  Search,
  MessageSquare,
  Unlock,
  ShieldCheck,
  ArrowLeft,
  Users,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Focus,
} from 'lucide-react';
import type { TrackedCharacter, CharacterNetworkData } from '@/lib/characterTracker';
import type { CharacterPortrait } from '@/lib/characterImageService';
import {
  getCachedCharacterPortrait,
  prefetchCharacterPortraits,
} from '@/lib/characterImageService';
import { ReaderTooltip } from './ReaderTooltip';

interface SimNode {
  id: string;
  name: string;
  totalMentions: number;
  chapters: number[];
  firstChapter: number;
  avatarColor: string;
  x: number;
  y: number;
  radius: number;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  weight: number;
  chapters: number[];
  sampleQuotes: { chapterIndex: number; quote: string }[];
}

interface CharacterNetworkGraphProps {
  networkData: CharacterNetworkData;
  currentChapterIndex?: number;
  totalChapters: number;
  bookTitle?: string;
  onOpenCharacterDetail: (char: TrackedCharacter, portrait: CharacterPortrait) => void;
  onNavigateToChapter: (chapterIndex: number, charName?: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function CharacterNetworkGraph({
  networkData,
  currentChapterIndex = 0,
  totalChapters,
  bookTitle,
  onOpenCharacterDetail,
  onNavigateToChapter,
  isFullscreen = false,
  onToggleFullscreen,
}: CharacterNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Progressive Spoiler-Guard Slider: defaults to user's reading progress (+1 for 1-based display)
  const [maxChapter, setMaxChapter] = useState<number>(() => {
    return Math.max(1, Math.min(totalChapters || 1, currentChapterIndex + 1));
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [minWeight, setMinWeight] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SimLink | null>(null);
  const [expandedConnName, setExpandedConnName] = useState<string | null>(null);

  // Reset expanded connection when switching character focus
  useEffect(() => {
    setExpandedConnName(null);
  }, [selectedNodeId]);

  // Portrait cache state for nodes and cards
  const [portraitMap, setPortraitMap] = useState<Record<string, CharacterPortrait>>(() => {
    const map: Record<string, CharacterPortrait> = {};
    for (const char of networkData.characters) {
      const cached = getCachedCharacterPortrait(char.name, bookTitle);
      if (cached) map[char.name] = cached;
    }
    return map;
  });

  useEffect(() => {
    const charNames = networkData.characters.map((c) => c.name);
    if (charNames.length === 0) return;
    prefetchCharacterPortraits(charNames, bookTitle).then((fetched) => {
      setPortraitMap((prev) => ({ ...prev, ...fetched }));
    });
  }, [networkData.characters, bookTitle]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen || !onToggleFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleFullscreen();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  // Pan & Zoom transform state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const animFrameRef = useRef<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Cancel any running camera flight on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Dragging offsets for manual pin repositioning
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Update slider if reader moves to a later chapter
  useEffect(() => {
    const currentProgress = currentChapterIndex + 1;
    setMaxChapter((prev) => Math.max(prev, currentProgress));
  }, [currentChapterIndex]);

  // Filtered nodes and links based on spoiler-guard slider, search, and min weight
  const { visibleNodes, visibleLinks } = useMemo(() => {
    const maxZeroIndex = maxChapter - 1;

    // Filter characters who have already appeared by maxChapter
    const nodeMap = new Map<string, SimNode>();

    networkData.characters.forEach((char) => {
      if (char.firstMention.chapterIndex <= maxZeroIndex) {
        const radius = Math.min(32, Math.max(18, 17 + Math.sqrt(char.totalMentions) * 2.6));
        nodeMap.set(char.name, {
          id: char.name,
          name: char.name,
          totalMentions: char.totalMentions,
          chapters: char.chapters,
          firstChapter: char.firstMention.chapterIndex,
          avatarColor: char.avatarColor,
          x: 0,
          y: 0,
          radius,
        });
      }
    });

    // Filter edges whose interactions occurred by maxChapter and meet minWeight
    const filteredLinks: SimLink[] = [];
    for (const edge of networkData.edges) {
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (!srcNode || !tgtNode) continue;

      const activeChapters = edge.chapters.filter((c) => c <= maxZeroIndex);
      if (activeChapters.length === 0) continue;

      const activeQuotes = edge.sampleQuotes.filter((q) => q.chapterIndex <= maxZeroIndex);
      const effectiveWeight = Math.min(edge.weight, activeChapters.length * 2);

      if (effectiveWeight >= minWeight) {
        filteredLinks.push({
          source: srcNode,
          target: tgtNode,
          weight: effectiveWeight,
          chapters: activeChapters,
          sampleQuotes: activeQuotes.length > 0 ? activeQuotes : edge.sampleQuotes,
        });
      }
    }

    return {
      visibleNodes: Array.from(nodeMap.values()),
      visibleLinks: filteredLinks,
    };
  }, [networkData, maxChapter, minWeight]);

  // ── Instant Static Constellation Layout (Zero Lag, Zero Movement, Zero Drift) ──
  const staticPositions = useMemo(() => {
    if (visibleNodes.length === 0) return {};

    // Sort by prominence (mentions) so lead characters are at the center
    const sorted = [...visibleNodes].sort((a, b) => b.totalMentions - a.totalMentions);

    // Initial golden ratio phyllotaxis distribution with comfortable spacing
    const nodeState = sorted.map((n, i) => {
      if (i === 0) {
        return { ...n, x: 0, y: 0, vx: 0, vy: 0 };
      }
      const angle = i * 2.39996; // Golden angle (~137.5 deg in radians)
      const dist = 140 + Math.sqrt(i) * 105;
      return {
        ...n,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      };
    });

    const nodeIndexMap = new Map(nodeState.map((n, i) => [n.id, i]));

    // Fast synchronous convergence loop (130 iterations in pure JS math takes < 3ms)
    for (let iter = 0; iter < 130; iter++) {
      const alpha = Math.max(0.08, 1 - iter / 130);

      // 1. Center gravity pull
      for (const n of nodeState) {
        n.vx += -n.x * 0.015 * alpha;
        n.vy += -n.y * 0.015 * alpha;
      }

      // 2. Electrostatic repulsion with generous collision buffers (NO overlapping!)
      for (let i = 0; i < nodeState.length; i++) {
        for (let j = i + 1; j < nodeState.length; j++) {
          const a = nodeState[i];
          const b = nodeState[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);
          const minDist = a.radius + b.radius + 80;

          if (dist < minDist) {
            const push = ((minDist - dist) / minDist) * 22 * alpha;
            const fx = (dx / dist) * push;
            const fy = (dy / dist) * push;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          } else {
            const repulseForce = Math.min(18, (minDist * minDist * 14) / distSq) * alpha;
            const fx = (dx / dist) * repulseForce;
            const fy = (dy / dist) * repulseForce;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }

      // 3. Spring link attraction between connected characters
      for (const link of visibleLinks) {
        const sIdx = nodeIndexMap.get(link.source.id);
        const tIdx = nodeIndexMap.get(link.target.id);
        if (sIdx === undefined || tIdx === undefined) continue;

        const src = nodeState[sIdx];
        const tgt = nodeState[tIdx];

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const targetDist = Math.max(140, 240 - Math.min(link.weight, 10) * 8);

        const springForce = (dist - targetDist) * 0.03 * alpha;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // 4. Update coordinates with momentum damping
      for (const n of nodeState) {
        n.vx *= 0.72;
        n.vy *= 0.72;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    const posMap: Record<string, { x: number; y: number }> = {};
    for (const n of nodeState) {
      posMap[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    }
    return posMap;
  }, [visibleNodes, visibleLinks]);

  // Position resolver combining static placement with user drag offsets
  const getNodePos = useCallback(
    (nodeId: string, fallbackX = 0, fallbackY = 0) => {
      const base = staticPositions[nodeId] || { x: fallbackX, y: fallbackY };
      const offset = dragOffsets[nodeId];
      if (offset) {
        return { x: base.x + offset.x, y: base.y + offset.y };
      }
      return base;
    },
    [staticPositions, dragOffsets]
  );

  // Compute connected neighbors for selected node (ONLY focus on selected character)
  const activeFocusId = selectedNodeId;
  const highlightedNodeIds = useMemo(() => {
    if (!activeFocusId) return null;

    const set = new Set<string>([activeFocusId]);
    for (const link of visibleLinks) {
      if (link.source.id === activeFocusId) set.add(link.target.id);
      if (link.target.id === activeFocusId) set.add(link.source.id);
    }
    return set;
  }, [activeFocusId, visibleLinks]);

  // Canvas dimensions in SVG user coordinate space
  const viewBoxW = isFullscreen ? 1200 : 900;
  const viewBoxH = isFullscreen ? 800 : 640;
  const viewBoxX = -viewBoxW / 2;
  const viewBoxY = -viewBoxH / 2;

  // ── Smooth Camera Flight Engine (60fps Ease-Out Glide) ──
  const animateCameraTo = useCallback(
    (targetX: number, targetY: number, targetScale: number, duration = 480) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const startX = transformRef.current.x;
      const startY = transformRef.current.y;
      const startScale = transformRef.current.scale;
      const startTime = performance.now();

      // Premium exponential ease-out curve (quartic)
      const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOutQuart(progress);

        const curX = startX + (targetX - startX) * eased;
        const curY = startY + (targetY - startY) * eased;
        const curScale = startScale + (targetScale - startScale) * eased;

        setTransform({ x: curX, y: curY, scale: curScale });

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    []
  );

  // Zoom and Pan controls with animation cancellation on manual input
  const handleZoom = (delta: number) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.35, Math.min(2.8, prev.scale + delta)),
    }));
  };

  const handleResetZoom = () => {
    animateCameraTo(0, 0, 1, 420);
  };

  // Fit constellation neatly into the canvas viewport
  const handleFitView = useCallback(
    (animate: boolean | React.MouseEvent = true) => {
      const shouldAnimate = typeof animate === 'boolean' ? animate : true;
      if (visibleNodes.length === 0) {
        if (shouldAnimate) animateCameraTo(0, 0, 1, 400);
        else setTransform({ x: 0, y: 0, scale: 1 });
        return;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const node of visibleNodes) {
        const pos = getNodePos(node.id, node.x, node.y);
        minX = Math.min(minX, pos.x - node.radius - 45);
        maxX = Math.max(maxX, pos.x + node.radius + 45);
        minY = Math.min(minY, pos.y - node.radius - 45);
        maxY = Math.max(maxY, pos.y + node.radius + 45);
      }
      const width = Math.max(120, maxX - minX);
      const height = Math.max(120, maxY - minY);
      const targetCenterX = (minX + maxX) / 2;
      const targetCenterY = (minY + maxY) / 2;

      const baseW = isFullscreen ? 1100 : 760;
      const baseH = isFullscreen ? 720 : 540;
      const scale = Math.min(1.8, Math.max(0.4, Math.min(baseW / width, baseH / height) * 0.88));
      const targetX = -targetCenterX * scale;
      const targetY = -targetCenterY * scale;

      if (shouldAnimate) {
        animateCameraTo(targetX, targetY, scale, 480);
      } else {
        setTransform({ x: targetX, y: targetY, scale });
      }
    },
    [visibleNodes, getNodePos, isFullscreen, animateCameraTo]
  );

  // Auto-fit on initial mount or fullscreen toggle
  useEffect(() => {
    if (visibleNodes.length > 0) {
      handleFitView(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // Smoothly select character and auto-zoom camera onto focus
  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedEdge(null);
      if (!nodeId || nodeId === selectedNodeId) {
        setSelectedNodeId(null);
        setExpandedConnName(null);
        handleFitView(true);
        return;
      }

      setSelectedNodeId(nodeId);
      setExpandedConnName(null);
      const pos = getNodePos(nodeId);
      if (pos) {
        const focusScale = 1.32;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        const offsetY = isMobile ? (viewBoxH * 0.16) / focusScale : 0;
        animateCameraTo(-pos.x * focusScale, (-pos.y + offsetY) * focusScale, focusScale, 480);
      }
    },
    [selectedNodeId, getNodePos, handleFitView, animateCameraTo, viewBoxH]
  );

  // Smoothly close scenes view and restore character focus
  const handleCloseScenes = useCallback(() => {
    setExpandedConnName(null);
    if (selectedNodeId) {
      const pos = getNodePos(selectedNodeId);
      if (pos) {
        const focusScale = 1.32;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        const offsetY = isMobile ? (viewBoxH * 0.16) / focusScale : 0;
        animateCameraTo(-pos.x * focusScale, (-pos.y + offsetY) * focusScale, focusScale, 450);
      }
    }
  }, [selectedNodeId, getNodePos, animateCameraTo, viewBoxH]);

  // Smoothly toggle scenes: expands drawer and glides camera to frame BOTH characters
  const handleToggleScenes = useCallback(
    (otherNodeId: string) => {
      if (expandedConnName === otherNodeId) {
        handleCloseScenes();
      } else {
        setExpandedConnName(otherNodeId);
        if (selectedNodeId) {
          const posA = getNodePos(selectedNodeId);
          const posB = getNodePos(otherNodeId);
          if (posA && posB) {
            const midX = (posA.x + posB.x) / 2;
            const midY = (posA.y + posB.y) / 2;
            const dist = Math.hypot(posB.x - posA.x, posB.y - posA.y);
            // With wider drawer on the right, remaining canvas is ~45% of viewBox width
            const targetSpan = Math.max(dist + 160, 220);
            const sceneScale = Math.min(1.35, Math.max(0.68, (viewBoxW * 0.42) / targetSpan));
            const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
            const offsetY = isMobile ? (viewBoxH * 0.18) / sceneScale : 0;
            animateCameraTo(-midX * sceneScale, (-midY + offsetY) * sceneScale, sceneScale, 500);
          }
        }
      }
    },
    [expandedConnName, selectedNodeId, getNodePos, handleCloseScenes, animateCameraTo, viewBoxW, viewBoxH]
  );

  // Select edge and smoothly center on connection midpoint
  const handleSelectEdge = useCallback(
    (link: SimLink) => {
      setSelectedNodeId(null);
      setExpandedConnName(null);
      setSelectedEdge(link);
      const srcPos = getNodePos(link.source.id);
      const tgtPos = getNodePos(link.target.id);
      const midX = (srcPos.x + tgtPos.x) / 2;
      const midY = (srcPos.y + tgtPos.y) / 2;
      const dist = Math.hypot(tgtPos.x - srcPos.x, tgtPos.y - srcPos.y);
      const edgeScale = Math.min(1.35, Math.max(0.72, (viewBoxW * 0.44) / Math.max(dist + 160, 220)));
      animateCameraTo(-midX * edgeScale, -midY * edgeScale, edgeScale, 480);
    },
    [getNodePos, animateCameraTo, viewBoxW]
  );

  // Background drag to pan
  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName !== 'svg' && (e.target as HTMLElement).id !== 'graph-canvas-bg') {
      return;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleBackgroundPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: panStartRef.current.tx + dx,
        y: panStartRef.current.ty + dy,
      }));
    } else if (draggingNodeId) {
      const dx = (e.clientX - dragStartPos.current.x) / transform.scale;
      const dy = (e.clientY - dragStartPos.current.y) / transform.scale;
      setDragOffsets((prev) => {
        const cur = prev[draggingNodeId] || { x: 0, y: 0 };
        return {
          ...prev,
          [draggingNodeId]: { x: cur.x + dx, y: cur.y + dy },
        };
      });
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleBackgroundPointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    setDraggingNodeId(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Click on empty canvas background clears focus and fits view
  const handleCanvasClick = (e: React.MouseEvent) => {
    const targetTag = (e.target as HTMLElement).tagName;
    const targetId = (e.target as HTMLElement).id;
    if (targetTag === 'svg' || targetId === 'graph-canvas-bg') {
      if (selectedNodeId || selectedEdge) {
        setSelectedNodeId(null);
        setSelectedEdge(null);
        setExpandedConnName(null);
        handleFitView(true);
      }
    }
  };

  // Scroll wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const zoomFactor = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(zoomFactor);
  };

  const selectedCharacter = useMemo(() => {
    if (!selectedNodeId) return null;
    return networkData.characters.find((c) => c.name === selectedNodeId) || null;
  }, [selectedNodeId, networkData.characters]);

  // Compute all visible relationships for the selected character
  const characterConnections = useMemo(() => {
    if (!selectedCharacter) return [];
    const list: {
      otherNode: SimNode;
      otherCharacter?: TrackedCharacter;
      link: SimLink;
      sharedScenes: number;
      chapters: number[];
    }[] = [];

    for (const link of visibleLinks) {
      if (link.source.id === selectedCharacter.name) {
        const otherChar = networkData.characters.find((c) => c.name === link.target.id);
        list.push({
          otherNode: link.target,
          otherCharacter: otherChar,
          link,
          sharedScenes: link.weight,
          chapters: link.chapters,
        });
      } else if (link.target.id === selectedCharacter.name) {
        const otherChar = networkData.characters.find((c) => c.name === link.source.id);
        list.push({
          otherNode: link.source,
          otherCharacter: otherChar,
          link,
          sharedScenes: link.weight,
          chapters: link.chapters,
        });
      }
    }

    return list.sort((a, b) => b.sharedScenes - a.sharedScenes);
  }, [selectedCharacter, visibleLinks, networkData.characters]);

  // ── Render Helper: Edge Dossier ──
  const renderEdgeDossier = (edge: SimLink) => {
    const pSrc = portraitMap[edge.source.name] || getCachedCharacterPortrait(edge.source.name, bookTitle);
    const pTgt = portraitMap[edge.target.name] || getCachedCharacterPortrait(edge.target.name, bookTitle);

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
        <div className="flex items-center justify-between pb-3 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center -space-x-1.5 shrink-0">
              {pSrc?.imageUrl ? (
                <img src={pSrc.imageUrl} alt={edge.source.name} className="w-7 h-7 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]" style={{ background: edge.source.avatarColor }}>
                  {edge.source.name.slice(0, 1)}
                </div>
              )}
              {pTgt?.imageUrl ? (
                <img src={pTgt.imageUrl} alt={edge.target.name} className="w-7 h-7 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]" style={{ background: edge.target.avatarColor }}>
                  {edge.target.name.slice(0, 1)}
                </div>
              )}
            </div>
            <h4 className="text-sm font-bold truncate my-0">
              {edge.source.name} <span className="text-[var(--text-tertiary)] font-normal text-xs">⟷</span> {edge.target.name}
            </h4>
          </div>
          <ReaderTooltip content="Close connection dossier">
            <button
              type="button"
              onClick={() => setSelectedEdge(null)}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
              aria-label="Close dossier"
            >
              <X size={15} />
            </button>
          </ReaderTooltip>
        </div>

        <div className="flex items-center gap-2 my-3 text-xs text-[var(--text-secondary)] font-medium shrink-0">
          <span className="px-2.5 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] font-bold">
            {edge.weight} shared {edge.weight === 1 ? 'scene' : 'scenes'}
          </span>
          <span>across {edge.chapters.length} chapter(s)</span>
        </div>

        {/* Scrollable list of verified shared quotes */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
          {edge.sampleQuotes.map((sq, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_70%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-[12px] leading-relaxed relative group"
            >
              <div className="flex items-center justify-between not-italic text-[10.5px] text-[var(--text-tertiary)] font-sans font-semibold mb-1.5">
                <span className="px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--ui-focus)_10%,transparent)] text-[var(--ui-focus)]">
                  Chapter {sq.chapterIndex + 1}
                </span>
                <ReaderTooltip content={`Jump to Chapter ${sq.chapterIndex + 1}`}>
                  <button
                    type="button"
                    onClick={() => onNavigateToChapter(sq.chapterIndex, edge.source.name)}
                    className="text-[var(--ui-focus)] hover:underline flex items-center gap-1 cursor-pointer font-sans"
                  >
                    <BookOpen size={11} />
                    <span>Jump</span>
                  </button>
                </ReaderTooltip>
              </div>
              <p className="font-serif italic text-[var(--text-primary)] m-0">
                "{sq.quote}"
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render Helper: Character Relations & Scenes Split Reader ──
  const renderCharacterCard = (char: TrackedCharacter) => {
    const selectedPortrait = portraitMap[char.name] || getCachedCharacterPortrait(char.name, bookTitle);
    const isExpanded = Boolean(expandedConnName);
    const expandedConn = characterConnections.find((c) => c.otherNode.id === expandedConnName);
    const expandedPortrait = expandedConn ? (portraitMap[expandedConn.otherNode.name] || getCachedCharacterPortrait(expandedConn.otherNode.name, bookTitle)) : null;

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
        {/* Header: Avatar, Name, Badges & Actions */}
        <div className="p-3.5 pb-3 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_30%,var(--bg-elevated))] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {selectedPortrait?.imageUrl ? (
                <img
                  src={selectedPortrait.imageUrl}
                  alt={char.name}
                  className="w-12 h-12 rounded-2xl object-cover shrink-0 border border-[var(--ui-border)] shadow-xs"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black font-serif text-white shrink-0 shadow-xs"
                  style={{ background: char.avatarColor }}
                >
                  {char.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-base font-bold text-[var(--text-primary)] truncate my-0 leading-tight">
                  {char.name}
                </h4>
                {char.nativeName && (
                  <p className="text-xs text-[var(--text-tertiary)] italic truncate my-0.5">
                    {char.nativeName}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)]">
                    {char.totalMentions} mentions
                  </span>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                    {char.chapters.length} chapters
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    Debut Ch. {char.firstMention.chapterIndex + 1}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ReaderTooltip content="Open full character dossier">
                <button
                  type="button"
                  onClick={() => {
                    onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null });
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[var(--ui-focus)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  <BookOpen size={12} />
                  <span>Dossier</span>
                </button>
              </ReaderTooltip>
              <ReaderTooltip content="Close character panel">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(null);
                    setExpandedConnName(null);
                  }}
                  className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </ReaderTooltip>
            </div>
          </div>
        </div>

        {/* Body: Split View when scenes expanded, Single Column otherwise */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Debut Snippet & Relationships list */}
          <div
            className={`overflow-y-auto p-3.5 space-y-3 text-xs transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded
                ? 'w-full sm:w-[280px] md:w-[310px] shrink-0 border-b sm:border-b-0 sm:border-r border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]'
                : 'w-full flex-1'
            }`}
          >
            {/* Debut / Introduction Quote Snippet */}
            {char.firstMention?.sentenceSnippet && (
              <div className="p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_60%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-[11.5px] leading-relaxed">
                <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">
                  <span className="text-[var(--ui-focus)] font-semibold">
                    DEBUT • CHAPTER {char.firstMention.chapterIndex + 1}
                  </span>
                  <ReaderTooltip content={`Jump to debut in Chapter ${char.firstMention.chapterIndex + 1}`}>
                    <button
                      type="button"
                      onClick={() => onNavigateToChapter(char.firstMention.chapterIndex, char.name)}
                      className="text-[var(--ui-focus)] hover:underline flex items-center gap-0.5 cursor-pointer lowercase first-letter:uppercase not-italic font-semibold"
                    >
                      <BookOpen size={10} />
                      <span>Jump</span>
                    </button>
                  </ReaderTooltip>
                </div>
                <p className="font-serif italic text-[var(--text-secondary)] m-0 line-clamp-2">
                  "{char.firstMention.sentenceSnippet}"
                </p>
              </div>
            )}

            {/* Relationships Section */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <Users size={12} className="text-[var(--ui-focus)]" />
                  <span>Relationships</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)] text-[var(--ui-focus)] text-[10px]">
                    {characterConnections.length}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Through Ch. {maxChapter}
                </span>
              </div>

              {characterConnections.length === 0 ? (
                <div className="p-3 text-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-[11px]">
                  No shared scenes with other characters up to Chapter {maxChapter}.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {characterConnections.map((conn) => {
                    const otherPortrait = portraitMap[conn.otherNode.name] || getCachedCharacterPortrait(conn.otherNode.name, bookTitle);
                    const isCurrentActive = expandedConnName === conn.otherNode.id;

                    return (
                      <div
                        key={conn.otherNode.id}
                        className={`rounded-xl border transition-all ${
                          isCurrentActive
                            ? 'border-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-elevated))] shadow-2xs'
                            : 'border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_40%,var(--bg-elevated))] hover:border-[var(--ui-focus)]/40'
                        } overflow-hidden`}
                      >
                        <div className="p-2 flex items-center justify-between gap-2">
                          <div
                            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                            onClick={() => {
                              if (conn.link.sampleQuotes.length > 0) {
                                handleToggleScenes(conn.otherNode.id);
                              }
                            }}
                          >
                            {otherPortrait?.imageUrl ? (
                              <img
                                src={otherPortrait.imageUrl}
                                alt={conn.otherNode.name}
                                className="w-7 h-7 rounded-lg object-cover shrink-0 border border-[var(--ui-border)] shadow-2xs"
                              />
                            ) : (
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-2xs"
                                style={{ background: conn.otherNode.avatarColor }}
                              >
                                {conn.otherNode.name.slice(0, 1)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                                {conn.otherNode.name}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                                <span className="font-semibold text-[var(--ui-focus)]">
                                  {conn.sharedScenes} shared {conn.sharedScenes === 1 ? 'scene' : 'scenes'}
                                </span>
                                <span>•</span>
                                <span>{conn.chapters.length} ch.</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {conn.link.sampleQuotes.length > 0 && (
                              <ReaderTooltip content={isCurrentActive ? 'Close scenes' : 'View shared dialogue & scenes'}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleScenes(conn.otherNode.id)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                                    isCurrentActive
                                      ? 'bg-[var(--ui-focus)] text-white'
                                      : 'bg-[var(--bg-secondary)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_15%,var(--bg-secondary))] text-[var(--text-secondary)]'
                                  }`}
                                >
                                  <MessageSquare size={10} />
                                  <span>Scenes</span>
                                  {isCurrentActive ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                </button>
                              </ReaderTooltip>
                            )}

                            <ReaderTooltip content={`Focus graph on ${conn.otherNode.name}`}>
                              <button
                                type="button"
                                onClick={() => handleSelectNode(conn.otherNode.id)}
                                className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                              >
                                <ArrowRight size={13} />
                              </button>
                            </ReaderTooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Dedicated Expanded Scenes & Dialogue Reader */}
          {isExpanded && expandedConn && (
            <motion.div
              key={`scenes-${expandedConn.otherNode.id}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[color-mix(in_srgb,var(--bg-secondary)_25%,var(--bg-elevated))]"
            >
              {/* Header for Expanded Scenes */}
              <div className="p-3 px-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,var(--bg-secondary))] flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-2 shrink-0">
                    {selectedPortrait?.imageUrl ? (
                      <img
                        src={selectedPortrait.imageUrl}
                        alt={char.name}
                        className="w-7 h-7 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]"
                        style={{ background: char.avatarColor }}
                      >
                        {char.name.slice(0, 1)}
                      </div>
                    )}
                    {expandedPortrait?.imageUrl ? (
                      <img
                        src={expandedPortrait.imageUrl}
                        alt={expandedConn.otherNode.name}
                        className="w-7 h-7 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]"
                        style={{ background: expandedConn.otherNode.avatarColor }}
                      >
                        {expandedConn.otherNode.name.slice(0, 1)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-[var(--text-primary)] truncate my-0 flex items-center gap-1.5">
                      <span>{char.name}</span>
                      <span className="text-[var(--text-tertiary)] font-normal">⟷</span>
                      <span className="text-[var(--ui-focus)]">{expandedConn.otherNode.name}</span>
                    </h5>
                    <p className="text-[10px] text-[var(--text-tertiary)] my-0">
                      {expandedConn.sharedScenes} shared {expandedConn.sharedScenes === 1 ? 'scene' : 'scenes'} across {expandedConn.chapters.length} chapter(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <ReaderTooltip content={`Focus graph on ${expandedConn.otherNode.name}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectNode(expandedConn.otherNode.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] hover:border-[var(--ui-focus)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      <span>Focus {expandedConn.otherNode.name.split(' ')[0]}</span>
                      <ArrowRight size={11} />
                    </button>
                  </ReaderTooltip>
                  <ReaderTooltip content="Collapse scenes view">
                    <button
                      type="button"
                      onClick={() => handleCloseScenes()}
                      className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </ReaderTooltip>
                </div>
              </div>

              {/* Scrollable Quotes List with Generous Space */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 text-xs pr-3">
                {expandedConn.link.sampleQuotes.map((sq, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shadow-2xs hover:border-[var(--ui-focus)]/30 transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] font-sans font-semibold text-[var(--text-tertiary)]">
                      <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--ui-focus)_10%,transparent)] text-[var(--ui-focus)] font-bold">
                        Chapter {sq.chapterIndex + 1}
                      </span>
                      <ReaderTooltip content={`Jump to Chapter ${sq.chapterIndex + 1}`}>
                        <button
                          type="button"
                          onClick={() => onNavigateToChapter(sq.chapterIndex, char.name)}
                          className="text-[var(--ui-focus)] hover:underline flex items-center gap-1 cursor-pointer font-sans text-[10.5px]"
                        >
                          <BookOpen size={11} />
                          <span>Jump to scene</span>
                        </button>
                      </ReaderTooltip>
                    </div>
                    <div className="pl-3 border-l-2 border-[var(--ui-focus)]">
                      <p className="font-serif italic text-[12.5px] leading-relaxed text-[var(--text-primary)] m-0">
                        "{sq.quote}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      className={`character-network-graph relative w-full overflow-hidden flex flex-col font-sans select-none ${
        isFullscreen ? 'h-full bg-[var(--bg-elevated)]' : 'h-[560px] rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)]'
      }`}
    >
      {/* ─── Premium Spacious Top Control Bar ─── */}
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--bg-secondary))] z-20 shrink-0 flex-wrap min-h-[64px]">
        {/* Left: Back button & Title */}
        <div className="flex items-center gap-3 shrink-0">
          {isFullscreen && onToggleFullscreen && (
            <ReaderTooltip content="Exit Relationship Web">
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_15%,var(--bg-elevated))] text-xs font-bold text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-xs"
              >
                <ArrowLeft size={15} />
                <span>Back to Reader</span>
              </button>
            </ReaderTooltip>
          )}

          <div className="hidden sm:flex flex-col min-w-0 pr-1">
            <span className="text-xs font-extrabold text-[var(--text-primary)] truncate tracking-tight">
              Character Constellation
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] truncate">
              {bookTitle || 'Network & Relationships'}
            </span>
          </div>
        </div>

        {/* Center: Story Progress & Spoiler Guard Control Pod */}
        <div className="flex items-center gap-3.5 px-4 py-2 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-2xs flex-1 max-w-xl min-w-[240px]">
          <ReaderTooltip
            content={
              maxChapter > currentChapterIndex + 1
                ? 'Spoiler Warning: Extended beyond reading progress!'
                : 'Spoiler Guard Active: Future chapter interactions are hidden'
            }
          >
            <div
              className={`px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-bold shrink-0 cursor-default ${
                maxChapter > currentChapterIndex + 1
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)]'
              }`}
            >
              {maxChapter > currentChapterIndex + 1 ? <Unlock size={13} /> : <ShieldCheck size={13} />}
              <span>Ch. {maxChapter}</span>
            </div>
          </ReaderTooltip>

          <input
            type="range"
            min={1}
            max={Math.max(1, totalChapters)}
            value={maxChapter}
            onChange={(e) => setMaxChapter(Number(e.target.value))}
            className="flex-1 h-2 rounded-lg accent-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] cursor-pointer"
          />

          <span className="text-xs text-[var(--text-secondary)] font-mono font-semibold shrink-0">
            /{totalChapters}
          </span>
        </div>

        {/* Right: Search, Stats & View Control Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              type="text"
              placeholder="Find character..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 sm:w-48 pl-9 pr-7 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] shadow-2xs transition-all"
            />
            {searchQuery && (
              <ReaderTooltip content="Clear search">
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={12} />
                </button>
              </ReaderTooltip>
            )}
          </div>

          {/* Graph Stats Pill */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] text-xs font-medium text-[var(--text-secondary)] shadow-2xs">
            <Users size={14} className="text-[var(--ui-focus)]" />
            <span>{visibleNodes.length} characters</span>
            <span className="text-[var(--ui-divider)]">•</span>
            <span>{visibleLinks.length} connections</span>
          </div>

          {/* View Tools Dock */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-2xs">
            <ReaderTooltip content="Fit Constellation">
              <button
                type="button"
                onClick={() => handleFitView(true)}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] transition-colors cursor-pointer"
                aria-label="Fit constellation"
              >
                <Focus size={15} />
              </button>
            </ReaderTooltip>

            <ReaderTooltip content="Reset View">
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                aria-label="Reset zoom"
              >
                <RotateCcw size={15} />
              </button>
            </ReaderTooltip>

            {onToggleFullscreen && (
              <ReaderTooltip content={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Graph'}>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="p-2 rounded-lg text-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] transition-colors cursor-pointer"
                  aria-label="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </ReaderTooltip>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content Split View: Canvas + Auto-Resizing Docked Inspector ─── */}
      <div className="flex-1 flex flex-row min-h-0 relative overflow-hidden w-full">
        {/* Interactive Force-Directed Canvas */}
        <div
          id="graph-canvas-bg"
          className="flex-1 h-full relative cursor-grab active:cursor-grabbing overflow-hidden min-w-0"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handleBackgroundPointerMove}
          onPointerUp={handleBackgroundPointerUp}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleFitView(true);
          }}
        >
          <svg
            className="w-full h-full pointer-events-none"
            viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Constellation Dot Grid Pattern */}
              <pattern id="graph-constellation-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="18" cy="18" r="1.1" fill="var(--text-primary)" opacity="0.08" />
              </pattern>

              {/* Soft Ambient Radial Vignette */}
              <radialGradient id="graph-ambient-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--ui-focus)" stopOpacity="0.08" />
                <stop offset="55%" stopColor="var(--ui-focus)" stopOpacity="0.02" />
                <stop offset="100%" stopColor="var(--ui-focus)" stopOpacity="0" />
              </radialGradient>

              {/* 3D Node Elevation Drop Shadow */}
              <filter id="graph-node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity="0.25" />
              </filter>

              {/* Luminous Edge Glow for Active Connections */}
              <filter id="graph-edge-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Node Portrait Clip Paths */}
              {visibleNodes.map((node) => {
                const safeId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                return (
                  <clipPath key={safeId} id={safeId}>
                    <circle r={node.radius} cx={0} cy={0} />
                  </clipPath>
                );
              })}
            </defs>

            {/* Backdrop: Ambient Spotlight & Constellation Grid */}
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} fill="url(#graph-ambient-glow)" pointerEvents="none" />
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} fill="url(#graph-constellation-grid)" pointerEvents="none" />

            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
              {/* ─── Edges: Subtle Hairlines by Default, Illuminated on Focus / Scene Link ─── */}
              {visibleLinks.map((link, idx) => {
                const srcPos = getNodePos(link.source.id, link.source.x, link.source.y);
                const tgtPos = getNodePos(link.target.id, link.target.x, link.target.y);

                const isConnectedToFocus =
                  activeFocusId && (link.source.id === activeFocusId || link.target.id === activeFocusId);
                const isThisEdgeSelected = selectedEdge === link;
                const isExpandedSceneLink =
                  Boolean(expandedConnName) &&
                  selectedNodeId &&
                  ((link.source.id === selectedNodeId && link.target.id === expandedConnName) ||
                    (link.target.id === selectedNodeId && link.source.id === expandedConnName));
                const isLinkActive = isConnectedToFocus || isThisEdgeSelected || isExpandedSceneLink;

                const strokeWidth = isExpandedSceneLink ? 4.5 : isLinkActive ? 2.4 : 1;
                const strokeOpacity = isExpandedSceneLink ? 1 : isLinkActive ? 0.85 : activeFocusId ? 0.025 : 0.14;
                const strokeColor = isLinkActive ? 'var(--ui-focus)' : 'var(--text-secondary)';

                return (
                  <g key={`${link.source.id}-${link.target.id}-${idx}`} className="pointer-events-auto">
                    {/* Invisible thicker stroke for effortless clicking/tapping */}
                    <line
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={tgtPos.x}
                      y2={tgtPos.y}
                      stroke="transparent"
                      strokeWidth={22}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEdge(link);
                      }}
                    />

                    {/* Luminous glow underlay for active links */}
                    {isLinkActive && (
                      <line
                        x1={srcPos.x}
                        y1={srcPos.y}
                        x2={tgtPos.x}
                        y2={tgtPos.y}
                        stroke="var(--ui-focus)"
                        strokeWidth={isExpandedSceneLink ? 12 : strokeWidth + 4}
                        strokeOpacity={isExpandedSceneLink ? 0.55 : 0.3}
                        strokeLinecap="round"
                        filter="url(#graph-edge-glow)"
                      />
                    )}

                    {/* Connection line: hairline by default, glowing when selected */}
                    <line
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={tgtPos.x}
                      y2={tgtPos.y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      strokeLinecap="round"
                      className="transition-[stroke-opacity,stroke-width] duration-200"
                    />

                    {/* Flowing animated pulse for active connection */}
                    {isLinkActive && (
                      <line
                        x1={srcPos.x}
                        y1={srcPos.y}
                        x2={tgtPos.x}
                        y2={tgtPos.y}
                        stroke="var(--ui-focus)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={isExpandedSceneLink ? '8 4' : '6 4'}
                        strokeLinecap="round"
                        className="graph-flow-edge"
                      />
                    )}
                  </g>
                );
              })}

              {/* ─── Nodes: Clean Character Portraits (Concentric ring ONLY on selection, NO hover circles) ─── */}
              {visibleNodes.map((node) => {
                const pos = getNodePos(node.id, node.x, node.y);
                const isMatch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
                const isSelected = selectedNodeId === node.id;
                const isScenePartner = expandedConnName === node.id;
                const isConnectedNeighbor = highlightedNodeIds ? highlightedNodeIds.has(node.id) : false;
                const isDimmed = (highlightedNodeIds && !highlightedNodeIds.has(node.id)) || !isMatch;
                const portrait = portraitMap[node.name] || getCachedCharacterPortrait(node.name, bookTitle);
                const safeId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const hasImg = Boolean(portrait?.imageUrl);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="pointer-events-auto cursor-pointer"
                    opacity={isDimmed ? 0.12 : 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectNode(node.id);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (animFrameRef.current) {
                        cancelAnimationFrame(animFrameRef.current);
                        animFrameRef.current = null;
                      }
                      setDraggingNodeId(node.id);
                      dragStartPos.current = { x: e.clientX, y: e.clientY };
                    }}
                  >
                    {/* ONLY when selected: Radiant celestial aura + concentric outer focus ring */}
                    {isSelected && (
                      <>
                        <circle
                          r={node.radius + 12}
                          fill="color-mix(in srgb, var(--ui-focus) 15%, transparent)"
                        />
                        <circle
                          r={node.radius + 6}
                          fill="none"
                          stroke="var(--ui-focus)"
                          strokeWidth={2.8}
                          strokeOpacity={0.95}
                        />
                      </>
                    )}

                    {/* Active Scene Partner Highlight */}
                    {isScenePartner && !isSelected && (
                      <>
                        <circle
                          r={node.radius + 10}
                          fill="color-mix(in srgb, var(--ui-focus) 12%, transparent)"
                        />
                        <circle
                          r={node.radius + 5}
                          fill="none"
                          stroke="var(--ui-focus)"
                          strokeWidth={2.2}
                          strokeDasharray="4 3"
                          strokeOpacity={0.9}
                        />
                      </>
                    )}

                    {/* Connected Neighbor Subtle Accent Rim (only when another character is selected) */}
                    {isConnectedNeighbor && !isSelected && !isScenePartner && (
                      <circle
                        r={node.radius + 4}
                        fill="none"
                        stroke="var(--ui-focus)"
                        strokeWidth={1.6}
                        strokeOpacity={0.65}
                      />
                    )}

                    {/* 3D Elevated Node Body */}
                    <g filter="url(#graph-node-shadow)">
                      {hasImg ? (
                        <>
                          <circle
                            r={node.radius}
                            fill="var(--bg-secondary)"
                          />
                          <image
                            href={portrait!.imageUrl!}
                            x={-node.radius}
                            y={-node.radius}
                            width={node.radius * 2}
                            height={node.radius * 2}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#${safeId})`}
                          />
                          <circle
                            r={node.radius}
                            fill="none"
                            stroke={isSelected || isScenePartner ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                            strokeWidth={isSelected ? 3.5 : isScenePartner ? 3 : 2.5}
                            className="transition-colors duration-200"
                          />
                        </>
                      ) : (
                        <>
                          <circle
                            r={node.radius}
                            fill={node.avatarColor}
                            stroke={isSelected || isScenePartner ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                            strokeWidth={isSelected ? 3.5 : isScenePartner ? 3 : 2.5}
                            className="transition-colors duration-200"
                          />
                          <text
                            textAnchor="middle"
                            dy="4.5"
                            fontSize={Math.max(10, node.radius * 0.44)}
                            fontWeight="900"
                            fill="#ffffff"
                            fontFamily="serif"
                            className="select-none pointer-events-none drop-shadow-xs"
                          >
                            {node.name.slice(0, 2).toUpperCase()}
                          </text>
                        </>
                      )}
                    </g>

                    {/* Character Name Label with Elevated Pill Badge when Selected / Active Partner */}
                    {isSelected ? (
                      <g transform={`translate(0, ${node.radius + 17})`}>
                        <rect
                          x={-(node.name.length * 4.2 + 14)}
                          y={-10}
                          width={node.name.length * 8.4 + 28}
                          height={20}
                          rx={10}
                          fill="var(--bg-elevated)"
                          stroke="var(--ui-focus)"
                          strokeWidth={1.5}
                          filter="url(#graph-node-shadow)"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fontSize={11.5}
                          fontWeight="800"
                          fill="var(--ui-focus)"
                          className="select-none pointer-events-none font-sans tracking-tight"
                        >
                          {node.name}
                        </text>
                      </g>
                    ) : isScenePartner ? (
                      <g transform={`translate(0, ${node.radius + 17})`}>
                        <rect
                          x={-(node.name.length * 4 + 12)}
                          y={-9}
                          width={node.name.length * 8 + 24}
                          height={18}
                          rx={9}
                          fill="var(--bg-elevated)"
                          stroke="var(--ui-focus)"
                          strokeWidth={1.2}
                          strokeDasharray="3 2"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fontSize={11}
                          fontWeight="700"
                          fill="var(--ui-focus)"
                          className="select-none pointer-events-none font-sans tracking-tight"
                        >
                          {node.name}
                        </text>
                      </g>
                    ) : (
                      <g transform={`translate(0, ${node.radius + 15})`}>
                        <text
                          textAnchor="middle"
                          fontSize={11.5}
                          fontWeight={isConnectedNeighbor ? '700' : '600'}
                          fill={isConnectedNeighbor ? 'var(--text-primary)' : 'var(--text-secondary)'}
                          stroke="var(--bg-elevated)"
                          strokeWidth={3.5}
                          strokeLinejoin="round"
                          style={{ paintOrder: 'stroke fill' }}
                          className="select-none pointer-events-none font-sans tracking-tight"
                        >
                          {node.name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* ─── Legend / Hint Overlay ─── */}
          <div className="absolute bottom-3 left-3 pointer-events-none text-[10.5px] text-[var(--text-tertiary)] flex items-center gap-2.5 bg-[var(--bg-elevated)]/85 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shadow-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--ui-focus)]" />
              <span>Click character to focus ties</span>
            </span>
            <span>•</span>
            <span>Drag to reposition</span>
          </div>

          {/* ─── Floating Canvas Quick-Controls Dock ─── */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 rounded-2xl bg-[var(--bg-elevated)]/90 backdrop-blur-md border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-lg z-20">
            <ReaderTooltip content="Zoom In">
              <button
                type="button"
                onClick={() => handleZoom(0.2)}
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </ReaderTooltip>
            <ReaderTooltip content="Zoom Out">
              <button
                type="button"
                onClick={() => handleZoom(-0.2)}
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
            </ReaderTooltip>
            <ReaderTooltip content="Fit Constellation">
              <button
                type="button"
                onClick={() => handleFitView(true)}
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] transition-colors cursor-pointer"
                aria-label="Fit to screen"
              >
                <Focus size={14} />
              </button>
            </ReaderTooltip>
            <ReaderTooltip content="Reset View">
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                aria-label="Reset zoom"
              >
                <RotateCcw size={14} />
              </button>
            </ReaderTooltip>
          </div>
        </div>

        {/* ─── Desktop / Tablet Docked Inspector Drawer (Auto-Resizing split) ─── */}
        <AnimatePresence mode="wait">
          {selectedEdge && (
            <motion.div
              key="edge-inspector"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="hidden sm:flex flex-col w-[380px] md:w-[420px] h-full border-l border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl z-30 shrink-0 font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {renderEdgeDossier(selectedEdge)}
            </motion.div>
          )}

          {selectedCharacter && !selectedEdge && (
            <motion.div
              key="char-inspector"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`hidden sm:flex flex-col h-full border-l border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl z-30 shrink-0 font-sans transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                expandedConnName
                  ? 'w-[580px] md:w-[700px] lg:w-[760px] max-w-[55vw]'
                  : 'w-[360px] md:w-[410px]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {renderCharacterCard(selectedCharacter)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Mobile Slide-Up Bottom Sheet (< sm screens) ─── */}
        <AnimatePresence>
          {(selectedCharacter || selectedEdge) && (
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="sm:hidden absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border-t border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl z-40 flex flex-col font-sans overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-[var(--ui-divider)] rounded-full self-center my-2 shrink-0 opacity-60" />
              <div className="flex-1 overflow-hidden flex flex-col">
                {selectedEdge ? renderEdgeDossier(selectedEdge) : renderCharacterCard(selectedCharacter!)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
