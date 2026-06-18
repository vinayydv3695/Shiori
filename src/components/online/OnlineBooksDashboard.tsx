import { useState, useEffect } from 'react';
import { fetchTrendingBooks, fetchSubjectBooks } from '@/online-books/openlibrary/api';
import type { OpenLibraryWork } from '@/online-books/openlibrary/types';
import { ModernBookCard } from './ModernBookCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { Search, Flame, Rocket, Library, Swords } from 'lucide-react';

interface BookRowProps {
  title: string;
  icon?: React.ReactNode;
  books: any[];
  onBookClick: (title: string, author?: string) => void;
  isLoading: boolean;
}

function BookRow({ title, icon, books, onBookClick, isLoading }: BookRowProps) {
  if (isLoading) {
    return (
      <div className="mb-10">
        <h2 className="text-2xl font-semibold mb-4 text-white/90 px-6 flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <div className="flex gap-4 px-6 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="min-w-[160px] h-[240px] bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (books.length === 0) return null;

  return (
    <div className="mb-10 relative">
      <h2 className="text-2xl font-semibold mb-4 text-white/90 px-6 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex w-max space-x-4 px-6">
          {books.map((book) => {
            const coverId = book.cover_i || book.cover_id;
            const authorName = Array.isArray(book.author_name) 
              ? book.author_name[0] 
              : (book.authors && book.authors[0]?.name);

            return (
              <div key={book.key} className="w-[160px]">
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
        <ScrollBar orientation="horizontal" className="bg-black/20" />
      </ScrollArea>
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
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-black/20 to-transparent">
      {/* Hero Section */}
      <div className="relative h-[40vh] min-h-[300px] flex items-center justify-center overflow-hidden mb-8">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=2000')] bg-cover bg-center opacity-20" />
        
        <div className="relative z-20 text-center px-4 max-w-3xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white drop-shadow-lg">
            Discover Your Next Adventure
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
            Search millions of books across Libgen and Gutenberg. Stream them instantly or add them to your wishlist.
          </p>
        </div>
      </div>

      <div className="pb-20 max-w-[1600px] mx-auto mt-8">
        <BookRow icon={<Flame className="text-orange-500 w-6 h-6" />} title="Trending This Week" books={trending} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow icon={<Rocket className="text-blue-400 w-6 h-6" />} title="Sci-Fi Masterpieces" books={scifi} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow icon={<Library className="text-amber-600 w-6 h-6" />} title="Timeless Classics" books={classics} isLoading={loading} onBookClick={handleBookClick} />
        <BookRow icon={<Swords className="text-slate-400 w-6 h-6" />} title="Epic Fantasy" books={fantasy} isLoading={loading} onBookClick={handleBookClick} />
      </div>
    </div>
  );
}
