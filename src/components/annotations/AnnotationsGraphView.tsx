import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { 
  Plus, Minus, RotateCcw, Sliders, Maximize2, BookOpen, 
  Sparkles, Bookmark, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Node {
  id: string;
  type: 'book' | 'annotation';
  title: string;
  subtitle?: string;
  color?: string;
  categoryName?: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bookId: number;
  annotation?: AnnotationSearchResult;
  annotationCount?: number;
  connections: number;
}

interface Edge {
  source: string;
  target: string;
  type: 'book-annotation' | 'cross-book-tag';
  weight: number;
  color?: string;
}

interface AnnotationsGraphViewProps {
  annotations: AnnotationSearchResult[];
  categories: AnnotationCategory[];
  onOpenBook?: (bookId: number, location?: string, annotationId?: number) => void;
  searchQuery?: string;
  typeFilter?: string;
  categoryFilter?: number | 'all';
  selectedBookId?: number | 'all';
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  pink: '#ec4899',
  purple: '#a855f7',
  red: '#ef4444',
  orange: '#f97316',
  cyan: '#06b6d4',
};

const DEFAULT_BOOK_COLOR = '#6366f1';
const DEFAULT_ANNOTATION_COLOR = '#eab308';

export function AnnotationsGraphView({
  annotations,
  categories,
  onOpenBook,
  searchQuery = '',
  typeFilter = 'all',
  categoryFilter = 'all',
  selectedBookId = 'all',
  className,
}: AnnotationsGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Transform & Camera State (in CSS pixel units)
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 0.95 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedNodeRef = useRef<Node | null>(null);

  // Physics Simulation Settings
  const [repulsionStrength, setRepulsionStrength] = useState<number>(320);
  const [linkDistance, setLinkDistance] = useState<number>(85);
  const [gravityStrength, setGravityStrength] = useState<number>(0.04);
  const [showLabels, setShowLabels] = useState<'all' | 'books-only' | 'none'>('books-only');
  const [colorMode, setColorMode] = useState<'category' | 'book'>('category');
  const [showCrossLinks, setShowCrossLinks] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Hover & Tooltip State
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // ── Build Graph Data (Nodes & Edges) ──
  const { nodes, edges } = useMemo(() => {
    let filtered = annotations;
    if (selectedBookId !== 'all') {
      filtered = filtered.filter(a => a.annotation.bookId === selectedBookId);
    }
    if (typeFilter !== 'all') {
      if (typeFilter === 'vocabulary') {
        filtered = filtered.filter(a => {
          if (!a.annotation.noteContent) return false;
          try {
            const v = JSON.parse(a.annotation.noteContent);
            return v && (v.type === 'define' || v.type === 'translate');
          } catch {
            return false;
          }
        });
      } else {
        filtered = filtered.filter(a => a.annotation.annotationType === typeFilter);
      }
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(a => a.annotation.categoryId === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => 
        (a.annotation.selectedText || '').toLowerCase().includes(q) ||
        (a.annotation.noteContent || '').toLowerCase().includes(q) ||
        (a.book_title || '').toLowerCase().includes(q) ||
        (a.annotation.chapterTitle || '').toLowerCase().includes(q)
      );
    }

    const nList: Node[] = [];
    const eList: Edge[] = [];
    const nMap = new Map<string, Node>();
    const bookMap = new Map<number, { title: string; author: string; count: number }>();

    filtered.forEach(a => {
      const bId = a.annotation.bookId;
      if (!bookMap.has(bId)) {
        bookMap.set(bId, {
          title: a.book_title || 'Untitled Book',
          author: a.book_author || 'Unknown',
          count: 0,
        });
      }
      bookMap.get(bId)!.count++;
    });

    const bookColors = [
      '#6366f1', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', 
      '#f59e0b', '#06b6d4', '#f43f5e', '#14b8a6', '#84cc16'
    ];
    const bookColorMap = new Map<number, string>();
    Array.from(bookMap.keys()).forEach((bId, idx) => {
      bookColorMap.set(bId, bookColors[idx % bookColors.length]);
    });

    const bookIds = Array.from(bookMap.keys());
    const totalBooks = bookIds.length;
    const hubOrbitRadius = totalBooks > 1 ? Math.max(160, totalBooks * 70) : 0;

    // 1. Create Book Hub Nodes in a balanced orbit around (0, 0)
    bookIds.forEach((bId, idx) => {
      const bookInfo = bookMap.get(bId)!;
      const bNodeId = 'book-' + bId;
      const angle = (idx / Math.max(1, totalBooks)) * (Math.PI * 2);
      const hubX = totalBooks === 1 ? 0 : Math.cos(angle) * hubOrbitRadius;
      const hubY = totalBooks === 1 ? 0 : Math.sin(angle) * hubOrbitRadius;
      
      const radius = Math.min(36, Math.max(22, 18 + Math.sqrt(bookInfo.count) * 3.8));
      const node: Node = {
        id: bNodeId,
        type: 'book',
        title: bookInfo.title,
        subtitle: bookInfo.author,
        radius,
        x: hubX,
        y: hubY,
        vx: 0,
        vy: 0,
        bookId: bId,
        annotationCount: bookInfo.count,
        color: bookColorMap.get(bId) || DEFAULT_BOOK_COLOR,
        connections: 0,
      };
      nList.push(node);
      nMap.set(bNodeId, node);
    });

    // 2. Create Annotation Leaf Nodes orbiting their parent book
    const categoryGroupMap = new Map<number, string[]>();
    const bookAnnotationCounters = new Map<number, number>();

    filtered.forEach((a, idx) => {
      const aNodeId = 'ann-' + (a.annotation.id || idx);
      const bNodeId = 'book-' + a.annotation.bookId;
      const parentNode = nMap.get(bNodeId);
      const catId = a.annotation.categoryId;
      const catObj = catId ? categories.find(c => c.id === catId) : null;
      
      let nodeColor = DEFAULT_ANNOTATION_COLOR;
      if (catObj && catObj.color) {
        nodeColor = CATEGORY_COLORS[catObj.color.toLowerCase()] || catObj.color;
      } else if (a.annotation.color) {
        nodeColor = CATEGORY_COLORS[a.annotation.color.toLowerCase()] || a.annotation.color;
      }

      if (colorMode === 'book') {
        nodeColor = bookColorMap.get(a.annotation.bookId) || nodeColor;
      }

      const countIndex = bookAnnotationCounters.get(a.annotation.bookId) || 0;
      bookAnnotationCounters.set(a.annotation.bookId, countIndex + 1);

      const totalForBook = bookMap.get(a.annotation.bookId)?.count || 1;
      const annAngle = (countIndex / totalForBook) * (Math.PI * 2);
      const annDist = 80 + (countIndex % 3) * 25;

      const initX = (parentNode?.x || 0) + Math.cos(annAngle) * annDist;
      const initY = (parentNode?.y || 0) + Math.sin(annAngle) * annDist;

      const node: Node = {
        id: aNodeId,
        type: 'annotation',
        title: a.annotation.selectedText?.slice(0, 60) || a.annotation.noteContent?.slice(0, 60) || 'Bookmark',
        subtitle: a.book_title,
        radius: a.annotation.annotationType === 'note' ? 10 : (a.annotation.annotationType === 'bookmark' ? 8 : 9),
        x: initX,
        y: initY,
        vx: 0,
        vy: 0,
        bookId: a.annotation.bookId,
        annotation: a,
        color: nodeColor,
        categoryName: catObj?.name,
        connections: 1,
      };

      nList.push(node);
      nMap.set(aNodeId, node);

      eList.push({
        source: bNodeId,
        target: aNodeId,
        type: 'book-annotation',
        weight: 1.0,
        color: nodeColor,
      });

      if (parentNode) {
        parentNode.connections++;
      }

      if (catId && showCrossLinks) {
        if (!categoryGroupMap.has(catId)) {
          categoryGroupMap.set(catId, []);
        }
        categoryGroupMap.get(catId)!.push(aNodeId);
      }
    });

    // 3. Create Semantic Cross-Book Links
    if (showCrossLinks) {
      categoryGroupMap.forEach((annIds) => {
        if (annIds.length > 1 && annIds.length <= 15) {
          for (let i = 0; i < annIds.length; i++) {
            for (let j = i + 1; j < annIds.length; j++) {
              const nodeA = nMap.get(annIds[i]);
              const nodeB = nMap.get(annIds[j]);
              if (nodeA && nodeB && nodeA.bookId !== nodeB.bookId) {
                eList.push({
                  source: annIds[i],
                  target: annIds[j],
                  type: 'cross-book-tag',
                  weight: 0.25,
                  color: nodeA.color,
                });
                nodeA.connections++;
                nodeB.connections++;
              }
            }
          }
        }
      });
    }

    return { nodes: nList, edges: eList, nodeMap: nMap };
  }, [annotations, categories, searchQuery, typeFilter, categoryFilter, selectedBookId, colorMode, showCrossLinks]);

  // Persistent Simulation Refs
  const simNodesRef = useRef<Node[]>([]);
  const simEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    const prevMap = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    simNodesRef.current.forEach(n => {
      prevMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
    });

    simNodesRef.current = nodes.map(n => {
      const prev = prevMap.get(n.id);
      if (prev) {
        return { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy };
      }
      return n;
    });

    simEdgesRef.current = edges;
  }, [nodes, edges]);

  // ── Auto-Fit Camera to Screen Center ──
  const handleFitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
    const cssWidth = rect.width || 800;
    const cssHeight = rect.height || 600;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    simNodesRef.current.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });

    if (minX === Infinity) {
      transformRef.current = { x: cssWidth / 2, y: cssHeight / 2, k: 1.0 };
      return;
    }

    const graphWidth = (maxX - minX) + 140 || 500;
    const graphHeight = (maxY - minY) + 140 || 400;

    const scaleX = (cssWidth * 0.8) / graphWidth;
    const scaleY = (cssHeight * 0.8) / graphHeight;
    const optimalK = Math.max(0.4, Math.min(1.3, Math.min(scaleX, scaleY)));

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    transformRef.current = {
      x: cssWidth / 2 - graphCenterX * optimalK,
      y: cssHeight / 2 - graphCenterY * optimalK,
      k: optimalK,
    };
  }, []);

  // Initial Center on Component Mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
    const cssWidth = rect.width || 800;
    const cssHeight = rect.height || 600;

    transformRef.current = {
      x: cssWidth / 2,
      y: cssHeight / 2,
      k: 0.95,
    };
  }, []);

  const handleZoom = useCallback((delta: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
    const cssWidth = rect.width || 800;
    const cssHeight = rect.height || 600;

    const t = transformRef.current;
    const newK = Math.max(0.2, Math.min(3.0, t.k * (1 + delta)));
    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2;

    t.x = centerX - (centerX - t.x) * (newK / t.k);
    t.y = centerY - (centerY - t.y) * (newK / t.k);
    t.k = newK;
  }, []);

  // ── Physics Simulation & Canvas Rendering Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isRunning = true;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const stepSimulation = () => {
      const simNodes = simNodesRef.current;
      const simEdges = simEdgesRef.current;
      const nLen = simNodes.length;
      if (nLen === 0) return;

      const alpha = 0.3;
      const damping = 0.82;

      // 1. Repulsion
      for (let i = 0; i < nLen; i++) {
        const na = simNodes[i];
        for (let j = i + 1; j < nLen; j++) {
          const nb = simNodes[j];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          const hubMult = (na.type === 'book' ? 2.4 : 1) * (nb.type === 'book' ? 2.4 : 1);
          const force = (repulsionStrength * hubMult) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (draggedNodeRef.current?.id !== na.id) {
            na.vx -= fx;
            na.vy -= fy;
          }
          if (draggedNodeRef.current?.id !== nb.id) {
            nb.vx += fx;
            nb.vy += fy;
          }

          const minDist = na.radius + nb.radius + 16;
          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const ox = (dx / dist) * overlap;
            const oy = (dy / dist) * overlap;
            if (draggedNodeRef.current?.id !== na.id) {
              na.x -= ox;
              na.y -= oy;
            }
            if (draggedNodeRef.current?.id !== nb.id) {
              nb.x += ox;
              nb.y += oy;
            }
          }
        }
      }

      // 2. Spring Forces
      const nMap = new Map<string, Node>();
      simNodes.forEach(n => nMap.set(n.id, n));

      for (let i = 0; i < simEdges.length; i++) {
        const edge = simEdges[i];
        const na = nMap.get(edge.source);
        const nb = nMap.get(edge.target);
        if (!na || !nb) continue;

        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const targetDist = edge.type === 'cross-book-tag' ? linkDistance * 1.6 : linkDistance;
        const displacement = dist - targetDist;
        const springForce = displacement * 0.035 * edge.weight;

        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (draggedNodeRef.current?.id !== na.id) {
          na.vx += fx;
          na.vy += fy;
        }
        if (draggedNodeRef.current?.id !== nb.id) {
          nb.vx += fx;
          nb.vy += fy;
        }
      }

      // 3. Central Gravity towards (0, 0)
      for (let i = 0; i < nLen; i++) {
        const node = simNodes[i];
        if (draggedNodeRef.current?.id === node.id) continue;

        node.vx -= node.x * gravityStrength * 0.04;
        node.vy -= node.y * gravityStrength * 0.04;

        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx * alpha;
        node.y += node.vy * alpha;
      }
    };

    const render = () => {
      if (!isRunning) return;

      stepSimulation();

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const t = transformRef.current;
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const simNodes = simNodesRef.current;
      const simEdges = simEdgesRef.current;
      const nMap = new Map<string, Node>();
      simNodes.forEach(n => nMap.set(n.id, n));

      const activeHover = hoveredNode;
      const connectedNodeIds = new Set<string>();

      if (activeHover) {
        connectedNodeIds.add(activeHover.id);
        simEdges.forEach(e => {
          if (e.source === activeHover.id) connectedNodeIds.add(e.target);
          if (e.target === activeHover.id) connectedNodeIds.add(e.source);
        });
      }

      // ── Draw Edges ──
      for (let i = 0; i < simEdges.length; i++) {
        const edge = simEdges[i];
        const na = nMap.get(edge.source);
        const nb = nMap.get(edge.target);
        if (!na || !nb) continue;

        const isHighlighted = activeHover && (edge.source === activeHover.id || edge.target === activeHover.id);
        const isDimmed = activeHover && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);

        if (edge.type === 'cross-book-tag') {
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = isHighlighted 
            ? (edge.color || '#3b82f6') 
            : (isDimmed ? 'rgba(100, 116, 139, 0.08)' : 'rgba(100, 116, 139, 0.32)');
          ctx.lineWidth = isHighlighted ? 2.6 : 1.3;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = isHighlighted 
            ? (na.color || '#6366f1') 
            : (isDimmed ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.35)');
          ctx.lineWidth = isHighlighted ? 2.8 : 1.5;
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Draw Nodes ──
      for (let i = 0; i < simNodes.length; i++) {
        const node = simNodes[i];
        const isHovered = activeHover?.id === node.id;
        const isConnected = activeHover ? connectedNodeIds.has(node.id) : true;
        const isDimmed = activeHover && !isConnected;

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.22 : 1.0;

        if (node.type === 'book') {
          // Glow Outer Ring
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + (isHovered ? 12 : 7), 0, Math.PI * 2);
          ctx.fillStyle = (node.color || DEFAULT_BOOK_COLOR) + '38';
          ctx.fill();

          // Hub Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = node.color || DEFAULT_BOOK_COLOR;
          ctx.fill();

          ctx.lineWidth = isHovered ? 3.5 : 2.2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Annotation Count Inside Hub
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold ' + Math.max(11, node.radius * 0.6) + 'px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(node.annotationCount || 0), node.x, node.y);

          // Title Label
          if (showLabels !== 'none') {
            ctx.font = '600 12.5px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            const labelText = node.title.length > 26 ? node.title.slice(0, 24) + '…' : node.title;
            const textMetrics = ctx.measureText(labelText);
            const pillW = textMetrics.width + 14;
            const pillH = 20;
            const pillX = node.x - pillW / 2;
            const pillY = node.y + node.radius + 6;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 10);
            ctx.fill();

            ctx.fillStyle = '#f8fafc';
            ctx.fillText(labelText, node.x, pillY + 3.5);
          }

        } else {
          // Annotation Node
          if (isHovered) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = (node.color || DEFAULT_ANNOTATION_COLOR) + '44';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = node.color || DEFAULT_ANNOTATION_COLOR;
          ctx.fill();

          ctx.lineWidth = isHovered ? 2.8 : 1.4;
          ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
          ctx.stroke();

          if (showLabels === 'all') {
            ctx.font = '500 10.5px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const snippet = node.title.length > 18 ? node.title.slice(0, 16) + '…' : node.title;
            ctx.fillText(snippet, node.x, node.y + node.radius + 4);
          }
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [repulsionStrength, linkDistance, gravityStrength, showLabels, hoveredNode]);

  // ── Hit-Testing & Pointer Events ──
  const getNodeAtPosition = useCallback((canvasX: number, canvasY: number): Node | null => {
    const t = transformRef.current;
    const worldX = (canvasX - t.x) / t.k;
    const worldY = (canvasY - t.y) / t.k;

    const simNodes = simNodesRef.current;
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const hitRadius = node.radius + 8;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }
    return null;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const node = getNodeAtPosition(canvasX, canvasY);
    if (node) {
      draggedNodeRef.current = node;
      node.vx = 0;
      node.vy = 0;
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const t = transformRef.current;
      draggedNodeRef.current.x = (canvasX - t.x) / t.k;
      draggedNodeRef.current.y = (canvasY - t.y) / t.k;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
      setTooltipPos(null);
      return;
    }

    if (isDraggingCanvasRef.current) {
      transformRef.current.x = e.clientX - dragStartRef.current.x;
      transformRef.current.y = e.clientY - dragStartRef.current.y;
      setTooltipPos(null);
      return;
    }

    const hitNode = getNodeAtPosition(canvasX, canvasY);
    if (hitNode !== hoveredNode) {
      setHoveredNode(hitNode);
      if (hitNode) {
        setTooltipPos({ x: e.clientX, y: e.clientY });
      } else {
        setTooltipPos(null);
      }
    } else if (hitNode) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * Math.min(0.18, Math.abs(e.deltaY) * 0.0015);
    handleZoom(delta);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const node = getNodeAtPosition(canvasX, canvasY);
    if (!node) return;

    if (node.type === 'annotation' && node.annotation && onOpenBook) {
      onOpenBook(
        node.annotation.annotation.bookId,
        node.annotation.annotation.location,
        node.annotation.annotation.id
      );
    } else if (node.type === 'book') {
      const parent = canvas.parentElement;
      const rectParent = parent ? parent.getBoundingClientRect() : rect;
      const cssWidth = rectParent.width || 800;
      const cssHeight = rectParent.height || 600;
      const t = transformRef.current;
      transformRef.current = {
        ...t,
        x: cssWidth / 2 - node.x * t.k,
        y: cssHeight / 2 - node.y * t.k,
      };
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={cn('relative w-full h-full min-h-[500px] bg-background/95 select-none overflow-hidden', className)}
    >
      {/* ── Main Force Graph Canvas ── */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleClick}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* ── Top Left: Stats HUD ── */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-card/85 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl px-3.5 py-2 text-xs">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <div className="flex items-center gap-2 text-muted-foreground font-medium">
          <span className="font-bold text-foreground">
            {nodes.filter(n => n.type === 'book').length}
          </span> Books
          <span>•</span>
          <span className="font-bold text-foreground">
            {nodes.filter(n => n.type === 'annotation').length}
          </span> Annotations
          <span>•</span>
          <span className="font-bold text-foreground">
            {edges.length}
          </span> Links
        </div>
      </div>

      {/* ── Top Right: Floating Control Buttons ── */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-card/85 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl p-1.5">
        <button
          type="button"
          onClick={() => handleZoom(0.2)}
          title="Zoom In"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.2)}
          title="Zoom Out"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          onClick={handleFitView}
          title="Fit View to Screen (Center)"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
        >
          <Maximize2 size={14} />
        </button>
        <div className="w-[1px] h-4 bg-border/60 mx-0.5" />
        <button
          type="button"
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title="Physics & Graph Settings"
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-xl transition-all cursor-pointer',
            isSettingsOpen ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
          )}
        >
          <Sliders size={14} />
        </button>
      </div>

      {/* ── Slide-out Physics & Display Settings Drawer ── */}
      {isSettingsOpen && (
        <div className="absolute top-16 right-4 z-20 w-72 bg-card/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-3xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Sliders size={13} className="text-primary" />
              Graph Physics
            </span>
            <button
              type="button"
              onClick={() => {
                setRepulsionStrength(320);
                setLinkDistance(85);
                setGravityStrength(0.04);
              }}
              title="Reset physics defaults"
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>

          {/* Sliders */}
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between font-medium text-muted-foreground">
                <span>Node Repulsion</span>
                <span className="font-bold text-foreground">{repulsionStrength}</span>
              </div>
              <input
                type="range"
                min="100"
                max="700"
                step="20"
                value={repulsionStrength}
                onChange={(e) => setRepulsionStrength(Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-medium text-muted-foreground">
                <span>Link Distance</span>
                <span className="font-bold text-foreground">{linkDistance}px</span>
              </div>
              <input
                type="range"
                min="40"
                max="180"
                step="5"
                value={linkDistance}
                onChange={(e) => setLinkDistance(Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-medium text-muted-foreground">
                <span>Center Gravity</span>
                <span className="font-bold text-foreground">{Math.round(gravityStrength * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.10"
                step="0.005"
                value={gravityStrength}
                onChange={(e) => setGravityStrength(Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          {/* Display & Coloring Options */}
          <div className="border-t border-border/50 pt-3 space-y-2.5 text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Display & Colors
            </span>

            {/* Label Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium">Node Labels</span>
              <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border/50">
                <button
                  type="button"
                  onClick={() => setShowLabels('all')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition-all',
                    showLabels === 'all' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setShowLabels('books-only')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition-all',
                    showLabels === 'books-only' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Books
                </button>
                <button
                  type="button"
                  onClick={() => setShowLabels('none')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition-all',
                    showLabels === 'none' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Off
                </button>
              </div>
            </div>

            {/* Color Mode */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium">Color By</span>
              <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border/50">
                <button
                  type="button"
                  onClick={() => setColorMode('category')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition-all',
                    colorMode === 'category' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Category
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('book')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition-all',
                    colorMode === 'book' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Book
                </button>
              </div>
            </div>

            {/* Cross Book Links Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground font-medium">Cross-Book Tags</span>
              <button
                type="button"
                onClick={() => setShowCrossLinks(!showCrossLinks)}
                className={cn(
                  'w-10 h-5.5 rounded-full transition-colors relative cursor-pointer border',
                  showCrossLinks ? 'bg-primary border-primary' : 'bg-muted border-border/60'
                )}
              >
                <div 
                  className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5',
                    showCrossLinks ? 'right-0.5' : 'left-0.5'
                  )} 
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Glassmorphic Hover Tooltip Card ── */}
      {hoveredNode && tooltipPos && (
        <div 
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 max-w-sm w-72 bg-popover/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-2xl p-3 text-popover-foreground space-y-2 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: tooltipPos.x + 'px',
            top: (tooltipPos.y - 12) + 'px',
          }}
        >
          {hoveredNode.type === 'book' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: hoveredNode.color || DEFAULT_BOOK_COLOR }}
                />
                <span className="font-bold text-xs leading-tight text-foreground line-clamp-2">
                  {hoveredNode.title}
                </span>
              </div>
              {hoveredNode.subtitle && (
                <p className="text-[11px] text-muted-foreground">by {hoveredNode.subtitle}</p>
              )}
              <div className="flex items-center gap-3 pt-1 border-t border-border/40 text-[11px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Bookmark size={11} className="text-primary" />
                  {hoveredNode.annotationCount} highlights & notes
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BookOpen size={12} className="text-primary shrink-0" />
                  <span className="text-[11px] font-bold text-foreground truncate">
                    {hoveredNode.annotation?.book_title}
                  </span>
                </div>
                {hoveredNode.categoryName && (
                  <span 
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shrink-0"
                    style={{ 
                      backgroundColor: hoveredNode.color + '22',
                      borderColor: hoveredNode.color + '55',
                      color: hoveredNode.color 
                    }}
                  >
                    {hoveredNode.categoryName}
                  </span>
                )}
              </div>

              {/* Quote Snippet */}
              {hoveredNode.annotation?.annotation.selectedText && (
                <p className="text-xs italic text-foreground/90 line-clamp-4 pl-2 border-l-2 border-primary/50">
                  "{hoveredNode.annotation.annotation.selectedText}"
                </p>
              )}

              {/* Note Content */}
              {hoveredNode.annotation?.annotation.noteContent && (
                <div className="bg-muted/50 rounded-xl p-2 text-[11px] text-muted-foreground border border-border/40">
                  <span className="font-bold text-foreground block mb-0.5">Note:</span>
                  <p className="line-clamp-3">{hoveredNode.annotation.annotation.noteContent}</p>
                </div>
              )}

              {/* Footer Hint */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                <span>{hoveredNode.annotation?.annotation.chapterTitle || 'Page Location'}</span>
                <span className="flex items-center gap-1 text-primary font-semibold">
                  Click to open <ExternalLink size={9} />
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Center: Hint Banner ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/85 backdrop-blur-xl border border-border/60 shadow-md rounded-full px-4 py-1.5 text-[11px] text-muted-foreground">
        <span>Click any highlight to open reader</span>
        <span>•</span>
        <span>Scroll to zoom, drag to pan</span>
      </div>
    </div>
  );
}
