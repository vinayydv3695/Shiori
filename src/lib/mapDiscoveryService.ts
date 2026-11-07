import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/tauri';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { proxyExternalCover } from '@/lib/utils';

export interface DiscoveredMap {
  id: string;
  title: string;
  imageUrl: string;
  source: string;
  thumbnail?: string;
  description?: string;
}

export interface GeneratedRealmMap {
  title: string;
  imageUrl: string;
  defaultPins: Array<{
    label: string;
    notes: string;
    xPercent: number;
    yPercent: number;
    color: string;
  }>;
}

/**
 * Normalizes any image URL or local filesystem path so it can be safely rendered
 * inside an <img> tag in Tauri WebViews (desktop/mobile) or browsers.
 * Automatically routes hotlink-protected CDNs (e.g. Fandom/Wikia) through shiori-proxy.
 */
export function normalizeMapImageUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();

  // Strip trailing /revision/latest queries from Wikia/Fandom URLs that trigger 404s
  if (trimmed.includes('wikia.nocookie.net') || trimmed.includes('fandom.com')) {
    trimmed = trimmed.replace(/\/revision\/latest.*$/i, '');
  }

  // Already a supported protocol or data URI
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('asset:') ||
    trimmed.startsWith('shiori-epub:') ||
    trimmed.startsWith('shiori-proxy:')
  ) {
    return trimmed;
  }

  // HTTP / HTTPS URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Route Fandom / Wikia through local shiori-proxy to bypass referer blocks & 404s
    if (trimmed.includes('wikia.nocookie.net') || trimmed.includes('fandom.com')) {
      try {
        return proxyExternalCover(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  // Local filesystem path (Linux/macOS starts with '/', Windows with 'C:\' etc.)
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    try {
      const normalizedPath = trimmed.replace(/\\/g, '/');
      return convertFileSrc(normalizedPath);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Robust fetch routing through Tauri HTTP plugin to eliminate CORS in WebView
 */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Shiori-Reader/1.0.28 (https://github.com/vinayydv3695/Shiori)',
    ...((init?.headers as Record<string, string>) || {}),
  };

  if (isTauri) {
    try {
      return await tauriFetch(url, { ...init, headers });
    } catch (err) {
      console.warn('[mapDiscoveryService] tauriFetch failed, falling back to window.fetch:', err);
    }
  }
  return fetch(url, { ...init, headers });
}

/**
 * Curated directory of canonical world maps for beloved fantasy & sci-fi book series.
 * Clean direct CDN URLs without broken revision suffixes.
 */
const CURATED_FRANCHISE_MAPS: Record<string, DiscoveredMap[]> = {
  rezero: [
    {
      id: 'rezero-world-map',
      title: 'The World of Re:ZERO (Lugnica, Vollachia, Kararagi, Gusteko)',
      imageUrl: 'https://static.wikia.nocookie.net/rezero/images/0/08/ReZero_world_map.jpg',
      source: 'Re:Zero Official Lore Archive',
      thumbnail: 'https://static.wikia.nocookie.net/rezero/images/0/08/ReZero_world_map.jpg',
      description: 'Canonical map of the flat world divided into the Four Great Nations surrounded by the Great Waterfall.',
    },
    {
      id: 'rezero-lugnica-royal',
      title: 'Kingdom of Lugnica (Capital & Royal Domain)',
      imageUrl: 'https://static.wikia.nocookie.net/rezero/images/2/27/Kingdom_of_Lugunica_Map.jpg',
      source: 'Re:Zero Official Lore Archive',
      thumbnail: 'https://static.wikia.nocookie.net/rezero/images/2/27/Kingdom_of_Lugunica_Map.jpg',
      description: 'The Dragon Kingdom of Lugnica, seat of the Royal Selection and Subaru\'s starting journey.',
    },
    {
      id: 'rezero-world-illustrated',
      title: 'The Great Waterfall & Borderlands (Illustrated)',
      imageUrl: 'https://static.wikia.nocookie.net/rezero/images/7/79/World_Map_Illustrated.png',
      source: 'Re:Zero Official Lore Archive',
      thumbnail: 'https://static.wikia.nocookie.net/rezero/images/7/79/World_Map_Illustrated.png',
      description: 'Illustrated world topography showing Gusteko snowfields, Vollachia borders, and the Great Waterfall.',
    },
  ],
  lotr: [
    {
      id: 'middle-earth-classic',
      title: 'Map of Middle-earth (Third Age)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7d/Linguistic_Map_of_Middle-Earth_ms.svg',
      source: 'Wikimedia Commons / Tolkien Estate',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Linguistic_Map_of_Middle-Earth_ms.svg/800px-Linguistic_Map_of_Middle-Earth_ms.svg.png',
      description: 'The realm of Middle-earth: The Shire, Gondor, Mordor, Rohan, and the Misty Mountains.',
    },
  ],
  asoiaf: [
    {
      id: 'westeros-essos',
      title: 'The Known World (Westeros & Essos)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/A_Song_of_Ice_and_Fire_world_map.svg/1920px-A_Song_of_Ice_and_Fire_world_map.svg.png',
      source: 'A Song of Ice and Fire / George R.R. Martin',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/A_Song_of_Ice_and_Fire_world_map.svg/800px-A_Song_of_Ice_and_Fire_world_map.svg.png',
      description: 'The Seven Kingdoms of Westeros, The Wall, King\'s Landing, and the Free Cities of Essos.',
    },
  ],
  dune: [
    {
      id: 'arrakis-polar',
      title: 'Planisphere of Arrakis (Dune)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Arrakis_polar_projection_map.svg/1600px-Arrakis_polar_projection_map.svg.png',
      source: 'Frank Herbert / Dune Universe',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Arrakis_polar_projection_map.svg/800px-Arrakis_polar_projection_map.svg.png',
      description: 'Polar projection map of Arrakis detailing the Shield Wall, Arrakeen, and the deep desert expanse.',
    },
  ],
  stormlight: [
    {
      id: 'roshar-world',
      title: 'The Continent of Roshar',
      imageUrl: 'https://coppermind.net/w/images/Roshar_Map.jpg',
      source: 'Brandon Sanderson / The Coppermind',
      thumbnail: 'https://coppermind.net/w/images/Roshar_Map.jpg',
      description: 'High-resolution realm map of Roshar: Alethkar, Jah Keved, the Shattered Plains, and the Frostlands.',
    },
  ],
  witcher: [
    {
      id: 'witcher-continent',
      title: 'The Continent (The Witcher)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Witcher_world_map.svg/1920px-Witcher_world_map.svg.png',
      source: 'Andrzej Sapkowski / Witcher Lore',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Witcher_world_map.svg/800px-Witcher_world_map.svg.png',
      description: 'The Northern Kingdoms (Redania, Temeria, Kaedwen) and the Nilfgaardian Empire.',
    },
  ],
  wheel: [
    {
      id: 'wheel-of-time-westlands',
      title: 'The Westlands (The Wheel of Time)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Wheel_of_Time_map.svg/1920px-Wheel_of_Time_map.svg.png',
      source: 'Robert Jordan / Wheel of Time Lore',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Wheel_of_Time_map.svg/800px-Wheel_of_Time_map.svg.png',
      description: 'Map of the Westlands: Two Rivers, Tar Valon, Tear, Cairhien, and the Blight.',
    },
  ],
};

/**
 * Extracts a normalized franchise search key from a full book title.
 * e.g. "Re:ZERO Starting Life in Another World Short Story Collection, Vol. 4" -> "rezero"
 */
export function extractFranchiseKey(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('re:zero') || lower.includes('rezero') || lower.includes('starting life in another world')) {
    return 'rezero';
  }
  if (lower.includes('middle-earth') || lower.includes('lord of the rings') || lower.includes('hobbit') || lower.includes('tolkien') || lower.includes('silmarillion')) {
    return 'lotr';
  }
  if (lower.includes('ice and fire') || lower.includes('game of thrones') || lower.includes('westeros') || lower.includes('clash of kings') || lower.includes('storm of swords')) {
    return 'asoiaf';
  }
  if (lower.includes('dune') || lower.includes('arrakis') || lower.includes('muad\'dib') || lower.includes('paul atreides')) {
    return 'dune';
  }
  if (lower.includes('stormlight') || lower.includes('way of kings') || lower.includes('words of radiance') || lower.includes('oathbringer') || lower.includes('rhythm of war')) {
    return 'stormlight';
  }
  if (lower.includes('witcher') || lower.includes('geralt') || lower.includes('last wish') || lower.includes('blood of elves')) {
    return 'witcher';
  }
  if (lower.includes('wheel of time') || lower.includes('eye of the world') || lower.includes('great hunt')) {
    return 'wheel';
  }
  return '';
}

/**
 * Searches online sources (Curated directory, Wikimedia Commons, Wikipedia)
 * for high-resolution realm maps matching the book title.
 */
export async function searchOnlineBookMaps(bookTitle: string): Promise<DiscoveredMap[]> {
  const results: DiscoveredMap[] = [];

  // 1. Check curated directory first for instant instant-match
  const key = extractFranchiseKey(bookTitle);
  if (key && CURATED_FRANCHISE_MAPS[key]) {
    results.push(...CURATED_FRANCHISE_MAPS[key]);
  }

  // Clean title for search: strip volume numbers, subtitles, etc.
  const cleanTitle = bookTitle
    .replace(/(?:short story collection|volume|vol\.|chapter|book|no\.|part)\s*\d+/gi, '')
    .replace(/[–—\-:].*$/, '')
    .trim();

  // 2. Query Wikimedia Commons API for community cartography
  try {
    const searchTerms = [`${cleanTitle} map`, `${cleanTitle} world map`];
    for (const term of searchTerms) {
      if (results.length >= 6) break;
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;
      const res = await safeFetch(url);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        query?: {
          pages?: Record<string, { title: string; imageinfo?: Array<{ url: string; mime?: string }> }>;
        };
      };

      if (data.query?.pages) {
        for (const page of Object.values(data.query.pages)) {
          const info = page.imageinfo?.[0];
          if (!info?.url) continue;
          const mime = info.mime?.toLowerCase() || '';
          if (!mime.includes('image') && !info.url.match(/\.(jpg|jpeg|png|svg|webp)$/i)) continue;

          const readableTitle = page.title
            .replace(/^File:/i, '')
            .replace(/\.[^.]+$/, '')
            .replace(/_/g, ' ');

          // Avoid duplicates
          if (!results.some((r) => r.imageUrl === info.url)) {
            results.push({
              id: `commons-${page.title}`,
              title: readableTitle,
              imageUrl: info.url,
              source: 'Wikimedia Commons',
              thumbnail: info.url,
              description: `Discovered cartography asset for "${cleanTitle}".`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[mapDiscoveryService] Wikimedia search error:', err);
  }

  return results;
}

/**
 * Simple pseudo-random generator seeded by string for deterministic map generation
 */
function createSeededRandom(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Procedurally generates an exquisite antique fantasy parchment realm map SVG
 * tailored specifically to the book's title and world.
 */
export function generateProceduralRealmMap(bookTitle: string): GeneratedRealmMap {
  const rand = createSeededRandom(bookTitle || 'World');
  const cleanTitle = (bookTitle || '')
    .replace(/\s*[–—]\s*.*$/, '')
    .replace(/(?:short story collection|volume|vol\.|chapter|book|no\.|part)\s*\d+/gi, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
  const realmName = cleanTitle ? `${cleanTitle.toUpperCase()} REALM` : 'TERRA INCOGNITA';

  const width = 1600;
  const height = 1000;

  // Generate continent coastline coordinates
  const cx = width / 2;
  const cy = height / 2;
  const numPoints = 28;
  const polyPoints: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const baseRadiusX = 480 + rand() * 180;
    const baseRadiusY = 320 + rand() * 140;
    const px = Math.round(cx + Math.cos(angle) * baseRadiusX);
    const py = Math.round(cy + Math.sin(angle) * baseRadiusY);
    polyPoints.push({ x: px, y: py });
  }

  // Smooth SVG path for continent
  let continentPath = `M ${polyPoints[0].x} ${polyPoints[0].y}`;
  for (let i = 0; i < polyPoints.length; i++) {
    const curr = polyPoints[i];
    const next = polyPoints[(i + 1) % polyPoints.length];
    const mx = Math.round((curr.x + next.x) / 2);
    const my = Math.round((curr.y + next.y) / 2);
    continentPath += ` Q ${curr.x} ${curr.y}, ${mx} ${my}`;
  }
  continentPath += ' Z';

  // Generate mountain ranges (classic triangular peak hatching)
  const mountainPeaks: string[] = [];
  const startX = cx - 240 + rand() * 80;
  const startY = cy - 140 + rand() * 60;
  const numPeaks = 18;

  for (let i = 0; i < numPeaks; i++) {
    const mx = Math.round(startX + (i * 26) + (rand() * 14 - 7));
    const my = Math.round(startY + Math.sin(i * 0.4) * 80 + (rand() * 20 - 10));
    const peakH = Math.round(28 + rand() * 18);
    const baseW = Math.round(18 + rand() * 8);

    // Peak triangle + ridge line
    mountainPeaks.push(
      `<polygon points="${mx},${my - peakH} ${mx - baseW},${my} ${mx + baseW},${my}" fill="#dfd0b6" stroke="#5a4228" stroke-width="2"/>` +
      `<line x1="${mx}" y1="${my - peakH}" x2="${mx + 3}" y2="${my}" stroke="#48331e" stroke-width="1.5"/>`
    );
  }

  // Generate rivers from mountains to sea
  const rivers: string[] = [];
  const river1End = polyPoints[7];
  rivers.push(
    `<path d="M ${Math.round(startX + 80)} ${Math.round(startY)} Q ${Math.round(cx + 60)} ${Math.round(cy + 80)}, ${river1End.x} ${river1End.y}" fill="none" stroke="#688ca8" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="300" stroke-dashoffset="0"/>`
  );
  const river2End = polyPoints[18];
  rivers.push(
    `<path d="M ${Math.round(startX + 180)} ${Math.round(startY + 40)} Q ${Math.round(cx - 100)} ${Math.round(cy + 120)}, ${river2End.x} ${river2End.y}" fill="none" stroke="#688ca8" stroke-width="2" stroke-linecap="round"/>`
  );

  // Generate forest clusters (stylized antique trees)
  const trees: string[] = [];
  for (let f = 0; f < 24; f++) {
    const tx = Math.round(cx - 300 + rand() * 200);
    const ty = Math.round(cy - 60 + rand() * 160);
    trees.push(
      `<circle cx="${tx}" cy="${ty - 8}" r="8" fill="#b9c4a8" stroke="#4a5839" stroke-width="1.5"/>` +
      `<line x1="${tx}" y1="${ty}" x2="${tx}" y2="${ty + 4}" stroke="#4a3723" stroke-width="1.5"/>`
    );
  }

  // Pre-placed landmark pins for the book
  const defaultPins = [
    {
      label: 'Capital Citadel',
      notes: 'The seat of royalty, grand archives, and central hub of the realm.',
      xPercent: 51,
      yPercent: 47,
      color: '#f59e0b',
    },
    {
      label: 'Dragon\'s Tooth Ridge',
      notes: 'Jagged mountain barrier separating the inner territories from the untamed wild.',
      xPercent: 36,
      yPercent: 38,
      color: '#f43f5e',
    },
    {
      label: 'Whispering Estuary',
      notes: 'Ancient coastal port where foreign merchant fleets and travelers embark.',
      xPercent: 68,
      yPercent: 56,
      color: '#0284c7',
    },
    {
      label: 'Eldergrove Sanctuary',
      notes: 'Lush primeval woodland holding sacred spirits, shrines, and hidden sanctuaries.',
      xPercent: 30,
      yPercent: 54,
      color: '#10b981',
    },
    {
      label: 'Frontier Watchtower',
      notes: 'Isolated military outpost guarding against beasts from the outer expanse.',
      xPercent: 72,
      yPercent: 32,
      color: '#a855f7',
    },
  ];

  // SVG Markup with full antique cartography aesthetic
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Parchment paper texture gradient -->
    <radialGradient id="parchment" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#FAF4E8"/>
      <stop offset="65%" stop-color="#F1E7D0"/>
      <stop offset="100%" stop-color="#DFD0B5"/>
    </radialGradient>

    <!-- Ocean water gradient -->
    <radialGradient id="ocean" cx="50%" cy="50%" r="80%">
      <stop offset="0%" stop-color="#E8E2D2"/>
      <stop offset="70%" stop-color="#D8CDB6"/>
      <stop offset="100%" stop-color="#CBBFA2"/>
    </radialGradient>

    <!-- Compass Rose Gradient -->
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b8860b"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#8b6914"/>
    </linearGradient>

    <!-- Vignette shadow filter -->
    <filter id="ink-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#3d2c1d" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Base Sea / Ocean Background -->
  <rect width="${width}" height="${height}" fill="url(#ocean)"/>

  <!-- Ocean Waves & Currents Texture -->
  <g stroke="#9f927b" stroke-width="0.8" opacity="0.4" fill="none">
    <path d="M 80,140 Q 110,132 140,140 M 160,140 Q 190,132 220,140" />
    <path d="M 1200,180 Q 1230,172 1260,180 M 1280,180 Q 1310,172 1340,180" />
    <path d="M 1150,780 Q 1180,772 1210,780 M 1230,780 Q 1260,772 1290,780" />
    <path d="M 140,820 Q 170,812 200,820 M 220,820 Q 250,812 280,820" />
  </g>

  <!-- Shallow Water Coastline Rings (Contour lines) -->
  <path d="${continentPath}" fill="none" stroke="#b0a289" stroke-width="14" stroke-opacity="0.35"/>
  <path d="${continentPath}" fill="none" stroke="#c0b39c" stroke-width="6" stroke-opacity="0.5"/>

  <!-- Main Continental Landmass -->
  <path d="${continentPath}" fill="url(#parchment)" stroke="#4a3723" stroke-width="3" filter="url(#ink-shadow)"/>

  <!-- Coastline hatching / stippling -->
  <path d="${continentPath}" fill="none" stroke="#7d674e" stroke-width="1.2" stroke-dasharray="3,4"/>

  <!-- Mountain Ranges -->
  <g id="mountains">
    ${mountainPeaks.join('\n')}
  </g>

  <!-- River Networks -->
  <g id="rivers">
    ${rivers.join('\n')}
  </g>

  <!-- Primeval Forests -->
  <g id="forests">
    ${trees.join('\n')}
  </g>

  <!-- Compass Rose (Top Right) -->
  <g transform="translate(1380, 220) scale(1.1)" filter="url(#ink-shadow)">
    <!-- Outer ring -->
    <circle cx="0" cy="0" r="64" fill="none" stroke="#6b5338" stroke-width="2"/>
    <circle cx="0" cy="0" r="58" fill="none" stroke="#6b5338" stroke-width="1" stroke-dasharray="2,3"/>
    <circle cx="0" cy="0" r="18" fill="#FAF4E8" stroke="#6b5338" stroke-width="1.5"/>

    <!-- 4 Cardinal Points -->
    <polygon points="0,-72 8,-16 0,0" fill="#8B6914"/>
    <polygon points="0,-72 -8,-16 0,0" fill="#d4af37"/>

    <polygon points="0,72 8,16 0,0" fill="#d4af37"/>
    <polygon points="0,72 -8,16 0,0" fill="#8B6914"/>

    <polygon points="72,0 16,8 0,0" fill="#8B6914"/>
    <polygon points="72,0 16,-8 0,0" fill="#d4af37"/>

    <polygon points="-72,0 -16,8 0,0" fill="#d4af37"/>
    <polygon points="-72,0 -16,-8 0,0" fill="#8B6914"/>

    <!-- 4 Ordinal Points -->
    <polygon points="46,-46 12,-4 0,0" fill="#a4843d"/>
    <polygon points="-46,-46 -12,-4 0,0" fill="#755a23"/>
    <polygon points="46,46 12,4 0,0" fill="#755a23"/>
    <polygon points="-46,46 -12,4 0,0" fill="#a4843d"/>

    <!-- North marker -->
    <text x="0" y="-82" text-anchor="middle" font-family="serif" font-weight="bold" font-size="20" fill="#4a3723">N</text>
    <text x="0" y="96" text-anchor="middle" font-family="serif" font-weight="bold" font-size="16" fill="#6b5338">S</text>
    <text x="88" y="6" text-anchor="middle" font-family="serif" font-weight="bold" font-size="16" fill="#6b5338">E</text>
    <text x="-88" y="6" text-anchor="middle" font-family="serif" font-weight="bold" font-size="16" fill="#6b5338">W</text>
  </g>

  <!-- Ornate Title Cartouche Scroll (Bottom Left) -->
  <g transform="translate(110, 840)" filter="url(#ink-shadow)">
    <!-- Scroll Banner Box -->
    <rect x="0" y="0" width="460" height="96" rx="8" fill="#FBF7EC" stroke="#5a4228" stroke-width="2.5"/>
    <rect x="6" y="6" width="448" height="84" rx="6" fill="none" stroke="#a48a68" stroke-width="1" stroke-dasharray="4,2"/>

    <!-- Flourish corner ornaments -->
    <path d="M 12,18 Q 18,12 26,12 M 448,18 Q 442,12 434,12 M 12,78 Q 18,84 26,84 M 448,78 Q 442,84 434,84" fill="none" stroke="#8B6914" stroke-width="1.5"/>

    <!-- Banner Text -->
    <text x="230" y="42" text-anchor="middle" font-family="serif" font-weight="900" font-size="22" letter-spacing="3" fill="#382816">${realmName}</text>
    <text x="230" y="68" text-anchor="middle" font-family="serif" font-style="italic" font-size="13" letter-spacing="1" fill="#7a6248">Charted Chronicle &amp; Geographical Atlas</text>
  </g>

  <!-- Outer Map Border Frame with coordinate ticks -->
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#4a3723" stroke-width="5"/>
  <rect x="34" y="34" width="${width - 68}" height="${height - 68}" fill="none" stroke="#7a6248" stroke-width="1.5"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="#4a3723" stroke-width="1"/>
</svg>
`.trim();

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return {
    title: `${cleanTitle || 'Fantasy'} Realm Map`,
    imageUrl: dataUrl,
    defaultPins,
  };
}
