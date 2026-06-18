import { lazy, Suspense } from "react"
import { LibraryGrid } from "./library/LibraryGrid"
import { SectionErrorBoundary } from "./ErrorBoundary"
import { Book } from "@/lib/tauri"
import { DomainView } from "@/store/uiStore"

const HomePage = lazy(() => import("./home/HomePage").then(m => ({ default: m.HomePage })))
const RSSFeedManager = lazy(() => import("./rss/RSSFeedManager"))
const RSSArticleList = lazy(() => import("./rss/RSSArticleList"))
const AnnotationsView = lazy(() => import("./annotations/AnnotationsView").then(m => ({ default: m.AnnotationsView })))
const StatisticsView = lazy(() => import("./statistics/StatisticsView").then(m => ({ default: m.StatisticsView })))
const OnlineBooksView = lazy(() => import("./online/OnlineBooksView").then(m => ({ default: m.OnlineBooksView })))
const OnlineMangaView = lazy(() => import("./online/OnlineMangaView").then(m => ({ default: m.OnlineMangaView })))
const OnlineMangaReader = lazy(() => import("./online/OnlineMangaReader").then(m => ({ default: m.OnlineMangaReader })))
const TorboxControlCenter = lazy(() => import("./TorboxControlCenter"))

const LoadingSpinner = ({ className = "h-screen" }: { className?: string }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
)

import { CurrentView } from "@/store/uiStore"

export interface ViewRouterProps {
  currentView: CurrentView
  currentDomain: DomainView
  displayBooks: Book[]
  handleNavigate: (view: CurrentView) => void
  handleOpenBook: (id: number, location?: string) => void
  handleViewDetails: (id: number) => void
  handleEditBook: (id: number) => void
  handleDeleteBook: (id: number) => void
  handleConvertBook: (id: number) => void
  dialogs: any
}

export function ViewRouter({
  currentView,
  currentDomain,
  displayBooks,
  handleNavigate,
  handleOpenBook,
  handleViewDetails,
  handleEditBook,
  handleDeleteBook,
  handleConvertBook,
  dialogs
}: ViewRouterProps) {
  return (
    <>
        {currentView === 'home' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <HomePage onOpenBook={handleOpenBook} onViewRSS={() => handleNavigate('rss-articles')} />
          </Suspense>
        )}

        {currentView === 'rss-feeds' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <RSSFeedManager onClose={() => handleNavigate('library')} />
          </Suspense>
        )}

        {currentView === 'rss-articles' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <RSSArticleList onClose={() => handleNavigate('library')} />
          </Suspense>
        )}

        {currentView === 'library' && (
          <SectionErrorBoundary label="Library">
            <LibraryGrid
              books={displayBooks}
              currentDomain={currentDomain}
              onBookClick={handleOpenBook}
              onViewDetails={handleViewDetails}
              onEditBook={handleEditBook}
              onDeleteBook={handleDeleteBook}
              onConvertBook={handleConvertBook}
              onViewSeries={dialogs.openSeriesView}
            />
          </SectionErrorBoundary>
        )}

        {currentView === 'annotations' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <AnnotationsView 
              onClose={() => handleNavigate('library')} 
              onOpenBook={handleOpenBook}
            />
          </Suspense>
        )}

        {currentView === 'statistics' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <StatisticsView onClose={() => handleNavigate('library')} />
          </Suspense>
        )}

        {currentView === 'online-books' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineBooksView /></Suspense>
        )}

        {currentView === 'online-manga' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineMangaView /></Suspense>
        )}

        {currentView === 'online-manga-reader' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineMangaReader /></Suspense>
        )}

        {currentView === 'torbox-discover' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxControlCenter initialTab="discover" /></Suspense>
        )}

        {currentView === 'torbox-books' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxControlCenter initialTab="books" /></Suspense>
        )}

        {currentView === 'torbox-manga' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxControlCenter initialTab="manga" /></Suspense>
        )}
    </>
  )
}
