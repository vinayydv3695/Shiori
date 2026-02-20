import type { ReactNode } from 'react'

interface HomeSectionProps {
    icon: ReactNode
    title: string
    action?: { label: string; onClick: () => void }
    children: ReactNode
}

export function HomeSection({ icon, title, action, children }: HomeSectionProps) {
    return (
        <div className="home-section">
            <div className="home-section-header">
                <div className="home-section-title">
                    <span className="home-section-title-icon">{icon}</span>
                    {title}
                </div>
                {action && (
                    <button className="home-section-action" onClick={action.onClick}>
                        {action.label} →
                    </button>
                )}
            </div>
            {children}
        </div>
    )
}
