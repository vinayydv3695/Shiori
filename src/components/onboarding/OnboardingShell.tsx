import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface OnboardingShellProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: ReactNode;
  stepNames?: string[];
}

type Particle = {
  x: number;
  y: number;
  r: number;
  speed: number;
  alpha: number;
};

function Wordmark() {
  return (
    <div className="ob-wordmark">
      <svg viewBox="0 0 24 24" className="ob-wordmark-icon" aria-hidden="true" role="img">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="currentColor" />
      </svg>
      <span>Shiori</span>
    </div>
  );
}

type StepVisual = {
  title: string;
  subtitle: string;
  stepFocus: string;
  icon: ReactNode;
};

const STEP_VISUALS: StepVisual[] = [
  {
    title: 'Welcome',
    subtitle: 'Set up your reading space in under a minute.',
    stepFocus: 'Quick start',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M12 3l2.3 4.7L19 10l-4.7 2.3L12 17l-2.3-4.7L5 10l4.7-2.3L12 3z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Content Setup',
    subtitle: 'Choose what you want Shiori to organize first.',
    stepFocus: 'Library types',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M5 4h9a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zm12 2h2a1 1 0 0 1 1 1v13h-3V6z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Import Books',
    subtitle: 'Bring your existing book collection into Shiori.',
    stepFocus: 'Imports',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M4 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15H8a4 4 0 0 0-4 0V5zm13-2h1a2 2 0 0 1 2 2v15a4 4 0 0 0-4 0V3z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Import Manga',
    subtitle: 'Add manga folders and keep volumes in reading order.',
    stepFocus: 'Series order',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M4 4h7v16H4V4zm9 0h7v16h-7V4zm1 3h5v2h-5V7zm0 4h5v2h-5v-2z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Import Comics',
    subtitle: 'Pull in comic libraries and preserve issue structure.',
    stepFocus: 'Issues & arcs',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M4 4h16v14H4V4zm2 2v10h12V6H6zm2 12h8v2H8v-2zm2-9h4v2h-4V9zm-2 3h8v2H8v-2z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Reading Preferences',
    subtitle: 'Tune theme, layout, and defaults for comfortable sessions.',
    stepFocus: 'Reading comfort',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M12 3a9 9 0 1 0 9 9A9 9 0 0 0 12 3zm1 2.1A7 7 0 0 1 18.9 11H13z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Optional Features',
    subtitle: 'Enable extra tools now or revisit them any time later.',
    stepFocus: 'Power tools',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M12 2l3 6 6 .9-4.4 4.3 1 6.1L12 16l-5.6 3.3 1-6.1L3 8.9 9 8l3-6z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Library Scan',
    subtitle: 'Scan sources and prepare your first synced library.',
    stepFocus: 'Sync readiness',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M11 4a7 7 0 1 0 4.4 12.4L20 21l1-1-4.6-4.6A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Done',
    subtitle: 'Everything is ready — open your library and start reading.',
    stepFocus: 'Ready to read',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
        <path d="M9.2 16.2l-3.5-3.5-1.4 1.4 4.9 4.9L20 8.2l-1.4-1.4-9.4 9.4z" fill="currentColor" />
      </svg>
    ),
  },
];

