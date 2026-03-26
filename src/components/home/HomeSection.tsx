import type { ReactNode } from 'react'

interface HomeSectionProps {
    icon: ReactNode
    title: string
    action?: { label: string; onClick: () => void }
    children: ReactNode
}

export function HomeSection({ icon, title, action, children }: HomeSectionProps) {
    return (
        <section className="home-section" aria-label={title}>
            <div className="home-section-header">
                <h2 className="home-section-title">
                    <span className="home-section-title-icon">{icon}</span>
                    {title}
                </h2>
                {action && (
                    <button
                        type="button"
                        className="home-section-action"
                        onClick={action.onClick}
                    >
                        {action.label} →
                    </button>
                )}
            </div>
            {children}
        </section>
    )
}
