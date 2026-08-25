import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RadialMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface RadialMenuProps {
  children: React.ReactNode;
  items: RadialMenuItem[];
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function getPieSlice(cx: number, cy: number, r: number, ir: number, startAngle: number, endAngle: number) {
  const gap = 2; // 2 degree gap for aesthetic separation
  const start = polarToCartesian(cx, cy, r, endAngle - gap/2);
  const end = polarToCartesian(cx, cy, r, startAngle + gap/2);
  const innerStart = polarToCartesian(cx, cy, ir, endAngle - gap/2);
  const innerEnd = polarToCartesian(cx, cy, ir, startAngle + gap/2);
  
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  
  return [
    "M", start.x, start.y, 
    "A", r, r, 0, largeArcFlag, 0, end.x, end.y,
    "L", innerEnd.x, innerEnd.y,
    "A", ir, ir, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
    "Z"
  ].join(" ");
}

export function RadialMenu({ children, items }: RadialMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const setScreenCenterPosition = () => {
    setPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setScreenCenterPosition();
    setIsOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return;
    touchTimer.current = setTimeout(() => {
      setScreenCenterPosition();
      setIsOpen(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const clearTouchTimer = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleClose = () => setIsOpen(false);
      window.addEventListener('scroll', handleClose, { capture: true });
      window.addEventListener('resize', handleClose);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('scroll', handleClose, { capture: true });
        window.removeEventListener('resize', handleClose);
      };
    }
  }, [isOpen]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const SVG_SIZE = 340;
  const CENTER = SVG_SIZE / 2; // 170
  const OUTER_RADIUS = 160;
  const INNER_RADIUS = 46;

  return (
    <>
      <div 
        ref={wrapperRef}
        onContextMenu={handleContextMenu} 
        onTouchStart={handleTouchStart}
        onTouchEnd={clearTouchTimer}
        onTouchMove={clearTouchTimer}
        onTouchCancel={clearTouchTimer}
        className="w-full h-full"
      >
        {children}
      </div>

      {mounted && document.body && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[100]" onContextMenu={(e) => e.preventDefault()}>
              {/* Glassmorphic Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/45 dark:bg-black/70 backdrop-blur-sm pointer-events-auto" 
                onClick={() => setIsOpen(false)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                }}
              />
              
              {/* Perfectly Centered Radial Menu Container */}
              <motion.div
                initial={{ scale: 0.35, opacity: 0, rotate: -15 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.35, opacity: 0, rotate: 15 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className="absolute pointer-events-none will-change-transform"
                style={{
                  left: position.x - CENTER,
                  top: position.y - CENTER,
                  width: SVG_SIZE,
                  height: SVG_SIZE,
                }}
              >
                {/* SVG Pie Slices */}
                <svg width={SVG_SIZE} height={SVG_SIZE} className="absolute inset-0 pointer-events-none drop-shadow-xl">
                  {items.map((item, i) => {
                    const anglePerSlice = 360 / items.length;
                    const startAngle = i * anglePerSlice - anglePerSlice / 2;
                    const endAngle = startAngle + anglePerSlice;
                    const pathData = getPieSlice(CENTER, CENTER, OUTER_RADIUS, INNER_RADIUS, startAngle, endAngle);
                    const isHovered = hoveredIndex === i;
                    
                    return (
                      <path
                        key={`slice-${item.label}`}
                        d={pathData}
                        className="pointer-events-auto cursor-pointer transition-all duration-200 ease-out"
                        style={{
                          fill: isHovered 
                            ? (item.destructive ? "hsl(var(--destructive)/0.95)" : "hsl(var(--primary)/0.95)") 
                            : "hsl(var(--card)/0.92)",
                          stroke: isHovered
                            ? (item.destructive ? "hsl(var(--destructive))" : "hsl(var(--primary))")
                            : "hsl(var(--border)/0.6)",
                          strokeWidth: isHovered ? 2 : 1.5
                        }}
                        onTouchStart={() => setHoveredIndex(i)}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHoveredIndex(null);
                          setIsOpen(false);
                          item.onClick();
                        }}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          item.onClick();
                        }}
                      />
                    );
                  })}
                </svg>
                
                {/* Item Icons & Labels */}
                {items.map((item, i) => {
                  const anglePerSlice = 360 / items.length;
                  const sliceCenterAngle = i * anglePerSlice;
                  const r = (OUTER_RADIUS + INNER_RADIUS) / 2; // Midpoint radius = 103
                  const itemPos = polarToCartesian(CENTER, CENTER, r, sliceCenterAngle);
                  const isHovered = hoveredIndex === i;

                  return (
                    <div 
                      key={`content-${item.label}`}
                      className="absolute pointer-events-none flex flex-col items-center justify-center gap-1 transition-transform duration-200 ease-out select-none"
                      style={{ 
                        left: itemPos.x, 
                        top: itemPos.y,
                        transform: `translate(-50%, -50%) scale(${isHovered ? 1.1 : 1})`
                      }}
                    >
                      <item.icon 
                        size={22} 
                        className={cn(
                          "transition-colors duration-200",
                          isHovered 
                            ? (item.destructive ? "text-destructive-foreground" : "text-primary-foreground") 
                            : (item.destructive ? "text-destructive" : "text-foreground")
                        )} 
                      />
                      <span className={cn(
                        "text-[11px] font-bold text-center leading-tight transition-colors duration-200 max-w-[80px]",
                        isHovered 
                          ? (item.destructive ? "text-destructive-foreground" : "text-primary-foreground") 
                          : "text-foreground/90"
                      )}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
                
                {/* Dead-Centered Cancel X Button */}
                <button 
                  type="button"
                  aria-label="Close menu"
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[68px] h-[68px] rounded-full bg-card/95 backdrop-blur-xl border-2 border-border/80 shadow-2xl flex items-center justify-center text-foreground/80 z-20 pointer-events-auto cursor-pointer hover:bg-accent hover:text-foreground hover:scale-105 active:scale-95 transition-all duration-200 ease-out outline-none ring-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsOpen(false);
                  }}
                >
                  <X size={24} className="w-6 h-6 stroke-[2.5]" />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
