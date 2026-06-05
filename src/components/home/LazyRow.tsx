import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface LazyRowProps {
  children: React.ReactNode;
  height?: string | number;
}

export function LazyRow({ children, height = 240 }: LazyRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height, width: '100%' }}>
      {isVisible ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {children}
        </motion.div>
      ) : (
        <div className="skeleton-row-placeholder" style={{ height: height, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }} />
      )}
    </div>
  );
}
