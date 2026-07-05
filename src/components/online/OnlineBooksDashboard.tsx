import { useState, useEffect, useRef } from 'react';
import { fetchTrendingBooks, fetchSubjectBooks } from '@/online-books/openlibrary/api';
import type { OpenLibraryWork } from '@/online-books/openlibrary/types';
import { ModernBookCard } from './ModernBookCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { Search, Flame, Rocket, Library, Swords } from 'lucide-react';

interface BookRowProps {
  title: string;
  subtitle: string;
  books: any[];
  onBookClick: (title: string, author?: string) => void;
  isLoading: boolean;
}

function BookRow({ title, subtitle, books, onBookClick, isLoading }: BookRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -600, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 600, behavior: 'smooth' });
    }
  };

  if (isLoading) {
    return (
      <div className="mb-20">
        <div className="flex justify-between items-end mb-8 px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-widest">{subtitle}</span>
        </div>
        <div className="flex gap-6 px-8 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="min-w-[120px] md:min-w-[160px] lg:min-w-[192px] aspect-[2/3] rounded-xl bg-secondary/40 border border-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (books.length === 0) return null;

  return (
    <div className="mb-20 relative group/row">
        <div className="flex justify-between items-end mb-8 px-8">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-widest">{subtitle}</span>
        </div>
      
      {/* Scroll Controls */}
      <button 
        onClick={scrollLeft}
        className="absolute left-2 top-[55%] -translate-y-1/2 z-30 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover/row:opacity-100 transition-all duration-300 backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      
      <button 
        onClick={scrollRight}
        className="absolute right-2 top-[55%] -translate-y-1/2 z-30 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover/row:opacity-100 transition-all duration-300 backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      <div 
        ref={scrollContainerRef}
        className="flex w-full space-x-6 px-8 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {books.map((book) => {
          const coverId = book.cover_i || book.cover_id;
          const authorName = Array.isArray(book.author_name) 
            ? book.author_name[0] 
            : (book.authors && book.authors[0]?.name);

          return (
            <div key={book.key} className="w-[120px] md:w-[160px] lg:w-[192px] flex-none snap-start">
              <ModernBookCard
                id={book.key}
                title={book.title}
                author={authorName}
                coverUrl={coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined}
                year={book.first_publish_year}
                onClick={() => onBookClick(book.title, authorName)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BookGrid({ title, subtitle, books, onBookClick, isLoading }: BookRowProps) {
  if (isLoading) {
    return (
      <div className="mb-20">
        <div className="flex justify-between items-end mb-8 px-8">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-widest">{subtitle}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:gap-6 md:gap-y-12 px-2 md:px-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-full aspect-[2/3] rounded-xl bg-secondary/40 border border-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (books.length === 0) return null;

  return (
    <div className="mb-20">
      <div className="flex justify-between items-end mb-8 px-8">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground uppercase tracking-widest">{subtitle}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:gap-6 md:gap-y-12 px-2 md:px-8">
        {books.map((book) => {
          const coverId = book.cover_i || book.cover_id;
          const authorName = Array.isArray(book.author_name) 
            ? book.author_name[0] 
            : (book.authors && book.authors[0]?.name);

          return (
            <ModernBookCard
              key={book.key}
              id={book.key}
              title={book.title}
              author={authorName}
              coverUrl={coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined}
              year={book.first_publish_year}
              onClick={() => onBookClick(book.title, authorName)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function OnlineBooksDashboard() {
  const [trending, setTrending] = useState<OpenLibraryWork[]>([]);
  const [scifi, setScifi] = useState<any[]>([]);
  const [classics, setClassics] = useState<any[]>([]);
  const [fantasy, setFantasy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const setQuery = useOnlineSearchStore(state => state.setQuery);

  useEffect(() => {
    let active = true;
    
    Promise.allSettled([
      fetchTrendingBooks(),
      fetchSubjectBooks('science_fiction'),
      fetchSubjectBooks('classic_literature'),
      fetchSubjectBooks('fantasy')
    ]).then(([trendRes, scifiRes, classicRes, fantasyRes]) => {
      if (!active) return;
      
      if (trendRes.status === 'fulfilled') setTrending(trendRes.value.slice(0, 15));
      if (scifiRes.status === 'fulfilled') setScifi(scifiRes.value);
      if (classicRes.status === 'fulfilled') setClassics(classicRes.value);
      if (fantasyRes.status === 'fulfilled') setFantasy(fantasyRes.value);
      
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const handleBookClick = (title: string, author?: string) => {
    // When a user clicks a book from the dashboard, we trigger a global search for it
    // because OpenLibrary doesn't provide direct EPUB downloads, we use Libgen/Gutenberg for that!
    setQuery('online-books', title);
  };

  return (
    <div className="flex-1 overflow-y-auto pt-12 md:pt-16">
      <div className="pb-32 max-w-[1440px] mx-auto mt-6 flex flex-col gap-8 md:gap-16">
        <BookGrid subtitle="01 — Gallery" title="Featured Books" books={trending.slice(0, 4)} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow subtitle="02 — Global" title="Trending Now" books={scifi} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow subtitle="03 — For You" title="Recommended" books={classics} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow subtitle="04 — Explore" title="Epic Fantasy" books={fantasy} isLoading={loading} onBookClick={handleBookClick} />
      </div>
    </div>
  );
}
