export function OnboardingMotionStyles() {
  return (
    <style>{`
      @keyframes onboarding-fade-up {
        0% { opacity: 0; transform: translateY(15px); }
        100% { opacity: 1; transform: translateY(0); }
      }

      .onb-fade-up {
        opacity: 0;
        animation: onboarding-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .onb-delay-100 { animation-delay: 100ms; }
      .onb-delay-200 { animation-delay: 200ms; }
      .onb-delay-300 { animation-delay: 300ms; }

      .onb-icon-badge {
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, border-color 0.3s ease;
        will-change: transform;
      }

      .onb-icon-badge:hover {
        transform: translateY(-3px) scale(1.06) rotate(-2deg);
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .onb-icon-inner {
        transition: transform 0.28s ease-out;
      }

      .onb-icon-badge:hover .onb-icon-inner {
        transform: scale(1.08);
      }

      .onb-cta-glow {
        background: linear-gradient(90deg, #27272a 0%, #3f3f46 100%);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.05),
          0 4px 12px -2px rgba(0, 0, 0, 0.5),
          0 12px 32px -4px rgba(0, 0, 0, 0.4);
        transition: transform 0.24s ease, box-shadow 0.24s ease, filter 0.24s ease;
      }

      .onb-cta-glow:hover {
        transform: translateY(-1px);
        filter: brightness(1.1);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 6px 16px -2px rgba(0, 0, 0, 0.6),
          0 16px 40px -4px rgba(0, 0, 0, 0.5);
      }

      .onb-cta-glow:active {
        transform: translateY(1px);
      }
    `}</style>
  );
}

export default OnboardingMotionStyles;
