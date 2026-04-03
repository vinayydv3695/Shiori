type AnimatedCheckmarkProps = {
  className?: string;
};

export function AnimatedCheckmark({ className }: AnimatedCheckmarkProps) {
  return (
    <div className={`relative flex items-center justify-center ${className ?? ''}`}>
      <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20 opacity-0 [animation-delay:400ms] [animation-duration:1.5s] [animation-iteration-count:1]" />
      <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-md" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="check-circle text-emerald-500"
          strokeLinecap="round"
        />
        <path
          d="M18 33l10 10 18-20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-mark text-emerald-500"
        />
        <style>{`
          .check-circle {
            stroke-dasharray: 176;
            stroke-dashoffset: 176;
            animation: check-circle 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .check-mark {
            stroke-dasharray: 50;
            stroke-dashoffset: 50;
            animation: check-mark 500ms cubic-bezier(0.16, 1, 0.3, 1) 400ms forwards;
          }
          @keyframes check-circle {
            0% { stroke-dashoffset: 176; transform: scale(0.8) rotate(-90deg); transform-origin: center; opacity: 0; }
            100% { stroke-dashoffset: 0; transform: scale(1) rotate(-90deg); transform-origin: center; opacity: 1; }
          }
          @keyframes check-mark {
            0% { stroke-dashoffset: 50; }
            100% { stroke-dashoffset: 0; }
          }
        `}</style>
      </svg>
    </div>
  );
}

export default AnimatedCheckmark;
