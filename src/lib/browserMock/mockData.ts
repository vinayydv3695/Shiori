import type { Book, BookSummary, MangaSeries, Shelf, Tag, Chapter, TocEntry } from '../tauri';

// Helper to generate dynamic SVG cover data URIs
export function generateCoverSvg(
  title: string,
  author: string,
  type: 'book' | 'manga' = 'book',
  themeColor: string = '#3b82f6'
): string {
  const isManga = type === 'manga';
  const badgeText = isManga ? 'MANGA' : 'EPUB';
  
  // Clean text for SVG
  const safeTitle = title.replace(/[<>&'"]/g, '');
  const safeAuthor = author.replace(/[<>&'"]/g, '');

  // Deterministic palette based on title hash
  const hash = safeTitle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palettes = isManga
    ? [
        { bg1: '#18181b', bg2: '#09090b', accent: '#a3e635', foil: '#d9f99d', label: 'VOLUME 01' },
        { bg1: '#311042', bg2: '#120520', accent: '#c084fc', foil: '#f3e8ff', label: 'CHAPTER SERIES' },
        { bg1: '#172554', bg2: '#030712', accent: '#38bdf8', foil: '#e0f2fe', label: 'SHONEN ACTION' },
        { bg1: '#4c0519', bg2: '#1c0209', accent: '#fb7185', foil: '#ffe4e6', label: 'DARK FANTASY' },
      ]
    : [
        { bg1: '#0f172a', bg2: '#020617', accent: '#f59e0b', foil: '#fef3c7', label: '✦ SHIORI CLASSICS ✦' },
        { bg1: '#1e1b4b', bg2: '#090524', accent: '#60a5fa', foil: '#dbeafe', label: '✦ PREMIER EDITION ✦' },
        { bg1: '#022c22', bg2: '#01140e', accent: '#34d399', foil: '#d1fae5', label: '✦ ORIGINAL WORK ✦' },
        { bg1: '#451a03', bg2: '#1c0a02', accent: '#fb923c', foil: '#ffedd5', label: '✦ COLLECTOR CUT ✦' },
        { bg1: '#4c0519', bg2: '#230209', accent: '#f43f5e', foil: '#ffe4e6', label: '✦ BESTSELLER ✦' },
      ];

  const palette = palettes[hash % palettes.length];
  const accent = themeColor || palette.accent;

  // Split title into 1-2 lines for balanced typography
  const words = safeTitle.split(' ');
  let line1 = safeTitle;
  let line2 = '';
  if (words.length > 2 && safeTitle.length > 16) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(' ');
    line2 = words.slice(mid).join(' ');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%">
    <defs>
      <linearGradient id="bg-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.bg1}" />
        <stop offset="60%" stop-color="${palette.bg2}" />
        <stop offset="100%" stop-color="#000000" />
      </linearGradient>
      <linearGradient id="spine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(0,0,0,0.6)" />
        <stop offset="50%" stop-color="rgba(255,255,255,0.08)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.4)" />
      </linearGradient>
      <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.25" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Base Cover & Glow -->
    <rect width="100%" height="100%" fill="url(#bg-${hash})" />
    <circle cx="200" cy="300" r="180" fill="url(#centerGlow)" />

    <!-- Elegant Thin Border -->
    <rect x="24" y="24" width="352" height="552" rx="4" fill="none" stroke="${palette.foil}" stroke-opacity="0.25" stroke-width="1.5" />
    <rect x="28" y="28" width="344" height="544" rx="2" fill="none" stroke="${palette.foil}" stroke-opacity="0.1" stroke-width="1" />

    <!-- Top Badge / Label -->
    <text x="200" y="65" fill="${palette.foil}" fill-opacity="0.75" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="2.5">
      ${palette.label}
    </text>

    <!-- Format Pill Top-Right -->
    <rect x="305" y="48" width="55" height="20" rx="10" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-opacity="0.4" stroke-width="1" />
    <text x="332" y="62" fill="${accent}" font-family="system-ui, sans-serif" font-size="9" font-weight="800" text-anchor="middle" letter-spacing="1">${badgeText}</text>

    <!-- Main Title Block (Serif Book typography) -->
    <g transform="translate(200, ${line2 ? 165 : 190})">
      <text x="0" y="0" fill="#ffffff" font-family="Georgia, Cambria, serif" font-size="28" font-weight="bold" text-anchor="middle" letter-spacing="0.5">
        ${line1}
      </text>
      ${line2 ? `
        <text x="0" y="36" fill="#ffffff" font-family="Georgia, Cambria, serif" font-size="24" font-weight="bold" text-anchor="middle" letter-spacing="0.5">
          ${line2}
        </text>
      ` : ''}
    </g>

    <!-- Central Emblem Artwork -->
    <g transform="translate(200, 320)">
      <circle r="52" fill="none" stroke="${palette.foil}" stroke-width="1.5" stroke-opacity="0.4" stroke-dasharray="4 3" />
      <circle r="44" fill="${palette.bg1}" stroke="${accent}" stroke-width="2" stroke-opacity="0.6" />
      ${isManga ? `
        <!-- Manga Shuriken/Star Emblem -->
        <path d="M 0 -26 L 8 -8 L 26 0 L 8 8 L 0 26 L -8 8 L -26 0 L -8 -8 Z" fill="${accent}" />
        <circle r="4" fill="#ffffff" />
      ` : `
        <!-- Classic Book Silhouette -->
        <path d="M -20 -10 C -10 -16 0 -10 0 -3 L 0 20 C 0 14 -10 8 -20 14 Z" fill="${accent}" />
        <path d="M 20 -10 C 10 -16 0 -10 0 -3 L 0 20 C 0 14 10 8 20 14 Z" fill="${accent}" fill-opacity="0.85" />
        <line x1="0" y1="-3" x2="0" y2="20" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.7" />
      `}
    </g>

    <!-- Ornamental Divider Line -->
    <g transform="translate(200, 440)">
      <line x1="-90" y1="0" x2="-20" y2="0" stroke="${palette.foil}" stroke-opacity="0.3" stroke-width="1" />
      <polygon points="0,-4 4,0 0,4 -4,0" fill="${palette.foil}" fill-opacity="0.7" />
      <line x1="20" y1="0" x2="90" y2="0" stroke="${palette.foil}" stroke-opacity="0.3" stroke-width="1" />
    </g>

    <!-- Author Name in Spaced Caps -->
    <text x="200" y="485" fill="${palette.foil}" fill-opacity="0.9" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" text-anchor="middle" letter-spacing="2">
      ${safeAuthor.toUpperCase()}
    </text>

    <!-- Real Book Spine Depth / Shadow (Left Edge) -->
    <rect x="0" y="0" width="22" height="600" fill="url(#spine)" />
    <line x1="22" y1="0" x2="22" y2="600" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate realistic manga pages for manga reader
export function generateMangaPageSvg(title: string, chapterTitle: string, pageNum: number, totalPages: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="100%" height="100%">
    <defs>
      <pattern id="halftone" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="1.5" fill="#e4e4e7" />
      </pattern>
    </defs>
    <!-- Page Background -->
    <rect width="100%" height="100%" fill="#ffffff" />
    <rect width="100%" height="100%" fill="url(#halftone)" />

    <!-- Outer Manga Frame -->
    <rect x="40" y="50" width="720" height="1100" fill="none" stroke="#18181b" stroke-width="4" />

    <!-- Top Panel -->
    <rect x="55" y="70" width="690" height="320" fill="#ffffff" stroke="#18181b" stroke-width="3" />
    <text x="400" y="200" fill="#27272a" font-family="system-ui, sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="2">
      ${title.toUpperCase()}
    </text>
    <text x="400" y="240" fill="#71717a" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle">
      ${chapterTitle} — PAGE ${pageNum}
    </text>

    <!-- Sound Effect (SFX) -->
    <text x="180" y="160" fill="#000000" font-family="serif" font-size="64" font-weight="900" transform="rotate(-15, 180, 160)" opacity="0.85">
      ドドド
    </text>

    <!-- Middle Split Panels -->
    <rect x="55" y="410" width="335" height="380" fill="#ffffff" stroke="#18181b" stroke-width="3" />
    <circle cx="220" cy="580" r="80" fill="#f4f4f5" stroke="#18181b" stroke-width="2" />
    <text x="220" y="590" fill="#18181b" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">SCENE A</text>

    <rect x="410" y="410" width="335" height="380" fill="#ffffff" stroke="#18181b" stroke-width="3" />
    <path d="M 450 500 L 700 700 M 700 500 L 450 700" stroke="#a1a1aa" stroke-width="2" stroke-dasharray="4 4" />
    <text x="575" y="600" fill="#18181b" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">ACTION PANEL</text>

    <!-- Bottom Wide Panel -->
    <rect x="55" y="810" width="690" height="320" fill="#ffffff" stroke="#18181b" stroke-width="3" />
    <text x="400" y="960" fill="#18181b" font-family="serif" font-size="22" font-style="italic" text-anchor="middle">
      "The journey continues... Stay tuned for the next revelation."
    </text>

    <!-- Page Number Footer -->
    <text x="400" y="1175" fill="#71717a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">
      - ${pageNum} / ${totalPages} -
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Initial Mock Tags (matching Android UI categories in Fig 1)
export const INITIAL_TAGS: Tag[] = [
  { id: 1, name: 'Motivational', color: '#f59e0b' },
  { id: 2, name: 'Poetry', color: '#ec4899' },
  { id: 3, name: 'Fiction', color: '#3b82f6' },
  { id: 4, name: 'Fantasy', color: '#8b5cf6' },
  { id: 5, name: 'Sci-Fi', color: '#06b6d4' },
  { id: 6, name: 'Classic', color: '#10b981' },
  { id: 7, name: 'Action', color: '#ef4444' },
];

// Initial Mock Shelves
export const INITIAL_SHELVES: Shelf[] = [
  {
    id: 1,
    name: 'Currently Reading',
    description: 'Books and manga actively in progress',
    shelfType: 'regular',
    isSmart: false,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    children: [],
  },
  {
    id: 2,
    name: 'All-Time Favorites',
    description: 'Top-tier masterpieces',
    shelfType: 'favorites',
    isSmart: false,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    children: [],
  },
  {
    id: 3,
    name: 'Manga Corner',
    description: 'Weekly chapters and series collections',
    shelfType: 'regular',
    isSmart: false,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    children: [],
  },
];

// Initial Mock Books (EPUBs / PDFs) - Matching Android Home CoverFlow & Continue Reading (Fig 1)
export const INITIAL_BOOKS: Book[] = [
  {
    id: 1,
    uuid: 'mock-book-hp-1',
    title: 'Harry Potter 1 - Harry Potter and the Sorcerer’s Stone',
    authors: [{ id: 1, name: 'J. K. Rowling' }],
    tags: [INITIAL_TAGS[0], INITIAL_TAGS[1], INITIAL_TAGS[2], INITIAL_TAGS[3]],
    file_path: '/mock/books/harry_potter_1.epub',
    file_format: 'epub',
    file_size: 4200000,
    cover_path: generateCoverSvg('Harry Potter 1', 'J. K. Rowling', 'book', '#d97706'),
    rating: 5,
    language: 'en',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    reading_status: 'reading',
    is_favorite: false,
    domain: 'books',
    page_count: 309,
    publisher: 'Scholastic',
    pubdate: '1997',
  },
  {
    id: 2,
    uuid: 'mock-book-2',
    title: 'Project Hail Mary',
    authors: [{ id: 2, name: 'Andy Weir' }],
    tags: [INITIAL_TAGS[1]],
    file_path: '/mock/books/project_hail_mary.epub',
    file_format: 'epub',
    file_size: 3200000,
    cover_path: generateCoverSvg('Project Hail Mary', 'Andy Weir', 'book', '#10b981'),
    rating: 5,
    language: 'en',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    reading_status: 'reading',
    is_favorite: true,
    domain: 'books',
    page_count: 496,
    publisher: 'Ballantine Books',
    pubdate: '2021',
  },
  {
    id: 3,
    uuid: 'mock-book-3',
    title: 'Dune',
    authors: [{ id: 3, name: 'Frank Herbert' }],
    tags: [INITIAL_TAGS[1], INITIAL_TAGS[4]],
    file_path: '/mock/books/dune.epub',
    file_format: 'epub',
    file_size: 2800000,
    cover_path: generateCoverSvg('Dune', 'Frank Herbert', 'book', '#f59e0b'),
    rating: 4.5,
    language: 'en',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    reading_status: 'completed',
    is_favorite: false,
    domain: 'books',
    page_count: 688,
    publisher: 'Chilton Books',
    pubdate: '1965',
  },
  {
    id: 4,
    uuid: 'mock-book-4',
    title: 'Atomic Habits',
    authors: [{ id: 4, name: 'James Clear' }],
    tags: [INITIAL_TAGS[5]],
    file_path: '/mock/books/atomic_habits.epub',
    file_format: 'epub',
    file_size: 1950000,
    cover_path: generateCoverSvg('Atomic Habits', 'James Clear', 'book', '#ec4899'),
    rating: 4.5,
    language: 'en',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    reading_status: 'completed',
    is_favorite: true,
    domain: 'books',
    page_count: 320,
    publisher: 'Avery',
    pubdate: '2018',
  },
  {
    id: 5,
    uuid: 'mock-book-5',
    title: 'Clean Architecture',
    authors: [{ id: 5, name: 'Robert C. Martin' }],
    tags: [INITIAL_TAGS[4]],
    file_path: '/mock/books/clean_architecture.pdf',
    file_format: 'pdf',
    file_size: 8900000,
    cover_path: generateCoverSvg('Clean Architecture', 'Robert C. Martin', 'book', '#6366f1'),
    rating: 4,
    language: 'en',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    reading_status: 'plan_to_read',
    is_favorite: false,
    domain: 'books',
    page_count: 432,
    publisher: 'Prentice Hall',
    pubdate: '2017',
  },
];

// Initial Mock Manga Series
export const INITIAL_MANGA_SERIES: MangaSeries[] = [
  {
    id: 1,
    title: 'Solo Leveling',
    sort_title: 'Solo Leveling',
    cover_path: generateCoverSvg('Solo Leveling', 'Chugong', 'manga', '#8b5cf6'),
    status: 'Ongoing',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
  },
  {
    id: 2,
    title: 'Frieren: Beyond Journey’s End',
    sort_title: 'Frieren: Beyond Journey’s End',
    cover_path: generateCoverSvg('Frieren', 'Kanehito Yamada', 'manga', '#06b6d4'),
    status: 'Ongoing',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
  },
  {
    id: 3,
    title: 'One Piece',
    sort_title: 'One Piece',
    cover_path: generateCoverSvg('One Piece', 'Eiichiro Oda', 'manga', '#ef4444'),
    status: 'Ongoing',
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
  },
];

// Initial Manga Books (Volumes)
export const INITIAL_MANGA_BOOKS: Book[] = [
  {
    id: 101,
    uuid: 'mock-manga-1',
    title: 'Solo Leveling - Vol. 1',
    series: 'Solo Leveling',
    series_index: 1,
    authors: [{ id: 10, name: 'Chugong' }, { id: 11, name: 'DUBU' }],
    tags: [INITIAL_TAGS[2], INITIAL_TAGS[0], INITIAL_TAGS[6]],
    file_path: '/mock/manga/solo_leveling_v01.cbz',
    file_format: 'cbz',
    file_size: 42000000,
    cover_path: generateCoverSvg('Solo Leveling 01', 'Chugong', 'manga', '#8b5cf6'),
    rating: 5,
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    reading_status: 'reading',
    is_favorite: true,
    domain: 'manga_comics',
    page_count: 24,
  },
  {
    id: 102,
    uuid: 'mock-manga-2',
    title: 'Solo Leveling - Vol. 2',
    series: 'Solo Leveling',
    series_index: 2,
    authors: [{ id: 10, name: 'Chugong' }],
    tags: [INITIAL_TAGS[2], INITIAL_TAGS[0]],
    file_path: '/mock/manga/solo_leveling_v02.cbz',
    file_format: 'cbz',
    file_size: 44000000,
    cover_path: generateCoverSvg('Solo Leveling 02', 'Chugong', 'manga', '#8b5cf6'),
    rating: 5,
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    reading_status: 'plan_to_read',
    is_favorite: true,
    domain: 'manga_comics',
    page_count: 24,
  },
  {
    id: 103,
    uuid: 'mock-manga-3',
    title: 'Frieren: Beyond Journey’s End - Vol. 1',
    series: 'Frieren: Beyond Journey’s End',
    series_index: 1,
    authors: [{ id: 12, name: 'Kanehito Yamada' }],
    tags: [INITIAL_TAGS[0], INITIAL_TAGS[3]],
    file_path: '/mock/manga/frieren_v01.cbz',
    file_format: 'cbz',
    file_size: 38000000,
    cover_path: generateCoverSvg('Frieren 01', 'Kanehito Yamada', 'manga', '#06b6d4'),
    rating: 5,
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
    last_opened: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    reading_status: 'reading',
    is_favorite: true,
    domain: 'manga_comics',
    page_count: 24,
  },
  {
    id: 104,
    uuid: 'mock-manga-4',
    title: 'One Piece - Vol. 1 Romance Dawn',
    series: 'One Piece',
    series_index: 1,
    authors: [{ id: 13, name: 'Eiichiro Oda' }],
    tags: [INITIAL_TAGS[2], INITIAL_TAGS[3]],
    file_path: '/mock/manga/one_piece_v01.cbz',
    file_format: 'cbz',
    file_size: 55000000,
    cover_path: generateCoverSvg('One Piece 01', 'Eiichiro Oda', 'manga', '#ef4444'),
    rating: 5,
    added_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    reading_status: 'completed',
    is_favorite: false,
    domain: 'manga_comics',
    page_count: 24,
  },
];

// Mock Reading Progress
export const INITIAL_PROGRESS: Record<number, any> = {
  1: {
    bookId: 1,
    currentLocation: 'chapter_4:scroll_0.27',
    progressPercent: 27,
    currentPage: 83,
    totalPages: 309,
    cfiLocation: 'epubcfi(/6/8[chap4]!/4/2/1:0)',
    lastRead: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  2: {
    bookId: 2,
    currentLocation: 'chapter_2:scroll_0.75',
    progressPercent: 78,
    currentPage: 386,
    totalPages: 496,
    cfiLocation: 'epubcfi(/6/6[chap2]!/4/2/1:0)',
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  101: {
    bookId: 101,
    currentLocation: 'page_15',
    progressPercent: 62,
    currentPage: 15,
    totalPages: 24,
    lastRead: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  103: {
    bookId: 103,
    currentLocation: 'page_8',
    progressPercent: 33,
    currentPage: 8,
    totalPages: 24,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
};

// Mock EPUB Chapters Generator
export function getMockEpubChapter(bookId: number, chapterIndex: number): Chapter {
  const titles = [
    'Prologue: To Kill',
    'Chapter 1: Stormblessed',
    'Chapter 2: Honor is Dead',
    'Chapter 3: Words of Radiance',
    'Chapter 4: The Shattered Plains',
    'Chapter 5: The King\'s Wit',
  ];

  const title = titles[chapterIndex] || `Chapter ${chapterIndex + 1}`;

  const content = `
    <div class="epub-chapter-container p-6 space-y-6 max-w-2xl mx-auto font-serif">
      <h1 class="text-3xl font-bold tracking-tight mb-8 text-foreground">${title}</h1>
      <p class="leading-relaxed text-lg text-foreground/90 indent-8">
        The storm was an ancient, furious thing that tore across the jagged cliffs of the shattered plains. Lightning danced along the obsidian ridges, bathing the chasms in brilliant, momentary flashes of stark violet and blinding white.
      </p>
      <p class="leading-relaxed text-lg text-foreground/90 indent-8">
        Kaladin crouched against the stone, pulling his threadbare coat tightly around his trembling shoulders. The wind howled like a pack of starving beasts, tearing at his hair and spitting stinging needles of rain across his battered face.
      </p>
      <blockquote class="my-8 border-l-4 border-primary pl-6 py-2 italic text-muted-foreground bg-primary/5 rounded-r-lg">
        "Life before death. Strength before weakness. Journey before destination."
      </blockquote>
      <p class="leading-relaxed text-lg text-foreground/90 indent-8">
        He whispered the old words, feeling a faint, warm prickle of light beneath his skin. It wasn't despair that weighed on him, nor was it fear of the chasmfiends lurking in the dark below. It was the solemn duty to protect those who could not protect themselves.
      </p>
      <p class="leading-relaxed text-lg text-foreground/90 indent-8">
        The highstorm raged on, yet in the eye of the tempest, a quiet resolve settled within him. The spear was not merely a weapon of destruction; it was a beacon, a line carved into the stone between the innocent and the dark.
      </p>
    </div>
  `;

  return {
    index: chapterIndex,
    title,
    content,
    location: `chapter_${chapterIndex}:scroll_0`,
  };
}

export function getMockEpubToc(): TocEntry[] {
  return [
    { label: 'Prologue: To Kill', location: 'chapter_0', level: 1, children: [] },
    { label: 'Chapter 1: Stormblessed', location: 'chapter_1', level: 1, children: [] },
    { label: 'Chapter 2: Honor is Dead', location: 'chapter_2', level: 1, children: [] },
    { label: 'Chapter 3: Words of Radiance', location: 'chapter_3', level: 1, children: [] },
    { label: 'Chapter 4: The Shattered Plains', location: 'chapter_4', level: 1, children: [] },
    { label: 'Chapter 5: The King\'s Wit', location: 'chapter_5', level: 1, children: [] },
  ];
}
