import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
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
  Bookmark,
  Activity,
  Download,
  Filter,
  Loader2,
  Eye,
  Network,
  Play,
  Pause,
  Route,
  Sparkles,
} from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { isTauri } from '@/lib/tauri';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useReadingSettings } from '@/store/premiumReaderStore';
import type { TrackedCharacter, CharacterNetworkData } from '@/lib/characterTracker';
import type { CharacterPortrait } from '@/lib/characterImageService';
import {
  getCachedCharacterPortrait,
  prefetchCharacterPortraits,
} from '@/lib/characterImageService';
import { ReaderTooltip } from './ReaderTooltip';

function sanitizeQuote(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('“') && s.endsWith('”')) ||
      (s.startsWith('‘') && s.endsWith('’'))
    ) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

function deduplicateSampleQuotes(quotes: { chapterIndex: number; quote: string }[]) {
  if (!quotes || quotes.length <= 1) return quotes || [];
  const result: { chapterIndex: number; quote: string }[] = [];

  for (const item of quotes) {
    const clean = sanitizeQuote(item.quote);
    if (!clean) continue;

    // Check if this quote is a duplicate or largely overlaps with an existing quote in the same chapter
    const isDup = result.some((existing) => {
      if (existing.chapterIndex !== item.chapterIndex) return false;
      const exClean = sanitizeQuote(existing.quote);
      if (exClean === clean) return true;
      // If one string contains a major part (>35 chars) of the other
      if (clean.length >= 35 && exClean.includes(clean.slice(0, 35))) return true;
      if (exClean.length >= 35 && clean.includes(exClean.slice(0, 35))) return true;
      return false;
    });

    if (!isDup) {
      result.push(item);
    }
  }

  return result;
}

function getDistinctiveQuoteTerm(rawQuote: string, fallbackName?: string): string {
  if (!rawQuote?.trim()) return fallbackName || '';
  const clean = sanitizeQuote(rawQuote);
  // If sliding window combined snippet with ellipsis, prioritize the primary segment
  const primarySnippet = clean.split(/\s*(?:\.\.\.|\u2026)\s*/)[0]?.trim() || clean;
  // If there's an embedded dialogue quote section (e.g. “...” or "..." or ‘...’), that's the most distinctive!
  const dialogueMatch = primarySnippet.match(/["“'‘]([^"”'’]{6,120})["”'’]/);
  if (dialogueMatch && dialogueMatch[1].trim().split(/\s+/).length >= 2) {
    return dialogueMatch[1].trim();
  }
  // Extract the first coherent clause or dialogue sentence
  const firstClause = primarySnippet.split(/[\n;—–]+/)[0]?.trim() || primarySnippet;
  const words = firstClause.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    // 5 to 10 authentic consecutive words provides a robust, unambiguous anchor
    return words.slice(0, Math.min(10, words.length)).join(' ');
  }
  return primarySnippet.slice(0, 80) || fallbackName || '';
}

function getCleanDisplayName(fullName: string): string {
  const honorifics = new Set([
    'mr',
    'mr.',
    'mrs',
    'mrs.',
    'ms',
    'ms.',
    'miss',
    'dr',
    'dr.',
    'prof',
    'prof.',
    'professor',
    'lord',
    'lady',
    'sir',
    'madam',
    'master',
    'rev',
    'reverend',
    'uncle',
    'aunt',
  ]);
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1 && honorifics.has(parts[0].toLowerCase())) {
    return parts[1];
  }
  return parts[0] || fullName;
}

function drawCanvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export type RelationshipType = 'conflict' | 'fealty' | 'bond' | 'ally' | 'neutral';

export interface SemanticRelationship {
  type: RelationshipType;
  label: string;
  color: string;
  glowColor: string;
}

export function getSemanticRelationship(quotes: { quote: string }[] = []): SemanticRelationship {
  if (!quotes || quotes.length === 0) {
    return {
      type: 'neutral',
      label: 'Acquaintances',
      color: 'var(--ui-focus)',
      glowColor: 'var(--ui-focus)',
    };
  }

  const text = quotes.map((q) => q.quote).join(' ').toLowerCase();

  const conflictScore = (text.match(/\b(rival|rivalry|enemy|opponent|nemesis|duel|clash|blade|fight|strike|attack|furious|battle|rage|destroy|death|hate|hatred|kill|hostile|threat|blood|challenge|spite)\b/g) || []).length;
  const fealtyScore = (text.match(/\b(master|lord|lady|knight|servant|maid|contract|oath|swear|sworn|vow|serve|duty|pledge|obey|loyal|loyalty|liege|subordinate|protect|guard)\b/g) || []).length;
  const bondScore = (text.match(/\b(love|beloved|fond|affection|cherish|tender|kiss|blush|embrace|sweetheart|darling|hug|adore|adoring|devoted|romance|romantic|sister|brother|father|mother|family|dear|smile)\b/g) || []).length;
  const allyScore = (text.match(/\b(ally|allies|comrade|comrades|friend|friends|partner|companion|team|together|trust|rescue|save|support|nodded|agreed|cooperate|stand by)\b/g) || []).length;

  const max = Math.max(conflictScore, fealtyScore, bondScore, allyScore);
  if (max === 0) {
    return {
      type: 'neutral',
      label: 'Co-occurrence',
      color: 'var(--ui-focus)',
      glowColor: 'var(--ui-focus)',
    };
  }

  if (bondScore === max) {
    return {
      type: 'bond',
      label: 'Love & Affection',
      color: '#d94677',
      glowColor: 'rgba(217, 70, 119, 0.25)',
    };
  }
  if (conflictScore === max) {
    return {
      type: 'conflict',
      label: 'Rivals & Conflict',
      color: '#c2410c',
      glowColor: 'rgba(194, 65, 12, 0.25)',
    };
  }
  if (fealtyScore === max) {
    return {
      type: 'fealty',
      label: 'Fealty & Devotion',
      color: '#b45309',
      glowColor: 'rgba(180, 83, 9, 0.25)',
    };
  }
  return {
    type: 'ally',
    label: 'Comrades & Allies',
    color: '#2e7d32',
    glowColor: 'rgba(46, 125, 50, 0.25)',
  };
}

