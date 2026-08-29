import { useState, useRef, useCallback } from 'react';

interface UseBottomSheetDragOptions {
  onClose: () => void;
  closeThresholdPx?: number;
  expandThresholdPx?: number;
}

export function useBottomSheetDrag({
  onClose,
  closeThresholdPx = 70,
  expandThresholdPx = 35,
}: UseBottomSheetDragOptions) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartYRef.current === null || e.touches.length !== 1) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartYRef.current;
    // Allow visual feedback while dragging
    setDragOffset(diff);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const diff = touchEndY - touchStartYRef.current;

    touchStartYRef.current = null;
    setDragOffset(0);

    if (diff > closeThresholdPx) {
      // Swiped down past threshold -> Close dialog
      onClose();
    } else if (diff < -expandThresholdPx) {
      // Swiped up -> Expand to full screen
      setIsExpanded(true);
    } else if (diff > expandThresholdPx && isExpanded) {
      // Swiped down while expanded -> Collapse back to compact
      setIsExpanded(false);
    }
  }, [onClose, isExpanded, closeThresholdPx, expandThresholdPx]);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleProps = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onClick: toggleExpand,
  };

  return {
    isExpanded,
    setIsExpanded,
    dragOffset,
    handleProps,
    toggleExpand,
  };
}
