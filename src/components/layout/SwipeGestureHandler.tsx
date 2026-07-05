import { useState, useEffect, ReactNode, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useReaderStore } from '@/store/readerStore';
import { useIsMobile } from '@/hooks/useIsMobile';

interface SwipeGestureHandlerProps {
  children: ReactNode;
}

export function SwipeGestureHandler({ children }: SwipeGestureHandlerProps) {
  const isMobile = useIsMobile();
  const goBack = useUIStore(state => state.goBack);
  const currentView = useUIStore(state => state.currentView);
  const setCurrentView = useUIStore(state => state.setCurrentView);
  const isReaderOpen = useReaderStore(state => state.isReaderOpen);
  const closeBook = useReaderStore(state => state.closeBook);
  
  const [swiping, setSwiping] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const isValidEdgeSwipe = useRef(false);

  // Constants
  const EDGE_THRESHOLD = 30; // Max starting X coordinate to be considered an edge swipe
  const ACTIVATION_THRESHOLD = 80; // Distance needed to trigger back action

  useEffect(() => {
    if (!isMobile) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only single touch
      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;

      // Check if started from left edge
      if (startX.current <= EDGE_THRESHOLD) {
        isValidEdgeSwipe.current = true;
      } else {
        isValidEdgeSwipe.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isValidEdgeSwipe.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = Math.abs(touch.clientY - startY.current);

      // If they scroll vertically more than horizontally early on, cancel the edge swipe
      if (deltaY > 20 && deltaX < 20) {
        isValidEdgeSwipe.current = false;
        setSwiping(false);
        setDragX(0);
        return;
      }

      if (deltaX > 0) {
        setSwiping(true);
        // Add a bit of friction so the indicator doesn't move 1:1 with the finger
        setDragX(Math.min(deltaX * 0.5, ACTIVATION_THRESHOLD + 20));
        
        // Prevent default browser back navigation (if any)
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (isValidEdgeSwipe.current && swiping) {
        if (dragX >= ACTIVATION_THRESHOLD * 0.5) { // If dragged at least halfway to the threshold, trigger
          handleGoBack();
        }
      }
      setSwiping(false);
      setDragX(0);
      isValidEdgeSwipe.current = false;
    };

    const handleGoBack = () => {
      // Prioritize closing the reader if it is open
      if (isReaderOpen) {
        closeBook();
        return;
      }
      
      if (currentView === 'online-manga-reader') {
        setCurrentView('online-manga');
        return;
      }

      // Normal go back
      goBack();
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isMobile, swiping, dragX, goBack, isReaderOpen, closeBook, currentView, setCurrentView]);

  return (
    <>
      {/* Visual Back Indicator */}
      {isMobile && (
        <div
          className={cn(
            "fixed left-0 top-1/2 -translate-y-1/2 z-[100] pointer-events-none flex items-center justify-center",
            "w-10 h-10 bg-background/80 backdrop-blur-md rounded-full shadow-lg border border-border/50 transition-opacity",
            swiping ? "opacity-100" : "opacity-0 duration-300"
          )}
          style={{
            transform: `translate(calc(-50% + ${dragX}px), -50%) scale(${swiping ? 1 : 0.8})`,
            transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease'
          }}
        >
          <ChevronLeft 
            className="w-6 h-6 text-foreground" 
            style={{ 
              opacity: dragX >= ACTIVATION_THRESHOLD * 0.5 ? 1 : 0.5,
              transform: `scale(${dragX >= ACTIVATION_THRESHOLD * 0.5 ? 1.1 : 1})`,
              transition: 'opacity 0.2s, transform 0.2s'
            }} 
          />
        </div>
      )}
      
      {/* App Content */}
      {children}
    </>
  );
}