export function OnboardingShell({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  children,
  stepNames,
}: OnboardingShellProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const particles: Particle[] = [];

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      particles.length = 0;
      for (let i = 0; i < 35; i += 1) {
        particles.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          r: 1 + Math.random(),
          speed: 0.2 + Math.random() * 0.3,
          alpha: 0.1 + Math.random() * 0.15,
        });
      }
    };

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const p of particles) {
        p.y -= p.speed;
        if (p.y < 0) {
          p.y = rect.height;
          p.x = Math.random() * rect.width;
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    setup();
    rafId = window.requestAnimationFrame(render);
    window.addEventListener('resize', setup);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', setup);
    };
  }, []);

  const safeTotal = Math.max(1, totalSteps);
  const clampedStep = Math.max(0, Math.min(currentStep, safeTotal - 1));
  const visual = STEP_VISUALS[clampedStep] ?? STEP_VISUALS[0];
  const orbShift = (clampedStep - (safeTotal - 1) / 2) * 3;
  const stepProgress = (clampedStep + 1) / safeTotal;
  const microBars = [
    { id: 'alpha', level: 0.32 + stepProgress * 0.55 },
    { id: 'beta', level: 0.24 + stepProgress * 0.62 },
    { id: 'gamma', level: 0.36 + stepProgress * 0.48 },
  ];

  const labels = useMemo(
    () =>
      stepNames && stepNames.length === totalSteps
        ? stepNames
        : Array.from({ length: safeTotal }, (_, i) => `Step ${i + 1}`),
    [safeTotal, stepNames, totalSteps],
  );

  return (
    <div className="ob-shell">
      <aside className="ob-left" aria-hidden="true">
        <canvas ref={canvasRef} className="ob-particles" />
        <div className="ob-left-inner">
          <div className="ob-brand-block">
            <Wordmark />
            <p className="ob-tagline">Your library. Your way.</p>
          </div>

          <div className="ob-visual-wrap">
            <div className="ob-orb" style={{ transform: `translate3d(${orbShift}px, ${-orbShift * 0.35}px, 0)` }} />
            <AnimatePresence mode="wait" initial={!prefersReducedMotion}>
              <motion.div
                key={visual.title}
                className="ob-visual-card"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
                animate={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -24, scale: 0.96 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="ob-visual-card-inner">
                  <div className="ob-visual-icon">{visual.icon}</div>
                  <h3 className="ob-visual-title">{visual.title}</h3>
                  <p className="ob-visual-subtitle">{visual.subtitle}</p>
                  <p className="ob-visual-badge">Step focus: {visual.stepFocus}</p>
                  <div className="ob-visual-micro" aria-hidden="true">
                    {microBars.map((bar, index) => (
                      <motion.span
                        key={`${clampedStep}-${bar.id}`}
                        className="ob-visual-micro-bar"
                        style={{ '--ob-bar-level': bar.level } as CSSProperties}
                        initial={prefersReducedMotion ? false : { scaleX: 0.5, opacity: 0.45 }}
                        animate={
                          prefersReducedMotion
                            ? { scaleX: 1, opacity: 0.82 }
                            : { scaleX: [0.5, 1, 0.72], opacity: [0.45, 1, 0.6] }
                        }
                        transition={
                          prefersReducedMotion
                            ? { duration: 0 }
                            : {
                                duration: 1.6,
                                delay: index * 0.1,
                                repeat: Number.POSITIVE_INFINITY,
                                repeatType: 'mirror',
                                ease: 'easeInOut',
                              }
                        }
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="ob-progress-wrap">
            <div className="ob-progress-rail">
              {labels.map((label, i) => {
                const current = i === clampedStep;
                const past = i < clampedStep;
                const future = i > clampedStep;
                return (
                  <div key={label} className="ob-dot-row">
                    <span
                      className={`ob-dot ${current ? 'current' : ''} ${past ? 'past' : ''} ${future ? 'future' : ''}`}
                    />
                    {i < safeTotal - 1 ? <span className={`ob-connector ${i < clampedStep ? 'active' : ''}`} /> : null}
                  </div>
                );
              })}
            </div>
            <p key={labels[clampedStep]} className="ob-current-label ob-label-fade">
              {labels[clampedStep]}
            </p>
          </div>
        </div>
      </aside>

      <section className="ob-right">
        <div className="ob-mobile-wordmark">
          <Wordmark />
        </div>

        <div className="ob-content-scroll">
          <div className="ob-content-inner">{children}</div>
        </div>

        <div className="ob-nav">
          {clampedStep === 0 ? (
            <span className="ob-nav-spacer" aria-hidden="true" />
          ) : (
            <button type="button" className="ob-btn ob-btn-ghost" onClick={onBack}>
              Back
            </button>
          )}
          <span className="ob-counter">
            {clampedStep + 1} of {safeTotal}
          </span>
          <button type="button" className="ob-btn ob-btn-accent" onClick={onNext} disabled={Boolean(nextDisabled)}>
            {nextLabel ?? (clampedStep === safeTotal - 1 ? 'Finish' : 'Continue')}
          </button>
        </div>
      </section>
    </div>
  );
}