export function findShortestPath(
  startId: string,
  endId: string,
  links: SimLink[]
): { pathNodes: string[]; pathEdges: Set<string> } | null {
  if (startId === endId) return { pathNodes: [startId], pathEdges: new Set() };

  const adj = new Map<string, { neighbor: string; edgeKey: string }[]>();
  for (const link of links) {
    const s = link.source.id;
    const t = link.target.id;
    const edgeKey = `${s}:::${t}`;
    const edgeKeyRev = `${t}:::${s}`;

    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s)!.push({ neighbor: t, edgeKey });
    adj.get(t)!.push({ neighbor: s, edgeKey: edgeKeyRev });
  }

  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const parentMap = new Map<string, { prev: string; edgeKey: string }>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === endId) {
      const pathNodes: string[] = [endId];
      const pathEdges = new Set<string>();
      let step = endId;
      while (step !== startId) {
        const info = parentMap.get(step)!;
        pathEdges.add(info.edgeKey);
        const [a, b] = step.localeCompare(info.prev) < 0 ? [step, info.prev] : [info.prev, step];
        pathEdges.add(`${a}:::${b}`);
        pathNodes.unshift(info.prev);
        step = info.prev;
      }
      return { pathNodes, pathEdges };
    }

    const neighbors = adj.get(curr) || [];
    for (const { neighbor, edgeKey } of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, { prev: curr, edgeKey });
        queue.push(neighbor);
      }
    }
  }

  return null;
}

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
  onNavigateToChapter: (chapterIndex: number, charName?: string, snippet?: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025, // Snappy stagger for rich scene lists
      delayChildren: 0.02,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

const sceneCardVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

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

  // Progressive Spoiler-Guard Slider:
  // If opening a new book or at chapter 0, default to totalChapters so relationships are immediately visible!
  const [maxChapter, setMaxChapter] = useState<number>(() => {
    if (!currentChapterIndex || currentChapterIndex <= 0) {
      return Math.max(1, totalChapters || 1);
    }
    const hasPriorInteractions = networkData.edges.some((e) =>
      e.chapters.some((c) => c <= currentChapterIndex)
    );
    if (!hasPriorInteractions && networkData.edges.length > 0) {
      return Math.max(1, totalChapters || 1);
    }
    return Math.max(1, Math.min(totalChapters || 1, currentChapterIndex + 1));
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [minWeight, setMinWeight] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SimLink | null>(null);
  const [expandedConnName, setExpandedConnName] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<'all' | 'individuals' | 'major'>('all');
  const [hoveredEdge, setHoveredEdge] = useState<{ link: SimLink; x: number; y: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeBondFilter, setActiveBondFilter] = useState<RelationshipType | null>(null);
  const [sidebarSort, setSidebarSort] = useState<'scenes' | 'alphabetical' | 'chapters'>('scenes');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pathfinder: Shortest relationship bridge between two characters
  const [pathfinderTargetId, setPathfinderTargetId] = useState<string | null>(null);

  // Storyline Horizon Playback ("Story Recap Mode")
  const [isPlayingRecap, setIsPlayingRecap] = useState(false);

  // Mini Hover Codex Card for zero-click character inspection
  const [hoverCodex, setHoverCodex] = useState<{ node: SimNode; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout cache key for instant 0ms recall of settled coordinates
  const layoutCacheKey = useMemo(() => {
    return bookTitle
      ? `shiori-char-layout-${bookTitle.slice(0, 36).replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : null;
  }, [bookTitle]);

  // Reset expanded connection and pathfinder target when switching character focus
  useEffect(() => {
    setExpandedConnName(null);
    setPathfinderTargetId(null);
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

  // Tiered dismiss on Escape (Scenes -> Edge Dossier -> Pathfinder -> Bond Filter -> Character -> Fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedConnName) {
          setExpandedConnName(null);
        } else if (selectedEdge) {
          setSelectedEdge(null);
        } else if (pathfinderTargetId) {
          setPathfinderTargetId(null);
        } else if (activeBondFilter) {
          setActiveBondFilter(null);
        } else if (selectedNodeId) {
          setSelectedNodeId(null);
        } else if (isFullscreen && onToggleFullscreen) {
          onToggleFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedConnName, selectedEdge, pathfinderTargetId, activeBondFilter, selectedNodeId, isFullscreen, onToggleFullscreen]);

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
  const isInteracting = isPanning || Boolean(draggingNodeId);

  // Storyline Horizon Playback timer
  useEffect(() => {
    if (!isPlayingRecap) return;

    const interval = setInterval(() => {
      setMaxChapter((prev) => {
        if (prev >= (totalChapters || 1)) {
          setIsPlayingRecap(false);
          return prev;
        }
        return prev + 1;
      });
    }, 480);

    return () => clearInterval(interval);
  }, [isPlayingRecap, totalChapters]);

  // Update slider if reader moves to a later chapter
  useEffect(() => {
    const currentProgress = currentChapterIndex + 1;
    setMaxChapter((prev) => Math.max(prev, currentProgress));
  }, [currentChapterIndex]);

  // Helper to identify plural group/family entity names (e.g. "Dursleys", "Potters", "Malfoys")
  const isPluralFamilyGroup = useCallback((name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed.endsWith('s') && !trimmed.toLowerCase().startsWith('the ')) return false;
    const singularStem = trimmed.replace(/^the\s+/i, '').replace(/s$/, '').toLowerCase();
    if (singularStem.length < 3) return false;
    return networkData.characters.some(
      (other) =>
        other.name.toLowerCase() !== name.toLowerCase() &&
        other.name.toLowerCase().includes(singularStem)
    );
  }, [networkData.characters]);

  // Counts of available entities under each filter mode
  const entityCounts = useMemo(() => {
    const maxZeroIndex = maxChapter - 1;
    const appeared = networkData.characters.filter((c) => c.firstMention.chapterIndex <= maxZeroIndex);
    const individuals = appeared.filter((c) => !isPluralFamilyGroup(c.name));
    const major = appeared.filter((c) => c.totalMentions >= 4 || c.chapters.length >= 2);
    return {
      all: appeared.length,
      individuals: individuals.length,
      major: major.length,
    };
  }, [networkData.characters, maxChapter, isPluralFamilyGroup]);

  // Filtered nodes and links based on spoiler-guard slider, search, entityFilter and min weight
  const { visibleNodes, visibleLinks } = useMemo(() => {
    const maxZeroIndex = maxChapter - 1;

    // Filter characters who have already appeared by maxChapter
    const nodeMap = new Map<string, SimNode>();

    networkData.characters.forEach((char) => {
      if (char.firstMention.chapterIndex <= maxZeroIndex) {
        const isSelected = selectedNodeId === char.name;
        if (!isSelected) {
          if (entityFilter === 'individuals' && isPluralFamilyGroup(char.name)) {
            return;
          }
          if (entityFilter === 'major' && char.totalMentions < 4 && char.chapters.length < 2) {
            return;
          }
        }

        const radius = Math.min(34, Math.max(20, 18 + Math.sqrt(char.totalMentions) * 2.7));
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
  }, [networkData, maxChapter, minWeight, entityFilter, selectedNodeId, isPluralFamilyGroup]);

  // ── Instant Static Constellation Layout (Zero Collision, Spoke Breathing Room) ──
  const staticPositions = useMemo(() => {
    if (visibleNodes.length === 0) return {};

    // Sort by prominence (mentions) so lead characters are at the center
    const sorted = [...visibleNodes].sort((a, b) => b.totalMentions - a.totalMentions);

    // 0. Check localStorage layout cache for instant 0ms settled coordinates
    let cachedPositions: Record<string, { x: number; y: number }> | null = null;
    if (layoutCacheKey) {
      try {
        const raw = localStorage.getItem(layoutCacheKey);
        if (raw) cachedPositions = JSON.parse(raw);
      } catch {}
    }

    const isFullyCached = Boolean(cachedPositions && sorted.every((n) => cachedPositions![n.id] !== undefined));

    // Initial golden ratio phyllotaxis distribution with comfortable spacing (or cached seed)
    const nodeState = sorted.map((n, i) => {
      if (cachedPositions && cachedPositions[n.id]) {
        return {
          ...n,
          x: cachedPositions[n.id].x,
          y: cachedPositions[n.id].y,
          vx: 0,
          vy: 0,
        };
      }
      if (i === 0) {
        return { ...n, x: 0, y: 0, vx: 0, vy: 0 };
      }
      const angle = i * 2.39996; // Golden angle (~137.5 deg in radians)
      const dist = 180 + Math.sqrt(i) * 135;
      return {
        ...n,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      };
    });

    const nodeIndexMap = new Map(nodeState.map((n, i) => [n.id, i]));
    const maxIters = isFullyCached ? 10 : 150;

    // Fast synchronous convergence loop (instant when cached, ~3ms on initial layout)
    for (let iter = 0; iter < maxIters; iter++) {
      const alpha = Math.max(0.06, 1 - iter / 150);

      // 1. Center gravity pull (gentle, keeps graph centered without crushing)
      for (const n of nodeState) {
        n.vx += -n.x * 0.008 * alpha;
        n.vy += -n.y * 0.008 * alpha;
      }

      // 2. Electrostatic repulsion with generous collision buffers for labels and avatars
      for (let i = 0; i < nodeState.length; i++) {
        for (let j = i + 1; j < nodeState.length; j++) {
          const a = nodeState[i];
          const b = nodeState[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);

          // Buffer accounts for avatar radius and text label widths below the circles
          const labelWidthA = Math.min(65, Math.max(30, a.name.length * 4.2));
          const labelWidthB = Math.min(65, Math.max(30, b.name.length * 4.2));
          const minDist = a.radius + b.radius + labelWidthA + labelWidthB + 40;

          if (dist < minDist) {
            const push = ((minDist - dist) / minDist) * 28 * alpha;
            const fx = (dx / dist) * push;
            const fy = (dy / dist) * push;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          } else {
            const repulseForce = Math.min(24, (minDist * minDist * 18) / distSq) * alpha;
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
        // Expanded target distance to allow wide breathing room around central hubs
        const targetDist = Math.max(220, 360 - Math.min(link.weight, 10) * 12);

        const springForce = (dist - targetDist) * 0.025 * alpha;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // 4. Update coordinates with momentum damping
      for (const n of nodeState) {
        n.vx *= 0.68;
        n.vy *= 0.68;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    // 5. Strict Non-Overlap Constraint Pass (guarantees zero collisions)
    for (let pass = 0; pass < 12; pass++) {
      for (let i = 0; i < nodeState.length; i++) {
        for (let j = i + 1; j < nodeState.length; j++) {
          const a = nodeState[i];
          const b = nodeState[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const labelWidthA = Math.min(60, Math.max(25, a.name.length * 4.0));
          const labelWidthB = Math.min(60, Math.max(25, b.name.length * 4.0));
          const reqDist = a.radius + b.radius + labelWidthA + labelWidthB + 30;

          if (dist < reqDist) {
            const overlap = (reqDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            b.x += nx * overlap;
            b.y += ny * overlap;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
          }
        }
      }
    }

    const posMap: Record<string, { x: number; y: number }> = {};
    for (const n of nodeState) {
      posMap[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    }
    if (layoutCacheKey && Object.keys(posMap).length > 0) {
      try {
        localStorage.setItem(layoutCacheKey, JSON.stringify(posMap));
      } catch {}
    }
    return posMap;
  }, [visibleNodes, visibleLinks, layoutCacheKey]);

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

  // Compute connected neighbors for currently hovered node
  const hoveredNeighborIds = useMemo(() => {
    if (!hoveredNodeId) return null;

    const set = new Set<string>([hoveredNodeId]);
    for (const link of visibleLinks) {
      if (link.source.id === hoveredNodeId) set.add(link.target.id);
      if (link.target.id === hoveredNodeId) set.add(link.source.id);
    }
    return set;
  }, [hoveredNodeId, visibleLinks]);

  // Compute Pathfinder shortest connection bridge between selected character and target
  const shortestPath = useMemo(() => {
    if (!selectedNodeId || !pathfinderTargetId) return null;
    return findShortestPath(selectedNodeId, pathfinderTargetId, visibleLinks);
  }, [selectedNodeId, pathfinderTargetId, visibleLinks]);

  const pathNodeSet = useMemo(() => {
    if (!shortestPath) return null;
    return new Set(shortestPath.pathNodes);
  }, [shortestPath]);

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

  // Export high-resolution constellation poster with native save dialog and theme-aware canvas rendering
  const handleExportPoster = useCallback(async () => {
    if (visibleNodes.length === 0) {
      useToastStore.getState().addToast({
        title: 'No characters to export',
        description: 'No visible characters match the current filter',
        variant: 'info',
      });
      return;
    }

    setIsExporting(true);
    useToastStore.getState().addToast({
      title: 'Generating constellation poster...',
      description: 'Preparing high-resolution canvas',
      variant: 'info',
      duration: 2500,
    });

    try {
      // 1. Calculate bounding box of all visible nodes in world coordinates
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      visibleNodes.forEach((node) => {
        const p = getNodePos(node.id, node.x, node.y);
        minX = Math.min(minX, p.x - node.radius);
        maxX = Math.max(maxX, p.x + node.radius);
        minY = Math.min(minY, p.y - node.radius);
        maxY = Math.max(maxY, p.y + node.radius);
      });

      const graphW = Math.max(140, maxX - minX);
      const graphH = Math.max(140, maxY - minY);

      // High-resolution poster dimensions (2800 x 1800, 16:10 format)
      const canvasW = 2800;
      const canvasH = 1800;
      const paddingX = 220;
      const paddingTop = 260; // Room for book title, chapter & badge
      const paddingBottom = 160; // Room for atlas watermark

      const availableW = canvasW - paddingX * 2;
      const availableH = canvasH - paddingTop - paddingBottom;
      const scale = Math.min(availableW / graphW, availableH / graphH, 2.2);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const toCanvas = (x: number, y: number) => ({
        x: canvasW / 2 + (x - centerX) * scale,
        y: paddingTop + availableH / 2 + (y - centerY) * scale,
      });

      // 2. Fetch and decode portraits for visible nodes safely (Tauri-native + Web fallback)
      const imageMap = new Map<string, HTMLImageElement>();
      await Promise.all(
        visibleNodes.map(async (node) => {
          const portrait = portraitMap[node.name] || getCachedCharacterPortrait(node.name, bookTitle);
          if (!portrait?.imageUrl) return;

          try {
            let srcUrl = portrait.imageUrl;
            let blobUrlToRevoke: string | null = null;

            if (isTauri) {
              try {
                const res = await tauriFetch(srcUrl);
                if (res.ok) {
                  const blob = await res.blob();
                  srcUrl = URL.createObjectURL(blob);
                  blobUrlToRevoke = srcUrl;
                }
              } catch {
                // Ignore tauriFetch errors, fall back to direct URL
              }
            }

            await new Promise<void>((resolve) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              const timeout = setTimeout(() => {
                if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
                resolve();
              }, 2500);

              img.onload = () => {
                clearTimeout(timeout);
                imageMap.set(node.id, img);
                if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
                resolve();
              };
              img.onerror = () => {
                clearTimeout(timeout);
                if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
                resolve();
              };
              img.src = srcUrl;
            });
          } catch {
            // Graceful fallback to colored avatar initials
          }
        })
      );

      // Theme detection
      const readerTheme = useReadingSettings.getState().theme || 'paper';
      const isDark = readerTheme === 'dark' || readerTheme === 'black' || readerTheme === 'paper-dark';

      const renderPoster = (images: Map<string, HTMLImageElement>) => {
        const cvs = document.createElement('canvas');
        cvs.width = canvasW;
        cvs.height = canvasH;
        const ctx = cvs.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas 2D rendering context');

        // Draw Background & Vignette
        const bgGrad = ctx.createRadialGradient(
          canvasW / 2,
          canvasH / 2,
          100,
          canvasW / 2,
          canvasH / 2,
          canvasW * 0.75
        );
        if (isDark) {
          bgGrad.addColorStop(0, '#111827');
          bgGrad.addColorStop(0.65, '#0b0f19');
          bgGrad.addColorStop(1, '#05070b');
        } else {
          bgGrad.addColorStop(0, '#fdfbf7');
          bgGrad.addColorStop(0.65, '#f5efe4');
          bgGrad.addColorStop(1, '#ebe2d3');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Constellation subtle dot grid
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(120, 53, 15, 0.06)';
        const dotSpacing = 48;
        for (let x = 24; x < canvasW; x += dotSpacing) {
          for (let y = 24; y < canvasH; y += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw Header & Title Details
        ctx.save();
        ctx.fillStyle = isDark ? '#f8fafc' : '#451a03';
        ctx.font = 'bold 42px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const displayTitle =
          bookTitle && bookTitle.length > 55 ? bookTitle.slice(0, 52) + '...' : bookTitle || 'Character Constellation';
        ctx.fillText(displayTitle, 90, 80);

        // Subtitle with metadata
        ctx.fillStyle = isDark ? '#94a3b8' : '#78716c';
        ctx.font = '500 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(
          `Chapter ${maxChapter} of ${totalChapters} • ${visibleNodes.length} characters • ${visibleLinks.length} connections`,
          90,
          140
        );

        // Atlas Badge (Top Right)
        const badgeText = 'SHIORI • CHARACTER ATLAS';
        ctx.font = '700 14px system-ui, -apple-system, sans-serif';
        const badgeMetrics = ctx.measureText(badgeText);
        const badgeW = badgeMetrics.width + 36;
        const badgeH = 34;
        const badgeX = canvasW - 90 - badgeW;
        const badgeY = 85;

        ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(217, 119, 6, 0.4)';
        ctx.lineWidth = 1.5;
        drawCanvasRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 17);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isDark ? '#60a5fa' : '#d97706';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
        ctx.restore();

        // Draw Edges
        visibleLinks.forEach((link) => {
          const srcP = getNodePos(link.source.id, link.source.x, link.source.y);
          const tgtP = getNodePos(link.target.id, link.target.x, link.target.y);
          const src = toCanvas(srcP.x, srcP.y);
          const tgt = toCanvas(tgtP.x, tgtP.y);

          const isConnectedToSelected =
            Boolean(selectedNodeId) &&
            (link.source.id === selectedNodeId || link.target.id === selectedNodeId);
          const sceneWeight = Math.min(10, Math.max(1, link.sampleQuotes.length || link.weight));
          const strokeWidth = isConnectedToSelected
            ? Math.max(3.5, sceneWeight * 1.3 * scale)
            : Math.max(1.4, sceneWeight * 0.7 * scale);

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';

          if (isConnectedToSelected) {
            ctx.strokeStyle = isDark ? '#60a5fa' : '#d97706';
            ctx.globalAlpha = 0.88;
          } else {
            ctx.strokeStyle = isDark ? '#94a3b8' : '#78716c';
            ctx.globalAlpha = Math.min(0.5, 0.15 + sceneWeight * 0.035);
          }
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        });

        // Draw Nodes
        visibleNodes.forEach((node) => {
          const pos = getNodePos(node.id, node.x, node.y);
          const { x, y } = toCanvas(pos.x, pos.y);
          const r = Math.max(22, node.radius * scale);
          const img = images.get(node.id);
          const isSelected = selectedNodeId === node.id;

          ctx.save();

          // 3D Drop Shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
          ctx.shadowBlur = 14 * scale;
          ctx.shadowOffsetY = 4 * scale;

          // Selection aura
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, r + 8 * scale, 0, Math.PI * 2);
            ctx.strokeStyle = isDark ? '#60a5fa' : '#d97706';
            ctx.lineWidth = 3.5 * scale;
            ctx.stroke();
          }

          // Base Circle
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = node.avatarColor?.match(/#(?:[0-9a-fA-F]{3,8})/)?.[0] || '#6366f1';
          ctx.fill();

          // Image or Bold Initials
          if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
            ctx.restore();
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.round(r * 0.85)}px Georgia, "Times New Roman", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name.slice(0, 2).toUpperCase(), x, y + 1);
          }

          // Clean border ring
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected
            ? isDark ? '#60a5fa' : '#d97706'
            : isDark ? '#1e293b' : '#ffffff';
          ctx.lineWidth = isSelected ? 3.5 * scale : Math.max(2.5, 3 * scale);
          ctx.stroke();
          ctx.restore();

          // Draw Node Name Label with Spacious Rounded Pill
          ctx.save();
          const labelFontSize = Math.max(14, Math.round(15 * Math.min(scale, 1.25)));
          ctx.font = `600 ${labelFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const textMetrics = ctx.measureText(node.name);
          const textWidth = textMetrics.width;
          const pillPaddingH = 14 * Math.min(scale, 1.2);
          const pillW = textWidth + pillPaddingH * 2;
          const pillH = labelFontSize + 14;
          const pillX = x - pillW / 2;
          const pillY = y + r + 10;

          ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
          ctx.strokeStyle = isSelected
            ? isDark ? '#60a5fa' : '#d97706'
            : isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(226, 232, 240, 0.9)';
          ctx.lineWidth = isSelected ? 1.5 : 1;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;

          drawCanvasRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
          ctx.fill();
          ctx.stroke();

          ctx.shadowColor = 'transparent';
          ctx.fillStyle = isSelected
            ? isDark ? '#60a5fa' : '#d97706'
            : isDark ? '#f8fafc' : '#1e293b';
          ctx.fillText(node.name, x, pillY + pillH / 2);
          ctx.restore();
        });

        // Watermark / Footer
        ctx.save();
        ctx.fillStyle = isDark ? '#64748b' : '#a8a29e';
        ctx.font = '500 15px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Generated with Shiori Reader • Character Network Atlas', canvasW - 90, canvasH - 70);
        ctx.restore();

        return cvs;
      };

      // 3. Render Canvas & convert to PNG Blob
      let activeCanvas = renderPoster(imageMap);
      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((resolve) => activeCanvas.toBlob(resolve, 'image/png'));
      } catch {
        // Tainted canvas fallback: render without external images using vector avatars
        activeCanvas = renderPoster(new Map());
        blob = await new Promise<Blob | null>((resolve) => activeCanvas.toBlob(resolve, 'image/png'));
      }

      if (!blob) throw new Error('Failed to generate poster blob');

      // 4. Prompt user where to save the image (Native Save Dialog / Web Fallback)
      const cleanTitle = (bookTitle || 'Constellation').replace(/[^a-zA-Z0-9_-]/g, '_');
      const defaultFilename = `${cleanTitle}-constellation-ch${maxChapter}.png`;

      if (isTauri) {
        const filePath = await save({
          defaultPath: defaultFilename,
          filters: [
            {
              name: 'PNG Image',
              extensions: ['png'],
            },
          ],
        });

        if (!filePath) {
          // User cancelled the save dialog
          return;
        }

        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await writeFile(filePath, uint8Array);

        const filename = filePath.split(/[\/\\]/).pop() || defaultFilename;
        useToastStore.getState().addToast({
          title: 'Constellation poster saved',
          description: `Saved as ${filename}`,
          variant: 'success',
        });
      } else {
        const pngUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.download = defaultFilename;
        downloadLink.href = pngUrl;
        downloadLink.click();
        URL.revokeObjectURL(pngUrl);

        useToastStore.getState().addToast({
          title: 'Constellation poster downloaded',
          description: defaultFilename,
          variant: 'success',
        });
      }
    } catch (err) {
      console.error('Failed to export constellation poster:', err);
      useToastStore.getState().addToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error during export',
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    visibleNodes,
    visibleLinks,
    getNodePos,
    bookTitle,
    maxChapter,
    totalChapters,
    selectedNodeId,
    portraitMap,
  ]);

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
        const quotes = deduplicateSampleQuotes(link.sampleQuotes);
        list.push({
          otherNode: link.target,
          otherCharacter: otherChar,
          link: { ...link, sampleQuotes: quotes },
          sharedScenes: quotes.length > 0 ? quotes.length : link.weight,
          chapters: link.chapters,
        });
      } else if (link.target.id === selectedCharacter.name) {
        const otherChar = networkData.characters.find((c) => c.name === link.source.id);
        const quotes = deduplicateSampleQuotes(link.sampleQuotes);
        list.push({
          otherNode: link.source,
          otherCharacter: otherChar,
          link: { ...link, sampleQuotes: quotes },
          sharedScenes: quotes.length > 0 ? quotes.length : link.weight,
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
    const srcChar = networkData.characters.find((c) => c.name === edge.source.id);
    const tgtChar = networkData.characters.find((c) => c.name === edge.target.id);
    const quotes = deduplicateSampleQuotes(edge.sampleQuotes);
    const sceneCount = quotes.length > 0 ? quotes.length : edge.weight;

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 font-sans">
        <div className="flex items-center justify-between pb-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center -space-x-2 shrink-0">
              <ReaderTooltip content={srcChar ? `View ${edge.source.name}'s dossier` : edge.source.name}>
                <button
                  type="button"
                  onClick={() => {
                    if (srcChar) onOpenCharacterDetail(srcChar, pSrc || { imageUrl: null });
                  }}
                  className={`cursor-pointer hover:scale-105 active:scale-95 transition-transform ${!srcChar ? 'pointer-events-none' : ''}`}
                >
                  {pSrc?.imageUrl ? (
                    <img src={pSrc.imageUrl} alt={edge.source.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--bg-elevated)] shadow-2xs" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white ring-2 ring-[var(--bg-elevated)] shadow-2xs" style={{ background: edge.source.avatarColor }}>
                      {edge.source.name.slice(0, 1)}
                    </div>
                  )}
                </button>
              </ReaderTooltip>
              <ReaderTooltip content={tgtChar ? `View ${edge.target.name}'s dossier` : edge.target.name}>
                <button
                  type="button"
                  onClick={() => {
                    if (tgtChar) onOpenCharacterDetail(tgtChar, pTgt || { imageUrl: null });
                  }}
                  className={`cursor-pointer hover:scale-105 active:scale-95 transition-transform ${!tgtChar ? 'pointer-events-none' : ''}`}
                >
                  {pTgt?.imageUrl ? (
                    <img src={pTgt.imageUrl} alt={edge.target.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--bg-elevated)] shadow-2xs" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white ring-2 ring-[var(--bg-elevated)] shadow-2xs" style={{ background: edge.target.avatarColor }}>
                      {edge.target.name.slice(0, 1)}
                    </div>
                  )}
                </button>
              </ReaderTooltip>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-[var(--text-primary)] truncate my-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (srcChar) onOpenCharacterDetail(srcChar, pSrc || { imageUrl: null });
                  }}
                  className={`hover:underline cursor-pointer truncate ${!srcChar ? 'pointer-events-none' : ''}`}
                >
                  {edge.source.name}
                </button>
                <span className="text-[var(--text-tertiary)] font-normal text-xs shrink-0">⟷</span>
                <button
                  type="button"
                  onClick={() => {
                    if (tgtChar) onOpenCharacterDetail(tgtChar, pTgt || { imageUrl: null });
                  }}
                  className={`hover:underline cursor-pointer truncate text-[var(--ui-focus)] ${!tgtChar ? 'pointer-events-none' : ''}`}
                >
                  {edge.target.name}
                </button>
              </h4>
              <div className="flex items-center gap-2 my-0.5 flex-wrap">
                {(() => {
                  const rel = getSemanticRelationship(edge.sampleQuotes);
                  return (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${rel.color} 14%, var(--bg-elevated))`,
                        color: rel.color,
                        border: `1px solid color-mix(in srgb, ${rel.color} 30%, transparent)`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rel.color }} />
                      {rel.label}
                    </span>
                  );
                })()}
                <span className="text-[10.5px] text-[var(--text-tertiary)] flex items-center gap-1">
                  <MessageSquare size={11} className="text-[var(--ui-focus)] opacity-80" />
                  <span>
                    {sceneCount} shared {sceneCount === 1 ? 'scene' : 'scenes'} across {edge.chapters.length} {edge.chapters.length === 1 ? 'chapter' : 'chapters'}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <ReaderTooltip content="Close connection dossier">
            <button
              type="button"
              onClick={() => setSelectedEdge(null)}
              className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
              aria-label="Close dossier"
            >
              <X size={16} />
            </button>
          </ReaderTooltip>
        </div>

        {/* Scrollable list of verified shared quotes */}
        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 text-xs custom-scrollbar"
        >
          {quotes.map((sq, idx) => {
            const cleanQuote = sanitizeQuote(sq.quote);
            return (
              <motion.div
                key={idx}
                variants={sceneCardVariants}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="relative p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_40%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shadow-2xs hover:border-[var(--ui-focus)]/45 hover:shadow-xs transition-all duration-200 group flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-sans font-semibold">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--ui-focus)_10%,transparent)] border border-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] text-[var(--ui-focus)] font-bold text-[10.5px]">
                    <BookOpen size={11} className="opacity-80" />
                    <span>Chapter {sq.chapterIndex + 1}</span>
                  </span>
                  <ReaderTooltip content={`Jump to Chapter ${sq.chapterIndex + 1} in reader`}>
                    <button
                      type="button"
                      onClick={() => onNavigateToChapter(sq.chapterIndex, getDistinctiveQuoteTerm(sq.quote, edge.source.name), sq.quote)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-semibold text-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-secondary))] hover:bg-[var(--ui-focus)] hover:text-white border border-[color-mix(in_srgb,var(--ui-focus)_18%,transparent)] transition-all cursor-pointer shadow-2xs group/btn"
                    >
                      <span>Jump to scene</span>
                      <ArrowRight size={10} className="opacity-60 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </ReaderTooltip>
                </div>
                <div className="relative pl-3 border-l-2 border-[var(--ui-focus)]/70">
                  <p className="font-serif italic text-[12.5px] sm:text-[13px] leading-relaxed text-[var(--text-primary)] m-0 select-text">
                    “{cleanQuote}”
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    );
  };

  // ── Render Helper: Character Relations & Scenes Split Reader ──
  const renderCharacterCard = (char: TrackedCharacter) => {
    const selectedPortrait = portraitMap[char.name] || getCachedCharacterPortrait(char.name, bookTitle);
    const isExpanded = Boolean(expandedConnName);
    const expandedConn = characterConnections.find((c) => c.otherNode.id === expandedConnName);
    const expandedPortrait = expandedConn ? (portraitMap[expandedConn.otherNode.name] || getCachedCharacterPortrait(expandedConn.otherNode.name, bookTitle)) : null;

    const sortedConnections = characterConnections
      .filter((c) => {
        if (!sidebarSearch.trim()) return true;
        return c.otherNode.name.toLowerCase().includes(sidebarSearch.toLowerCase().trim());
      })
      .sort((a, b) => {
        if (sidebarSort === 'scenes') return b.sharedScenes - a.sharedScenes;
        if (sidebarSort === 'alphabetical') return a.otherNode.name.localeCompare(b.otherNode.name);
        if (sidebarSort === 'chapters') return b.chapters.length - a.chapters.length;
        return 0;
      });

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
        {/* Header: Avatar, Name, Badges & Actions */}
        <div className="p-4 pb-3.5 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_25%,var(--bg-elevated))] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <ReaderTooltip content={`View ${char.name}'s dossier & biography`}>
                <button
                  type="button"
                  onClick={() => onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null })}
                  className="relative shrink-0 rounded-2xl cursor-pointer hover:opacity-90 active:scale-95 transition-all group"
                  aria-label={`Open ${char.name} dossier`}
                >
                  {selectedPortrait?.imageUrl ? (
                    <img
                      src={selectedPortrait.imageUrl}
                      alt={char.name}
                      className="w-12 h-12 rounded-2xl object-cover shrink-0 ring-1 ring-[var(--ui-border)] shadow-xs group-hover:ring-2 group-hover:ring-[var(--ui-focus)] transition-all"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold font-serif text-white shrink-0 shadow-xs ring-1 ring-white/10 group-hover:ring-2 group-hover:ring-[var(--ui-focus)] transition-all"
                      style={{ background: char.avatarColor }}
                    >
                      {char.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--ui-focus)] text-white flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
                    <BookOpen size={9} />
                  </span>
                </button>
              </ReaderTooltip>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null })}
                  className="text-base sm:text-lg font-bold font-serif text-[var(--text-primary)] hover:text-[var(--ui-focus)] transition-colors truncate my-0 leading-tight tracking-tight text-left cursor-pointer"
                >
                  {char.name}
                </button>
                {char.nativeName && (
                  <p className="text-xs text-[var(--text-tertiary)] italic truncate my-0.5">
                    {char.nativeName}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shadow-2xs">
                    <strong>{char.totalMentions}</strong> {char.totalMentions === 1 ? 'mention' : 'mentions'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-medium bg-[color-mix(in_srgb,var(--bg-secondary)_85%,var(--bg-elevated))] text-[var(--text-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]">
                    <strong>{char.chapters.length}</strong> {char.chapters.length === 1 ? 'chapter' : 'chapters'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-medium bg-[color-mix(in_srgb,var(--bg-secondary)_85%,var(--bg-elevated))] text-[var(--text-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]">
                    Debut <strong>Ch. {char.firstMention.chapterIndex + 1}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <ReaderTooltip content="Open full character dossier with biography">
                <button
                  type="button"
                  onClick={() => {
                    onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ui-focus)] hover:opacity-95 active:scale-[0.98] text-white transition-all cursor-pointer shadow-xs"
                >
                  <BookOpen size={13} />
                  <span>Dossier</span>
                </button>
              </ReaderTooltip>
              <ReaderTooltip content="Close character inspector">
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
            className={`overflow-y-auto p-4 space-y-3.5 text-xs transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded
                ? 'w-full sm:w-[280px] md:w-[320px] shrink-0 border-b sm:border-b-0 sm:border-r border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]'
                : 'w-full flex-1'
            }`}
          >
            {/* Story Presence Timeline */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="p-3 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_45%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] space-y-2"
            >
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Activity size={12} className="text-[var(--ui-focus)]" />
                  <span>Story Presence</span>
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                  Active in <strong className="text-[var(--text-primary)]">{char.chapters.length}</strong> of {maxChapter} {maxChapter === 1 ? 'chapter' : 'chapters'}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                {Array.from({ length: maxChapter }, (_, i) => i).map((chapIdx) => {
                  const isPresent = char.chapters.includes(chapIdx);
                  return (
                    <ReaderTooltip
                      key={chapIdx}
                      content={
                        isPresent
                          ? `Chapter ${chapIdx + 1}: ${char.name} appears (Click to jump)`
                          : `Chapter ${chapIdx + 1}: Not present`
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isPresent) {
                            onNavigateToChapter(chapIdx, char.name);
                          }
                        }}
                        className={`h-5 min-w-[20px] px-1 rounded-md text-[9.5px] font-mono font-bold flex items-center justify-center transition-all ${
                          isPresent
                            ? 'bg-[var(--ui-focus)] text-white hover:scale-110 active:scale-95 cursor-pointer shadow-2xs'
                            : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-tertiary)] opacity-35 cursor-default'
                        }`}
                      >
                        {chapIdx + 1}
                      </button>
                    </ReaderTooltip>
                  );
                })}
              </div>
            </motion.div>

            {/* Debut / Introduction Quote Snippet */}
            {char.firstMention?.sentenceSnippet && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="relative p-3 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_50%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] text-[12px] leading-relaxed overflow-hidden"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-2">
                  <span className="text-[var(--ui-focus)] font-semibold flex items-center gap-1.5">
                    <Bookmark size={11} className="fill-[var(--ui-focus)]/20" />
                    <span>Debut • Chapter {char.firstMention.chapterIndex + 1}</span>
                  </span>
                  <ReaderTooltip content={`Jump to debut in Chapter ${char.firstMention.chapterIndex + 1}`}>
                    <button
                      type="button"
                      onClick={() => onNavigateToChapter(char.firstMention.chapterIndex, getDistinctiveQuoteTerm(char.firstMention.sentenceSnippet, char.name), char.firstMention.sentenceSnippet)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] hover:bg-[var(--ui-focus)] hover:text-white transition-all cursor-pointer shadow-2xs"
                    >
                      <BookOpen size={10} />
                      <span>Jump</span>
                    </button>
                  </ReaderTooltip>
                </div>
                <div className="relative pl-3 border-l-2 border-[var(--ui-focus)]/50">
                  <p className="font-serif italic text-[12px] text-[var(--text-secondary)] m-0 line-clamp-3 select-text">
                    “{sanitizeQuote(char.firstMention.sentenceSnippet)}”
                  </p>
                </div>
              </motion.div>
            )}

            {/* Relationships Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <Users size={12} className="text-[var(--ui-focus)]" />
                  <span>Relationships</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)] text-[var(--ui-focus)] text-[10px] font-bold">
                    {characterConnections.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--text-tertiary)]">Sort:</span>
                  <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-[9.5px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setSidebarSort('scenes')}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        sidebarSort === 'scenes'
                          ? 'bg-[var(--ui-focus)] text-white shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Scenes ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarSort('alphabetical')}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        sidebarSort === 'alphabetical'
                          ? 'bg-[var(--ui-focus)] text-white shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      A–Z
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarSort('chapters')}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        sidebarSort === 'chapters'
                          ? 'bg-[var(--ui-focus)] text-white shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Chs ↓
                    </button>
                  </div>
                </div>
              </div>

              {characterConnections.length >= 6 && (
                <div className="relative pb-1">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Filter connections..."
                    className="w-full pl-7 pr-6 py-1 rounded-xl text-[11px] bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] transition-all"
                  />
                  {sidebarSearch && (
                    <button
                      type="button"
                      onClick={() => setSidebarSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              )}

              {sortedConnections.length === 0 ? (
                <div className="p-4 text-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-[11.5px] leading-relaxed">
                  {characterConnections.length === 0
                    ? `No shared scenes with other characters up to Chapter ${maxChapter}.`
                    : `No connections matching "${sidebarSearch}".`}
                </div>
              ) : (
                <motion.div
                  variants={staggerContainerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-2"
                >
                  {sortedConnections.map((conn) => {
                    const otherPortrait = portraitMap[conn.otherNode.name] || getCachedCharacterPortrait(conn.otherNode.name, bookTitle);
                    const isCurrentActive = expandedConnName === conn.otherNode.id;

                    return (
                      <motion.div
                        key={conn.otherNode.id}
                        variants={staggerItemVariants}
                        whileHover={{ scale: 1.01, y: -1 }}
                        whileTap={{ scale: 0.99 }}
                        className={`rounded-2xl border transition-all duration-200 ${
                          isCurrentActive
                            ? 'border-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-elevated))] ring-1 ring-[var(--ui-focus)]/25 shadow-2xs'
                            : 'border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_45%,var(--bg-elevated))] hover:border-[var(--ui-focus)]/50 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,var(--bg-elevated))]'
                        } overflow-hidden`}
                      >
                        <div className="p-2.5 flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <ReaderTooltip content={conn.otherCharacter ? `View ${conn.otherNode.name}'s dossier` : conn.otherNode.name}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (conn.otherCharacter) {
                                    onOpenCharacterDetail(conn.otherCharacter, otherPortrait || { imageUrl: null });
                                  }
                                }}
                                className={`shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform ${!conn.otherCharacter ? 'pointer-events-none' : ''}`}
                                aria-label={`View ${conn.otherNode.name}'s dossier`}
                              >
                                {otherPortrait?.imageUrl ? (
                                  <img
                                    src={otherPortrait.imageUrl}
                                    alt={conn.otherNode.name}
                                    className="w-8 h-8 rounded-xl object-cover shrink-0 ring-1 ring-[var(--ui-border)] shadow-2xs"
                                  />
                                ) : (
                                  <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-2xs"
                                    style={{ background: conn.otherNode.avatarColor }}
                                  >
                                    {conn.otherNode.name.slice(0, 1)}
                                  </div>
                                )}
                              </button>
                            </ReaderTooltip>
                            <div
                              className="min-w-0 flex-1 cursor-pointer"
                              onClick={() => {
                                if (conn.link.sampleQuotes.length > 0) {
                                  handleToggleScenes(conn.otherNode.id);
                                }
                              }}
                            >
                              <div className="text-xs font-bold text-[var(--text-primary)] truncate hover:text-[var(--ui-focus)] transition-colors">
                                {conn.otherNode.name}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] mt-0.5">
                                {(() => {
                                  const rel = getSemanticRelationship(conn.link.sampleQuotes);
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold text-[9.5px]"
                                      style={{
                                        backgroundColor: `color-mix(in srgb, ${rel.color} 12%, var(--bg-secondary))`,
                                        color: rel.color,
                                        border: `1px solid color-mix(in srgb, ${rel.color} 25%, transparent)`,
                                      }}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rel.color }} />
                                      {rel.label}
                                    </span>
                                  );
                                })()}
                                <span>•</span>
                                <span className="font-semibold text-[var(--text-secondary)]">
                                  {conn.sharedScenes} {conn.sharedScenes === 1 ? 'scene' : 'scenes'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {conn.link.sampleQuotes.length > 0 && (
                              <ReaderTooltip content={isCurrentActive ? 'Close scenes' : 'View shared dialogue & scenes'}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleScenes(conn.otherNode.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                    isCurrentActive
                                      ? 'bg-[var(--ui-focus)] text-white shadow-2xs'
                                      : 'bg-[var(--bg-secondary)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_15%,var(--bg-secondary))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]'
                                  }`}
                                >
                                  <MessageSquare size={11} />
                                  <span>Scenes</span>
                                  {isCurrentActive ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>
                              </ReaderTooltip>
                            )}

                            <ReaderTooltip content={pathfinderTargetId === conn.otherNode.id ? 'Clear path' : `Trace connection path to ${conn.otherNode.name}`}>
                              <button
                                type="button"
                                onClick={() => setPathfinderTargetId((prev) => (prev === conn.otherNode.id ? null : conn.otherNode.id))}
                                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                  pathfinderTargetId === conn.otherNode.id
                                    ? 'bg-[#eab308] text-white shadow-2xs font-bold'
                                    : 'text-[var(--text-tertiary)] hover:text-[#eab308] hover:bg-[color-mix(in_srgb,#eab308_15%,transparent)]'
                                }`}
                                aria-label={`Trace connection path to ${conn.otherNode.name}`}
                              >
                                <Route size={12} />
                              </button>
                            </ReaderTooltip>

                            <ReaderTooltip content={`Focus graph on ${conn.otherNode.name}`}>
                              <button
                                type="button"
                                onClick={() => handleSelectNode(conn.otherNode.id)}
                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] transition-colors cursor-pointer"
                              >
                                <ArrowRight size={13} />
                              </button>
                            </ReaderTooltip>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
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
              className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[color-mix(in_srgb,var(--bg-secondary)_20%,var(--bg-elevated))]"
            >
              {/* Header for Expanded Scenes */}
              <div className="p-3.5 px-4 border-b border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_85%,var(--bg-secondary))] flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-2 shrink-0">
                    <ReaderTooltip content={`View ${char.name}'s dossier`}>
                      <button
                        type="button"
                        onClick={() => onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null })}
                        className="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                      >
                        {selectedPortrait?.imageUrl ? (
                          <img
                            src={selectedPortrait.imageUrl}
                            alt={char.name}
                            className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--bg-elevated)] shadow-2xs"
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white ring-2 ring-[var(--bg-elevated)] shadow-2xs"
                            style={{ background: char.avatarColor }}
                          >
                            {char.name.slice(0, 1)}
                          </div>
                        )}
                      </button>
                    </ReaderTooltip>
                    <ReaderTooltip content={expandedConn.otherCharacter ? `View ${expandedConn.otherNode.name}'s dossier` : expandedConn.otherNode.name}>
                      <button
                        type="button"
                        onClick={() => {
                          if (expandedConn.otherCharacter) {
                            onOpenCharacterDetail(expandedConn.otherCharacter, expandedPortrait || { imageUrl: null });
                          }
                        }}
                        className={`cursor-pointer hover:scale-105 active:scale-95 transition-transform ${!expandedConn.otherCharacter ? 'pointer-events-none' : ''}`}
                      >
                        {expandedPortrait?.imageUrl ? (
                          <img
                            src={expandedPortrait.imageUrl}
                            alt={expandedConn.otherNode.name}
                            className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--bg-elevated)] shadow-2xs"
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white ring-2 ring-[var(--bg-elevated)] shadow-2xs"
                            style={{ background: expandedConn.otherNode.avatarColor }}
                          >
                            {expandedConn.otherNode.name.slice(0, 1)}
                          </div>
                        )}
                      </button>
                    </ReaderTooltip>
                  </div>

                  <div className="min-w-0">
                    <h5 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate my-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenCharacterDetail(char, selectedPortrait || { imageUrl: null })}
                        className="hover:underline cursor-pointer truncate"
                      >
                        {char.name}
                      </button>
                      <span className="text-[var(--text-tertiary)] font-normal text-xs shrink-0">⟷</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (expandedConn.otherCharacter) {
                            onOpenCharacterDetail(expandedConn.otherCharacter, expandedPortrait || { imageUrl: null });
                          }
                        }}
                        className={`hover:underline cursor-pointer truncate text-[var(--ui-focus)] ${!expandedConn.otherCharacter ? 'pointer-events-none' : ''}`}
                      >
                        {expandedConn.otherNode.name}
                      </button>
                    </h5>
                    <p className="text-[10.5px] text-[var(--text-tertiary)] my-0.5 flex items-center gap-1">
                      <MessageSquare size={11} className="text-[var(--ui-focus)] opacity-80" />
                      <span>
                        {expandedConn.sharedScenes} shared {expandedConn.sharedScenes === 1 ? 'scene' : 'scenes'} across {expandedConn.chapters.length} {expandedConn.chapters.length === 1 ? 'chapter' : 'chapters'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <ReaderTooltip content={`Focus graph camera on ${expandedConn.otherNode.name}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectNode(expandedConn.otherNode.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] hover:border-[var(--ui-focus)] hover:text-[var(--ui-focus)] text-[var(--text-secondary)] transition-all cursor-pointer shadow-2xs"
                    >
                      <span>Focus {getCleanDisplayName(expandedConn.otherNode.name)}</span>
                      <ArrowRight size={12} />
                    </button>
                  </ReaderTooltip>
                  <ReaderTooltip content="Collapse scenes view">
                    <button
                      type="button"
                      onClick={() => handleCloseScenes()}
                      className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </ReaderTooltip>
                </div>
              </div>

              {/* Scrollable Quotes List with Generous Space */}
              <motion.div
                variants={staggerContainerVariants}
                initial="hidden"
                animate="visible"
                className="flex-1 overflow-y-auto p-4 space-y-3 text-xs pr-3.5 custom-scrollbar"
              >
                {expandedConn.link.sampleQuotes.map((sq, idx) => {
                  const cleanQuote = sanitizeQuote(sq.quote);
                  return (
                    <motion.div
                      key={idx}
                      variants={sceneCardVariants}
                      whileHover={{ y: -2, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="relative p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shadow-2xs hover:border-[var(--ui-focus)]/45 hover:shadow-xs transition-all duration-200 group flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10.5px] font-sans font-semibold">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--ui-focus)_10%,transparent)] border border-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] text-[var(--ui-focus)] font-bold text-[10.5px]">
                          <BookOpen size={11} className="opacity-80" />
                          <span>Chapter {sq.chapterIndex + 1}</span>
                        </span>

                        <ReaderTooltip content={`Jump to Chapter ${sq.chapterIndex + 1} in reader`}>
                          <button
                            type="button"
                            onClick={() => onNavigateToChapter(sq.chapterIndex, getDistinctiveQuoteTerm(sq.quote, char.name), sq.quote)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-semibold text-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-secondary))] hover:bg-[var(--ui-focus)] hover:text-white border border-[color-mix(in_srgb,var(--ui-focus)_18%,transparent)] transition-all cursor-pointer shadow-2xs group/btn"
                          >
                            <span>Jump to scene</span>
                            <ArrowRight size={10} className="opacity-60 group-hover/btn:translate-x-0.5 transition-transform" />
                          </button>
                        </ReaderTooltip>
                      </div>

                      <div className="relative pl-3 border-l-2 border-[var(--ui-focus)]/70">
                        <p className="font-serif italic text-[12.5px] sm:text-[13px] leading-relaxed text-[var(--text-primary)] m-0 select-text">
                          “{cleanQuote}”
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
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
        isFullscreen ? 'h-full bg-[var(--bg-primary)]' : 'h-[560px] rounded-2xl bg-[var(--bg-primary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)]'
      }`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* ─── Premium Elegant Top Control Bar ─── */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_95%,var(--bg-secondary))] z-20 shrink-0 min-h-[50px] shadow-2xs">
        {/* Left: Back button & Title Context */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isFullscreen && onToggleFullscreen && (
            <ReaderTooltip content="Exit Relationship Web (Esc)">
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--ui-hover)] text-xs font-semibold text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                <ArrowLeft size={13} className="text-[var(--text-secondary)]" />
                <span className="hidden sm:inline">Back</span>
              </button>
            </ReaderTooltip>
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight whitespace-nowrap">
                Character Constellation
              </span>
              <span className="hidden xl:inline text-[10.5px] text-[var(--text-tertiary)] font-mono">
                · {visibleNodes.length} cast · {visibleLinks.length} ties
              </span>
            </div>
            {bookTitle && (
              <span
                className="text-[10.5px] text-[var(--text-tertiary)] truncate max-w-[130px] sm:max-w-[180px] md:max-w-[240px]"
                title={bookTitle}
              >
                {bookTitle}
              </span>
            )}
          </div>
        </div>

        {/* Center: Story Progress & Spoiler Guard Control Pod */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl bg-[var(--bg-secondary)]/90 border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] shadow-2xs shrink-0 max-w-full">
          <ReaderTooltip
            content={
              isPlayingRecap
                ? 'Pause story recap'
                : 'Play Storyline Horizon (Animates character network chapter-by-chapter)'
            }
          >
            <button
              type="button"
              onClick={() => {
                if (!isPlayingRecap && maxChapter >= (totalChapters || 1)) {
                  setMaxChapter(1);
                }
                setIsPlayingRecap(!isPlayingRecap);
              }}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                isPlayingRecap
                  ? 'bg-[var(--ui-focus)] text-white animate-pulse shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
              aria-label={isPlayingRecap ? 'Pause recap' : 'Play recap'}
            >
              {isPlayingRecap ? <Pause size={11} strokeWidth={2.5} /> : <Play size={11} strokeWidth={2.5} />}
            </button>
          </ReaderTooltip>

          <ReaderTooltip
            content={
              maxChapter > currentChapterIndex + 1
                ? 'Spoiler Warning: Showing beyond current reading progress'
                : 'Spoiler Guard Active: Future chapter interactions are hidden'
            }
          >
            <div
              className={`px-2 py-0.5 rounded-md flex items-center gap-1.5 text-[11px] font-bold shrink-0 cursor-default transition-colors ${
                maxChapter > currentChapterIndex + 1
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25'
                  : 'bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)]'
              }`}
            >
              {maxChapter > currentChapterIndex + 1 ? (
                <Unlock size={11} strokeWidth={2.4} />
              ) : (
                <ShieldCheck size={11} strokeWidth={2.4} />
              )}
              <span>Ch. {maxChapter}</span>
            </div>
          </ReaderTooltip>

          <input
            type="range"
            min={1}
            max={Math.max(1, totalChapters)}
            value={maxChapter}
            onChange={(e) => setMaxChapter(Number(e.target.value))}
            className="w-16 sm:w-24 md:w-32 lg:w-40 min-w-[50px] h-1.5 rounded-full accent-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] cursor-pointer shrink transition-all"
            style={{
              background: `linear-gradient(to right, var(--ui-focus) 0%, var(--ui-focus) ${
                totalChapters > 1 ? ((maxChapter - 1) / (totalChapters - 1)) * 100 : 100
              }%, color-mix(in srgb, var(--ui-border) 80%, transparent) ${
                totalChapters > 1 ? ((maxChapter - 1) / (totalChapters - 1)) * 100 : 100
              }%, color-mix(in srgb, var(--ui-border) 80%, transparent) 100%)`,
            }}
          />

          <span className="text-[11px] text-[var(--text-tertiary)] font-mono font-medium shrink-0">
            /{totalChapters}
          </span>

          {maxChapter < (totalChapters || 1) ? (
            <ReaderTooltip content="Show all interactions across the entire book">
              <button
                type="button"
                onClick={() => setMaxChapter(totalChapters || 1)}
                className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--ui-focus)] hover:text-white border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-[var(--text-secondary)] transition-all cursor-pointer shrink-0 whitespace-nowrap active:scale-95 shadow-2xs inline-flex items-center gap-1"
                title="View all chapters in this book"
              >
                <Eye size={11} strokeWidth={2.2} />
                <span className="hidden sm:inline">Show All</span>
              </button>
            </ReaderTooltip>
          ) : currentChapterIndex > 0 ? (
            <ReaderTooltip content={`Reset to current reading chapter (${currentChapterIndex + 1}) to prevent spoilers`}>
              <button
                type="button"
                onClick={() => setMaxChapter(currentChapterIndex + 1)}
                className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--ui-focus)] hover:text-white border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-[var(--text-secondary)] transition-all cursor-pointer shrink-0 whitespace-nowrap active:scale-95 shadow-2xs inline-flex items-center gap-1"
                title="Clamp to current reading chapter"
              >
                <RotateCcw size={10} strokeWidth={2.2} />
                <span className="hidden sm:inline">Sync Ch.{currentChapterIndex + 1}</span>
              </button>
            </ReaderTooltip>
          ) : null}
        </div>

        {/* Right: Search, Unified Filters & Tools */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Find character..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-24 sm:w-32 md:w-36 lg:w-40 pl-7 pr-6 py-1 rounded-lg text-xs bg-[var(--bg-secondary)]/90 focus:bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] shadow-2xs transition-all"
            />
            {searchQuery && (
              <ReaderTooltip content="Clear search">
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
                >
                  <X size={11} />
                </button>
              </ReaderTooltip>
            )}
          </div>

          {/* Entity Filter Segmented Control (Cleverly omits redundant Individuals button when count equals All) */}
          <div className="hidden md:flex items-center p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] text-[11px] shadow-2xs">
            <button
              type="button"
              onClick={() => setEntityFilter('all')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                entityFilter === 'all'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
              }`}
            >
              All ({entityCounts.all})
            </button>
            {entityCounts.individuals < entityCounts.all && (
              <button
                type="button"
                onClick={() => setEntityFilter('individuals')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  entityFilter === 'individuals'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                }`}
              >
                Individuals ({entityCounts.individuals})
              </button>
            )}
            <button
              type="button"
              onClick={() => setEntityFilter('major')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                entityFilter === 'major'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
              }`}
            >
              Key Figures ({entityCounts.major})
            </button>
          </div>

          {/* Connection Tie Filter: One-click toggle between All Ties and Key Ties (2+) */}
          <ReaderTooltip
            content={
              minWeight >= 2
                ? 'Showing key ties (2+ shared scenes). Click to show all ties.'
                : 'Showing all ties. Click to filter only key ties (2+ shared scenes) to reduce clutter.'
            }
          >
            <button
              type="button"
              onClick={() => setMinWeight((prev) => (prev >= 2 ? 1 : 2))}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer shadow-2xs active:scale-95 ${
                minWeight >= 2
                  ? 'bg-[var(--ui-focus)] text-white font-bold'
                  : 'bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
              }`}
            >
              <Network size={12} strokeWidth={minWeight >= 2 ? 2.5 : 2} />
              <span>{minWeight >= 2 ? 'Key Ties (2+)' : 'All Ties'}</span>
            </button>
          </ReaderTooltip>

          {/* View Tools Dock */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_55%,transparent)] shadow-2xs">
            <ReaderTooltip content={isExporting ? 'Generating poster...' : 'Export constellation (PNG)'}>
              <button
                type="button"
                onClick={handleExportPoster}
                disabled={isExporting}
                className={`p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--ui-focus)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer ${
                  isExporting ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                aria-label="Export poster"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin text-[var(--ui-focus)]" /> : <Download size={13} />}
              </button>
            </ReaderTooltip>

            <ReaderTooltip content="Fit Constellation">
              <button
                type="button"
                onClick={() => handleFitView(true)}
                className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--ui-focus)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                aria-label="Fit constellation"
              >
                <Focus size={13} />
              </button>
            </ReaderTooltip>

            {onToggleFullscreen && (
              <ReaderTooltip content={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Graph'}>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="p-1.5 rounded-md text-[var(--ui-focus)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                  aria-label="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
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
          className="flex-1 h-full relative cursor-grab active:cursor-grabbing overflow-hidden min-w-0 bg-[var(--bg-primary)]"
          style={{ backgroundColor: 'var(--bg-primary)' }}
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
          {/* ─── Pathfinder Shortest Connection Banner ─── */}
          {shortestPath && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--bg-elevated)]/95 backdrop-blur-md border border-[var(--ui-focus)] text-xs font-semibold shadow-lg select-none">
              <Route size={14} className="text-[#eab308] shrink-0" />
              <span className="text-[var(--text-secondary)]">Pathfinder:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {shortestPath.pathNodes.join(' ➔ ')}
              </span>
              <span className="text-[var(--text-tertiary)] text-[11px] font-mono">
                ({shortestPath.pathNodes.length - 1} {shortestPath.pathNodes.length - 1 === 1 ? 'step' : 'steps'})
              </span>
              <button
                type="button"
                onClick={() => setPathfinderTargetId(null)}
                className="p-1 rounded-full hover:bg-[var(--ui-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer ml-1"
                title="Clear path"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <svg
            ref={svgRef}
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

              {/* 3D Node Elevation Drop Shadow (Disabled dynamically during pan/drag for 60fps) */}
              <filter id="graph-node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation={isInteracting ? "0" : "5"} floodOpacity={isInteracting ? "0" : "0.25"} />
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

              {/* Node Avatar Linear Gradients for Rich Theme-Adaptive SVG Circles */}
              {visibleNodes.map((node) => {
                const safeId = `avatar-grad-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const hexMatches = node.avatarColor?.match(/#(?:[0-9a-fA-F]{3,8})/g);
                const col1 = hexMatches?.[0] || '#8B6914';
                const col2 = hexMatches?.[1] || '#6E5310';

                return (
                  <linearGradient key={safeId} id={safeId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={col1} />
                    <stop offset="100%" stopColor={col2} />
                  </linearGradient>
                );
              })}
            </defs>

            {/* Solid Opaque Background: Guarantees zero bleed-through from underlying reader or home desktop views */}
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} fill="var(--bg-primary)" />
            {/* Backdrop: Ambient Spotlight & Constellation Grid */}
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} fill="url(#graph-ambient-glow)" pointerEvents="none" />
            <rect x={viewBoxX} y={viewBoxY} width={viewBoxW} height={viewBoxH} fill="url(#graph-constellation-grid)" pointerEvents="none" />

            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
              {/* ─── Edges: Subtle Hairlines by Default, Illuminated on Focus / Hover / Scene Link ─── */}
              {visibleLinks.map((link, idx) => {
                const srcPos = getNodePos(link.source.id, link.source.x, link.source.y);
                const tgtPos = getNodePos(link.target.id, link.target.x, link.target.y);

                const isConnectedToFocus =
                  activeFocusId && (link.source.id === activeFocusId || link.target.id === activeFocusId);
                const isConnectedToHover =
                  hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId);
                const isThisEdgeSelected = selectedEdge === link;
                const isExpandedSceneLink =
                  Boolean(expandedConnName) &&
                  selectedNodeId &&
                  ((link.source.id === selectedNodeId && link.target.id === expandedConnName) ||
                    (link.target.id === selectedNodeId && link.source.id === expandedConnName));
                const isPathEdge = Boolean(
                  shortestPath &&
                  (shortestPath.pathEdges.has(`${link.source.id}:::${link.target.id}`) ||
                   shortestPath.pathEdges.has(`${link.target.id}:::${link.source.id}`))
                );

                const rel = getSemanticRelationship(link.sampleQuotes);
                const isBondFilterMatch = activeBondFilter ? rel.type === activeBondFilter : false;
                const isLinkActive =
                  isConnectedToFocus ||
                  isConnectedToHover ||
                  isThisEdgeSelected ||
                  isExpandedSceneLink ||
                  isPathEdge ||
                  isBondFilterMatch;

                // Subtle, elegant stroke dimensions matching Shiori parchment standards
                const strokeWidth = isPathEdge
                  ? 2.5
                  : isExpandedSceneLink
                  ? 2.4
                  : isBondFilterMatch
                  ? 2.2
                  : isLinkActive
                  ? 1.6
                  : 0.8;

                const strokeOpacity = isPathEdge || isExpandedSceneLink
                  ? 0.95
                  : activeBondFilter
                  ? isBondFilterMatch
                    ? 0.92
                    : 0.03
                  : isLinkActive
                  ? 0.85
                  : shortestPath
                  ? 0.02
                  : activeFocusId || hoveredNodeId
                  ? 0.025
                  : 0.16;

                // Semantic bond coloring (Love & Affection, Rivals, Allies, Fealty) for active ties, quiet border for idle hairlines
                const strokeColor = isPathEdge
                  ? '#eab308'
                  : isLinkActive
                  ? rel.color
                  : 'var(--ui-border)';

                return (
                  <g key={`${link.source.id}-${link.target.id}-${idx}`} className="pointer-events-auto">
                    {/* Invisible thicker stroke for effortless clicking/tapping */}
                    <line
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={tgtPos.x}
                      y2={tgtPos.y}
                      stroke="transparent"
                      strokeWidth={24}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEdge(link);
                      }}
                      onMouseEnter={() => {
                        const midX = (srcPos.x + tgtPos.x) / 2;
                        const midY = (srcPos.y + tgtPos.y) / 2;
                        setHoveredEdge({ link, x: midX, y: midY });
                      }}
                      onMouseLeave={() => {
                        setHoveredEdge(null);
                      }}
                    />

                    {/* Subtle warm accent underlay ONLY for expanded active scene link or path edge */}
                    {(isExpandedSceneLink || isPathEdge) && !isInteracting && (
                      <line
                        x1={srcPos.x}
                        y1={srcPos.y}
                        x2={tgtPos.x}
                        y2={tgtPos.y}
                        stroke={isPathEdge ? '#eab308' : rel.color}
                        strokeWidth={strokeWidth + 2}
                        strokeOpacity={0.25}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Connection line: subtle hairline by default, elegant semantic color when selected */}
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

                    {/* Flowing animated dash ONLY on focused inspection pair or path */}
                    {(isPathEdge || isExpandedSceneLink) && (
                      <line
                        x1={srcPos.x}
                        y1={srcPos.y}
                        x2={tgtPos.x}
                        y2={tgtPos.y}
                        stroke={isPathEdge ? '#eab308' : rel.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={isPathEdge ? '8 4' : '6 4'}
                        strokeLinecap="round"
                        className="graph-flow-edge"
                      />
                    )}
                  </g>
                );
              })}

              {/* Floating Edge Info Badge on Hover */}
              {hoveredEdge && (
                <g
                  transform={`translate(${hoveredEdge.x}, ${hoveredEdge.y})`}
                  className="pointer-events-none select-none z-30"
                >
                  <rect
                    x={-85}
                    y={-14}
                    width={170}
                    height={28}
                    rx={14}
                    fill="var(--bg-elevated)"
                    stroke="var(--ui-focus)"
                    strokeWidth={1.2}
                    filter="drop-shadow(0 2px 8px rgba(0,0,0,0.12))"
                  />
                  {(() => {
                    const rel = getSemanticRelationship(hoveredEdge.link.sampleQuotes);
                    const count = hoveredEdge.link.sampleQuotes.length || hoveredEdge.link.weight;
                    return (
                      <g>
                        <circle cx={-68} cy={0} r={4.5} fill={rel.color} />
                        <text
                          textAnchor="start"
                          x={-56}
                          y={4}
                          fontSize={10.5}
                          fontWeight="bold"
                          fill="var(--text-primary)"
                          fontFamily="sans-serif"
                        >
                          {rel.label} · {count} {count === 1 ? 'scene' : 'scenes'}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* ─── Nodes: Clean Character Portraits (Concentric ring ONLY on selection, NO hover circles) ─── */}
              {visibleNodes.map((node) => {
                const pos = getNodePos(node.id, node.x, node.y);
                const isMatch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
                const isSelected = selectedNodeId === node.id;
                const isScenePartner = expandedConnName === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isConnectedNeighbor = highlightedNodeIds
                  ? highlightedNodeIds.has(node.id)
                  : hoveredNeighborIds
                  ? hoveredNeighborIds.has(node.id)
                  : false;
                const isPathNode = Boolean(pathNodeSet?.has(node.id));
                const isNodeInBondFilter = activeBondFilter
                  ? visibleLinks.some(
                      (l) =>
                        (l.source.id === node.id || l.target.id === node.id) &&
                        getSemanticRelationship(l.sampleQuotes).type === activeBondFilter
                    )
                  : true;
                const isDimmed =
                  shortestPath
                    ? !isPathNode
                    : activeBondFilter
                    ? !isNodeInBondFilter
                    : (highlightedNodeIds && !highlightedNodeIds.has(node.id)) ||
                      (hoveredNeighborIds && !hoveredNeighborIds.has(node.id)) ||
                      !isMatch;
                const portrait = portraitMap[node.name] || getCachedCharacterPortrait(node.name, bookTitle);
                const safeId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const gradId = `avatar-grad-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const hasImg = Boolean(portrait?.imageUrl);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="pointer-events-auto cursor-pointer"
                    opacity={isDimmed ? 0.12 : 1}
                    onPointerEnter={() => {
                      setHoveredNodeId(node.id);
                      if (!isInteracting) {
                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = setTimeout(() => {
                          setHoverCodex({ node, x: pos.x, y: pos.y });
                        }, 220);
                      }
                    }}
                    onPointerLeave={() => {
                      setHoveredNodeId(null);
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      setHoverCodex(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      setHoverCodex(null);
                      handleSelectNode(node.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const char = networkData.characters.find((c) => c.name === node.id);
                      if (char) {
                        onOpenCharacterDetail(char, portrait || { imageUrl: null });
                      }
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      setHoverCodex(null);
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

                    {/* Pathfinder Route Node Highlight */}
                    {isPathNode && !isSelected && (
                      <>
                        <circle
                          r={node.radius + 10}
                          fill="rgba(234, 179, 8, 0.18)"
                        />
                        <circle
                          r={node.radius + 5}
                          fill="none"
                          stroke="#eab308"
                          strokeWidth={2.5}
                          strokeDasharray="4 2"
                          className="graph-flow-edge"
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
                    {isConnectedNeighbor && !isSelected && !isScenePartner && !isPathNode && (
                      <circle
                        r={node.radius + 4}
                        fill="none"
                        stroke="var(--ui-focus)"
                        strokeWidth={1.6}
                        strokeOpacity={0.65}
                      />
                    )}

                    {/* 3D Elevated Node Body (Filter disabled during drag/pan for 60fps) */}
                    <g filter={isInteracting ? undefined : "url(#graph-node-shadow)"}>
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
                            stroke={isPathNode ? '#eab308' : isSelected || isScenePartner ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                            strokeWidth={isPathNode ? 3.5 : isSelected ? 3.5 : isScenePartner ? 3 : 2.5}
                            className="transition-colors duration-200"
                          />
                        </>
                      ) : (
                        <>
                          <circle
                            r={node.radius}
                            fill={`url(#${gradId})`}
                            stroke={isPathNode ? '#eab308' : isSelected || isScenePartner || isHovered ? 'var(--ui-focus)' : 'var(--bg-elevated)'}
                            strokeWidth={isPathNode ? 3.5 : isSelected ? 3.5 : isScenePartner || isHovered ? 3 : 2.5}
                            className="transition-colors duration-200"
                          />
                          <text
                            textAnchor="middle"
                            dy="4.5"
                            fontSize={Math.max(10, node.radius * 0.44)}
                            fontWeight="800"
                            fill="#ffffff"
                            fontFamily="serif"
                            className="select-none pointer-events-none drop-shadow-sm"
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
                          x={-(Math.max(48, node.name.length * 4.6 + 14))}
                          y={-11}
                          width={Math.max(96, node.name.length * 9.2 + 28)}
                          height={22}
                          rx={11}
                          fill="var(--bg-elevated)"
                          stroke="var(--ui-focus)"
                          strokeWidth={1.6}
                          filter="url(#graph-node-shadow)"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.8"
                          fontSize={12}
                          fontWeight="800"
                          fill="var(--ui-focus)"
                          style={{
                            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            letterSpacing: '0.02em',
                          }}
                          className="select-none pointer-events-none"
                        >
                          {node.name}
                        </text>
                      </g>
                    ) : isScenePartner ? (
                      <g transform={`translate(0, ${node.radius + 17})`}>
                        <rect
                          x={-(Math.max(44, node.name.length * 4.3 + 12))}
                          y={-10}
                          width={Math.max(88, node.name.length * 8.6 + 24)}
                          height={20}
                          rx={10}
                          fill="var(--bg-elevated)"
                          stroke="var(--ui-focus)"
                          strokeWidth={1.4}
                          strokeDasharray="3 2"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fontSize={11.5}
                          fontWeight="700"
                          fill="var(--ui-focus)"
                          style={{
                            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            letterSpacing: '0.02em',
                          }}
                          className="select-none pointer-events-none"
                        >
                          {node.name}
                        </text>
                      </g>
                    ) : (
                      <g transform={`translate(0, ${node.radius + 15})`}>
                        {/* Background pill badge for clean legibility against crossing lines */}
                        <rect
                          x={-(Math.max(32, node.name.length * 3.6 + 8))}
                          y={-8.5}
                          width={Math.max(64, node.name.length * 7.2 + 16)}
                          height={17}
                          rx={8.5}
                          fill="var(--bg-elevated)"
                          fillOpacity={0.92}
                          stroke={isHovered || isConnectedNeighbor ? 'var(--ui-focus)' : 'color-mix(in srgb, var(--ui-border) 60%, transparent)'}
                          strokeWidth={isHovered ? 1.2 : 0.8}
                          className="pointer-events-none select-none shadow-2xs"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.2"
                          fontSize={10.5}
                          fontWeight={isConnectedNeighbor || isHovered ? '700' : '600'}
                          fill={isConnectedNeighbor || isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                          style={{
                            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            letterSpacing: '0.015em',
                          }}
                          className="select-none pointer-events-none"
                        >
                          {node.name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Mini Hover Codex Tooltip Card */}
              {hoverCodex && !selectedNodeId && !selectedEdge && !isInteracting && (
                <g
                  transform={`translate(${hoverCodex.x}, ${hoverCodex.y - hoverCodex.node.radius - 82})`}
                  className="pointer-events-none select-none z-40 transition-all duration-150"
                >
                  <rect
                    x={-105}
                    y={-12}
                    width={210}
                    height={78}
                    rx={14}
                    fill="var(--bg-elevated)"
                    stroke="color-mix(in srgb, var(--ui-border) 80%, transparent)"
                    strokeWidth={1}
                    filter={isInteracting ? undefined : "url(#graph-node-shadow)"}
                  />
                  <polygon
                    points="-6,66 6,66 0,73"
                    fill="var(--bg-elevated)"
                    stroke="color-mix(in srgb, var(--ui-border) 80%, transparent)"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={12}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight="bold"
                    fill="var(--text-primary)"
                    fontFamily="sans-serif"
                  >
                    {hoverCodex.node.name}
                  </text>
                  <text
                    x={0}
                    y={31}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="var(--text-tertiary)"
                    fontFamily="sans-serif"
                  >
                    First seen Ch. {hoverCodex.node.firstChapter + 1} • {hoverCodex.node.totalMentions} mentions
                  </text>
                  <text
                    x={0}
                    y={50}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--ui-focus)"
                    fontWeight="600"
                    fontFamily="sans-serif"
                  >
                    Click to view dossier & scenes
                  </text>
                </g>
              )}
            </g>
          </svg>

          {/* ─── Interactive Bond Legend & Metrics Dock ─── */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 sm:gap-2 bg-[var(--bg-elevated)]/95 backdrop-blur-md p-1 sm:px-3 sm:py-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-md select-none text-[10.5px] z-20 max-w-[calc(100vw-120px)] overflow-x-auto scrollbar-none">
            {/* Cast & Ties Counter */}
            <span className="hidden sm:flex items-center gap-1.5 font-medium text-[var(--text-secondary)] shrink-0">
              <Users size={12} className="text-[var(--ui-focus)]" />
              <span>{visibleNodes.length} cast</span>
              <span className="text-[var(--ui-divider)]">•</span>
              <span>{visibleLinks.length} ties</span>
            </span>
            <span className="hidden sm:inline text-[var(--ui-divider)] shrink-0">|</span>

            {/* Interactive Bond Filter Chips */}
            <div className="flex items-center gap-1 shrink-0">
              <ReaderTooltip content={activeBondFilter === 'bond' ? 'Show all bonds' : 'Filter Love & Affection ties'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBondFilter(activeBondFilter === 'bond' ? null : 'bond');
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                    activeBondFilter === 'bond'
                      ? 'bg-[#d94677] text-white shadow-xs font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d94677]" />
                  <span>Love</span>
                </button>
              </ReaderTooltip>

              <ReaderTooltip content={activeBondFilter === 'conflict' ? 'Show all bonds' : 'Filter Rivals & Conflict ties'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBondFilter(activeBondFilter === 'conflict' ? null : 'conflict');
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                    activeBondFilter === 'conflict'
                      ? 'bg-[#c2410c] text-white shadow-xs font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c2410c]" />
                  <span>Rivals</span>
                </button>
              </ReaderTooltip>

              <ReaderTooltip content={activeBondFilter === 'ally' ? 'Show all bonds' : 'Filter Comrades & Allies ties'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBondFilter(activeBondFilter === 'ally' ? null : 'ally');
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                    activeBondFilter === 'ally'
                      ? 'bg-[#2e7d32] text-white shadow-xs font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d32]" />
                  <span>Allies</span>
                </button>
              </ReaderTooltip>

              <ReaderTooltip content={activeBondFilter === 'fealty' ? 'Show all bonds' : 'Filter Fealty & Devotion ties'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBondFilter(activeBondFilter === 'fealty' ? null : 'fealty');
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                    activeBondFilter === 'fealty'
                      ? 'bg-[#b45309] text-white shadow-xs font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]" />
                  <span>Fealty</span>
                </button>
              </ReaderTooltip>
            </div>
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
