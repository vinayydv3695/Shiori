import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  X,
  BookOpen,
  Search,
  MessageSquare,
  Sparkles,
  Lock,
  Unlock,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import type { TrackedCharacter, CharacterInteractionEdge, CharacterNetworkData } from '@/lib/characterTracker';
import type { CharacterPortrait } from '@/lib/characterImageService';
import {
  useCharacterPortrait,
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
  vx: number;
  vy: number;
  radius: number;
  isPinned?: boolean;
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SimLink | null>(null);

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
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Node Dragging state
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
    const angleStep = (2 * Math.PI) / Math.max(1, networkData.characters.length);

    networkData.characters.forEach((char, idx) => {
      if (char.firstMention.chapterIndex <= maxZeroIndex) {
        const radius = Math.min(32, Math.max(16, 16 + Math.sqrt(char.totalMentions) * 2.8));
        const initAngle = idx * angleStep;
        const initDist = 120 + (idx % 3) * 60;
        nodeMap.set(char.name, {
          id: char.name,
          name: char.name,
          totalMentions: char.totalMentions,
          chapters: char.chapters,
          firstChapter: char.firstMention.chapterIndex,
          avatarColor: char.avatarColor,
          x: Math.cos(initAngle) * initDist,
          y: Math.sin(initAngle) * initDist,
          vx: 0,
          vy: 0,
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

  // Keep animated simulation positions in local state
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Physics simulation runner
  useEffect(() => {
    if (visibleNodes.length === 0) return;

    // Initialize positions from previous state or node defaults
    const nodeState = visibleNodes.map((n) => ({
      ...n,
      x: positions[n.id]?.x ?? n.x,
      y: positions[n.id]?.y ?? n.y,
    }));

    const nodeIndexMap = new Map(nodeState.map((n, i) => [n.id, i]));
    let animationFrameId: number;
    let iteration = 0;
    const maxIterations = 140;

    const simulateStep = () => {
      // 1. Center gravity pull
      for (const n of nodeState) {
        if (n.id === draggingNodeId) continue;
        n.vx += -n.x * 0.015;
        n.vy += -n.y * 0.015;
      }

      // 2. Node-node electrostatic repulsion
      for (let i = 0; i < nodeState.length; i++) {
        for (let j = i + 1; j < nodeState.length; j++) {
          const a = nodeState[i];
          const b = nodeState[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);
          const minDist = a.radius + b.radius + 35;

          const repulseForce = Math.min(22, (minDist * minDist * 18) / distSq);
          const fx = (dx / dist) * repulseForce;
          const fy = (dy / dist) * repulseForce;

          if (a.id !== draggingNodeId) {
            a.vx += fx;
            a.vy += fy;
          }
          if (b.id !== draggingNodeId) {
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
        const targetDist = Math.max(70, 150 - Math.min(link.weight, 10) * 8);

        const springForce = (dist - targetDist) * 0.035;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (src.id !== draggingNodeId) {
          src.vx += fx;
          src.vy += fy;
        }
        if (tgt.id !== draggingNodeId) {
          tgt.vx -= fx;
          tgt.vy -= fy;
        }
      }

      // 4. Update coordinates with momentum damping
      const newPos: Record<string, { x: number; y: number }> = {};
      for (const n of nodeState) {
        if (n.id !== draggingNodeId) {
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x += n.vx;
          n.y += n.vy;
        }
        newPos[n.id] = { x: n.x, y: n.y };
      }

      setPositions(newPos);
      iteration++;

      if (iteration < maxIterations || draggingNodeId) {
        animationFrameId = requestAnimationFrame(simulateStep);
      }
    };

    animationFrameId = requestAnimationFrame(simulateStep);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [visibleNodes, visibleLinks, draggingNodeId]);

  // Compute connected neighbors for selected/hovered node
  const highlightedNodeIds = useMemo(() => {
    const targetId = selectedNodeId || hoveredNodeId;
    if (!targetId) return null;

    const set = new Set<string>([targetId]);
    for (const link of visibleLinks) {
      if (link.source.id === targetId) set.add(link.target.id);
      if (link.target.id === targetId) set.add(link.source.id);
    }
    return set;
  }, [selectedNodeId, hoveredNodeId, visibleLinks]);

  // Zoom and Pan controls
  const handleZoom = (delta: number) => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.35, Math.min(2.8, prev.scale + delta)),
    }));
  };

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  // Background drag to pan
  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName !== 'svg' && (e.target as HTMLElement).id !== 'graph-canvas-bg') {
      return;
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
      setPositions((prev) => {
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

  // Scroll wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(zoomFactor);
  };

  const selectedCharacter = useMemo(() => {
    if (!selectedNodeId) return null;
    return networkData.characters.find((c) => c.name === selectedNodeId) || null;
  }, [selectedNodeId, networkData.characters]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden flex flex-col font-sans select-none ${
        isFullscreen ? 'h-full bg-[var(--bg-elevated)]' : 'h-[520px] rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)]'
      }`}
    >
      {/* ─── Top Control Bar: Spoiler-Guard Slider & Filters ─── */}
      <div className="flex items-center justify-between gap-2 p-2.5 px-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,var(--bg-secondary))] z-20 shrink-0 flex-wrap">
        {isFullscreen && onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_15%,var(--bg-elevated))] text-xs font-bold text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-xs mr-1 shrink-0"
          >
            <ArrowLeft size={14} />
            <span>Back to Reader</span>
          </button>
        )}

        {/* Progressive Spoiler Guard Slider */}
        <div className="flex items-center gap-2.5 min-w-[210px] flex-1">
          <ReaderTooltip
            content={
              maxChapter > currentChapterIndex + 1
                ? 'Spoiler Warning: Slider extended beyond current reading progress!'
                : 'Spoiler Guard Active: Relationships from future chapters are hidden'
            }
          >
            <div
              className={`p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold ${
                maxChapter > currentChapterIndex + 1
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)]'
              }`}
            >
              {maxChapter > currentChapterIndex + 1 ? <Unlock size={12} /> : <ShieldCheck size={12} />}
              <span>Ch. {maxChapter}</span>
            </div>
          </ReaderTooltip>
          <input
            type="range"
            min={1}
            max={Math.max(1, totalChapters)}
            value={maxChapter}
            onChange={(e) => setMaxChapter(Number(e.target.value))}
            className="flex-1 h-1.5 rounded-lg accent-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] cursor-pointer"
          />
          <span className="text-[11px] text-[var(--text-tertiary)] font-mono shrink-0">
            /{totalChapters}
          </span>
        </div>

        {/* Search input & Action tools */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Find character..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-28 sm:w-36 pl-7 pr-2 py-1 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)]"
            />
          </div>

          <ReaderTooltip content="Zoom In">
            <button
              type="button"
              onClick={() => handleZoom(0.2)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
          </ReaderTooltip>

          <ReaderTooltip content="Zoom Out">
            <button
              type="button"
              onClick={() => handleZoom(-0.2)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
          </ReaderTooltip>

          <ReaderTooltip content="Reset View">
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          </ReaderTooltip>

          {onToggleFullscreen && (
            <ReaderTooltip content={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Graph'}>
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg text-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] transition-colors cursor-pointer ml-1"
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </ReaderTooltip>
          )}
        </div>
      </div>

      {/* ─── Main SVG Force-Directed Canvas ─── */}
      <div
        id="graph-canvas-bg"
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
        onWheel={handleWheel}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox={isFullscreen ? "-600 -400 1200 800" : "-400 -300 800 600"}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {visibleNodes.map((node) => {
              const safeId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
              return (
                <clipPath key={safeId} id={safeId}>
                  <circle r={node.radius} cx={0} cy={0} />
                </clipPath>
              );
            })}
          </defs>
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            {/* Edges / Relationship springs */}
            {visibleLinks.map((link, idx) => {
              const srcPos = positions[link.source.id] || { x: link.source.x, y: link.source.y };
              const tgtPos = positions[link.target.id] || { x: link.target.x, y: link.target.y };

              const isHighlighted =
                highlightedNodeIds &&
                highlightedNodeIds.has(link.source.id) &&
                highlightedNodeIds.has(link.target.id);
              const isDimmed = highlightedNodeIds && !isHighlighted;

              const strokeWidth = Math.min(6, Math.max(1.8, Math.sqrt(link.weight) * 1.6));
              const strokeOpacity = isDimmed ? 0.08 : isHighlighted ? 0.95 : 0.42;

              return (
                <g key={`${link.source.id}-${link.target.id}-${idx}`} className="pointer-events-auto">
                  {/* Invisible thicker stroke for easy clicking/hovering */}
                  <line
                    x1={srcPos.x}
                    y1={srcPos.y}
                    x2={tgtPos.x}
                    y2={tgtPos.y}
                    stroke="transparent"
                    strokeWidth={Math.max(16, strokeWidth + 10)}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdge(link);
                    }}
                  />
                  {/* Visible connection line */}
                  <line
                    x1={srcPos.x}
                    y1={srcPos.y}
                    x2={tgtPos.x}
                    y2={tgtPos.y}
                    stroke={isHighlighted ? 'var(--ui-focus)' : 'var(--text-secondary)'}
                    strokeWidth={strokeWidth}
                    strokeOpacity={strokeOpacity}
                    strokeLinecap="round"
                    className="transition-all duration-200"
                  />
                  {/* Interaction count badge along edge */}
                  {link.weight >= 2 && !isDimmed && (
                    <g transform={`translate(${(srcPos.x + tgtPos.x) / 2}, ${(srcPos.y + tgtPos.y) / 2})`}>
                      <circle r={9} fill="var(--bg-elevated)" stroke="var(--ui-border)" strokeWidth={1} />
                      <text
                        textAnchor="middle"
                        dy="3"
                        fontSize={8.5}
                        fontWeight="bold"
                        fill="var(--text-secondary)"
                        className="select-none font-mono"
                      >
                        {link.weight}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes / Character avatars */}
            {visibleNodes.map((node) => {
              const pos = positions[node.id] || { x: node.x, y: node.y };
              const isMatch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
              const isHighlighted = highlightedNodeIds ? highlightedNodeIds.has(node.id) : isMatch;
              const isDimmed = (highlightedNodeIds && !highlightedNodeIds.has(node.id)) || !isMatch;
              const isSelected = selectedNodeId === node.id;
              const portrait = portraitMap[node.name] || getCachedCharacterPortrait(node.name, bookTitle);
              const safeId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
              const hasImg = Boolean(portrait?.imageUrl);

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="pointer-events-auto cursor-pointer"
                  opacity={isDimmed ? 0.22 : 1}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingNodeId(node.id);
                    dragStartPos.current = { x: e.clientX, y: e.clientY };
                  }}
                >
                  {/* Selection / Focus glow ring */}
                  {(isSelected || hoveredNodeId === node.id) && (
                    <circle
                      r={node.radius + 7}
                      fill="none"
                      stroke="var(--ui-focus)"
                      strokeWidth={2.5}
                      strokeDasharray="4 3"
                      className="animate-spin-slow"
                    />
                  )}

                  {hasImg ? (
                    <>
                      {/* Character image inside clip circle */}
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
                        stroke={isSelected ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                        strokeWidth={2.5}
                        className="shadow-md transition-transform duration-200"
                      />
                    </>
                  ) : (
                    <>
                      {/* Character Node Body with fallback initials */}
                      <circle
                        r={node.radius}
                        fill={node.avatarColor}
                        stroke={isSelected ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                        strokeWidth={2.5}
                        className="shadow-md transition-transform duration-200"
                      />
                      <text
                        textAnchor="middle"
                        dy="4"
                        fontSize={Math.max(9, node.radius * 0.45)}
                        fontWeight="900"
                        fill="#ffffff"
                        fontFamily="serif"
                        className="select-none pointer-events-none drop-shadow-xs"
                      >
                        {node.name.slice(0, 2).toUpperCase()}
                      </text>
                    </>
                  )}

                  {/* Character Name Label */}
                  <text
                    y={node.radius + 14}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={isSelected ? '700' : '600'}
                    fill={isSelected ? 'var(--ui-focus)' : 'var(--text-primary)'}
                    className="select-none pointer-events-none font-sans drop-shadow-sm"
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* ─── Legend / Hint Overlay ─── */}
        <div className="absolute bottom-2.5 left-3 pointer-events-none text-[10px] text-[var(--text-tertiary)] flex items-center gap-3 bg-[var(--bg-elevated)]/80 backdrop-blur-xs px-2.5 py-1 rounded-full border border-[color-mix(in_srgb,var(--ui-border)_40%,transparent)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--ui-focus)]" />
            <span>Click connection to read quotes</span>
          </span>
          <span>•</span>
          <span>Drag nodes to pin</span>
        </div>
      </div>

      {/* ─── Edge / Connection Dossier Popover ─── */}
      <AnimatePresence>
        {selectedEdge && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 max-h-[320px] bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] shadow-2xl p-4 z-30 flex flex-col font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const pSrc = portraitMap[selectedEdge.source.name] || getCachedCharacterPortrait(selectedEdge.source.name, bookTitle);
              const pTgt = portraitMap[selectedEdge.target.name] || getCachedCharacterPortrait(selectedEdge.target.name, bookTitle);

              return (
                <div className="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center -space-x-1.5 shrink-0">
                      {pSrc?.imageUrl ? (
                        <img src={pSrc.imageUrl} alt={selectedEdge.source.name} className="w-6 h-6 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]" style={{ background: selectedEdge.source.avatarColor }}>
                          {selectedEdge.source.name.slice(0, 1)}
                        </div>
                      )}
                      {pTgt?.imageUrl ? (
                        <img src={pTgt.imageUrl} alt={selectedEdge.target.name} className="w-6 h-6 rounded-full object-cover border-2 border-[var(--bg-elevated)] shadow-xs" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-elevated)]" style={{ background: selectedEdge.target.avatarColor }}>
                          {selectedEdge.target.name.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <h4 className="text-sm font-bold truncate">
                      {selectedEdge.source.name} <span className="text-[var(--text-tertiary)] font-normal text-xs">⟷</span> {selectedEdge.target.name}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedEdge(null)}
                    className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 my-2.5 text-xs text-[var(--text-secondary)] font-medium">
              <span className="px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] font-bold">
                {selectedEdge.weight} shared {selectedEdge.weight === 1 ? 'scene' : 'scenes'}
              </span>
              <span>across {selectedEdge.chapters.length} chapter(s)</span>
            </div>

            {/* Scrollable list of verified shared quotes */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {selectedEdge.sampleQuotes.map((sq, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_70%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-[11.5px] leading-relaxed font-serif italic text-[var(--text-primary)] relative group"
                >
                  <div className="flex items-center justify-between not-italic text-[10px] text-[var(--text-tertiary)] font-sans font-semibold mb-1">
                    <span>Chapter {sq.chapterIndex + 1}</span>
                    <button
                      type="button"
                      onClick={() => onNavigateToChapter(sq.chapterIndex, selectedEdge.source.name)}
                      className="text-[var(--ui-focus)] hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <BookOpen size={10} />
                      <span>Jump</span>
                    </button>
                  </div>
                  "{sq.quote}"
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Selected Character Quick Dossier Card ─── */}
      <AnimatePresence>
        {selectedCharacter && !selectedEdge && (() => {
          const selectedPortrait = portraitMap[selectedCharacter.name] || getCachedCharacterPortrait(selectedCharacter.name, bookTitle);

          return (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-80 bg-[var(--bg-elevated)] rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] shadow-2xl p-3.5 z-30 flex items-center justify-between gap-3 font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 min-w-0">
                {selectedPortrait?.imageUrl ? (
                  <img
                    src={selectedPortrait.imageUrl}
                    alt={selectedCharacter.name}
                    className="w-11 h-11 rounded-xl object-cover shrink-0 border border-[var(--ui-border)] shadow-xs"
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black font-serif text-white shrink-0 shadow-xs"
                    style={{ background: selectedCharacter.avatarColor }}
                  >
                    {selectedCharacter.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] truncate my-0">
                    {selectedCharacter.name}
                  </h4>
                  <p className="text-[11px] text-[var(--text-tertiary)] m-0">
                    {selectedCharacter.totalMentions} mentions • First in Ch. {selectedCharacter.firstMention.chapterIndex + 1}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onOpenCharacterDetail(selectedCharacter, selectedPortrait || { imageUrl: null });
                  }}
                  className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-[var(--ui-focus)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  Dossier
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
