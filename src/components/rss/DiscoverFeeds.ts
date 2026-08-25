export interface DiscoverFeedItem {
  title: string;
  url: string;
  description: string;
}

export interface DiscoverCategory {
  category: string;
  feeds: DiscoverFeedItem[];
}

export const DISCOVER_FEEDS: DiscoverCategory[] = [
  {
    category: "Anime, Manga & Light Novels",
    feeds: [
      { title: "Anime News Network", url: "https://www.animenewsnetwork.com/news/rss.xml", description: "The internet's most trusted anime & manga news source." },
      { title: "Crunchyroll News", url: "https://www.crunchyroll.com/news/rss", description: "Official news, simulcast updates, and announcements from Crunchyroll." },
      { title: "MyAnimeList News", url: "https://myanimelist.net/rss/news.xml", description: "Latest anime and manga news from MAL community." },
      { title: "Siliconera", url: "https://www.siliconera.com/feed/", description: "Japanese video game news, light novel localizations, and anime coverage." },
      { title: "Otaku USA Magazine", url: "https://otakuusamagazine.com/feed/", description: "News, reviews, and features about anime, manga, and cosplays." },
      { title: "Sakuga Blog", url: "https://blog.sakugabooru.com/feed/", description: "In-depth analysis of anime animation quality and production behind the scenes." },
      { title: "Anime Herald", url: "https://www.animeherald.com/feed/", description: "Independent news, reviews, and commentary on anime industry." },
      { title: "Tokyo Otaku Mode", url: "https://otakumode.com/news/feed", description: "Japanese pop culture, anime, light novel, and figure releases." },
      { title: "Honey's Anime", url: "https://honeysanime.com/feed/", description: "Anime & manga reviews, recommendations, character lists, and news." },
      { title: "Anime UK News", url: "https://animeuknews.net/feed/", description: "UK-focused anime and manga news, reviews, and release dates." },
      { title: "Manga Bookshelf", url: "http://mangabookshelf.com/feed/", description: "Reviews, commentary, and news on translated manga releases." },
      { title: "Anime Corner", url: "https://animecorner.me/feed/", description: "Anime charts, rankings, news, and seasonal highlights." },
      { title: "Comic Natalie (Anime/Manga - JP)", url: "https://natalie.mu/comic/feed/news", description: "Official Japanese breaking news on manga, anime, and light novels." }
    ]
  },
  {
    category: "Light Novels, Web Novels & Manga Publishing",
    feeds: [
      { title: "J-Novel Club News", url: "https://j-novel.club/rss", description: "Official updates, digital previews, and announcements from J-Novel Club." },
      { title: "Yen Press Blog", url: "https://yenpress.com/feed/", description: "Light novel and manga acquisition announcements from Yen Press." },
      { title: "Seven Seas Entertainment", url: "https://sevenseasentertainment.com/feed/", description: "Manga, webtoons, and light novel licensing releases." },
      { title: "Kodansha USA", url: "https://kodansha.us/feed/", description: "Official manga releases, digital sales, and creator interviews." },
      { title: "Novel Updates (Latest Releases)", url: "https://www.novelupdates.com/rss.php", description: "Community updates for translated Asian web and light novels." },
      { title: "Royal Road (Trending Novels)", url: "https://www.royalroad.com/syndication/fiction/trending", description: "Trending web novels, LitRPG, progression fantasy, and fiction." }
    ]
  },
  {
    category: "Comics, Graphic Novels & Webcomics",
    feeds: [
      { title: "Comic Book Resources (CBR)", url: "https://www.cbr.com/feed/", description: "Comic book news, superhero reviews, industry interviews, and comic previews." },
      { title: "Bleeding Cool", url: "https://bleedingcool.com/comics/feed/", description: "Breaking comic book, manga, movie, and collector news." },
      { title: "The Beat (ComicsBeat)", url: "https://www.comicsbeat.com/feed/", description: "The news blog of comics, graphic novels, webcomics, and visual storytelling." },
      { title: "AIPT Comics", url: "https://aiptcomics.com/feed/", description: "Comic reviews, manga previews, pop culture, and gaming." },
      { title: "Multiversity Comics", url: "https://www.multiversitycomics.com/feed/", description: "In-depth comic reviews, interviews, and creator spotlights." },
      { title: "Comics Alliance", url: "https://comicsalliance.com/feed/", description: "Celebrating comic books, graphic novels, and fan culture." },
      { title: "Webtoon News", url: "https://www.webtoons.com/en/notice/rss", description: "Official news and series spotlight for Webtoon creators and readers." }
    ]
  },
  {
    category: "Gaming, Esports & Game Dev",
    feeds: [
      { title: "IGN News", url: "https://feeds.feedburner.com/ign/news", description: "Video game reviews, news, trailers, and walkthroughs." },
      { title: "Kotaku", url: "https://kotaku.com/rss", description: "Gaming news, guides, culture, and gaming tips." },
      { title: "Polygon", url: "https://www.polygon.com/rss/index.xml", description: "Gaming news, reviews, tabletop games, and entertainment culture." },
      { title: "Eurogamer", url: "https://www.eurogamer.net/feed", description: "Video game news, in-depth reviews, digital foundry, and features." },
      { title: "GameSpot", url: "https://www.gamespot.com/feeds/mashup/", description: "Video game news, reviews, trailers, and previews." },
      { title: "Rock Paper Shotgun", url: "https://www.rockpapershotgun.com/feed", description: "PC gaming news, reviews, and indie game features." },
      { title: "VGC (Video Games Chronicle)", url: "https://www.videogameschronicle.com/feed/", description: "Video game industry news, interviews, and leaks." },
      { title: "Gematsu", url: "https://www.gematsu.com/feed", description: "Japanese video game news and console announcements." },
      { title: "PC Gamer", url: "https://www.pcgamer.com/rss/", description: "The global authority on PC games." },
      { title: "TouchArcade", url: "https://toucharcade.com/feed/", description: "Mobile gaming news, iPhone & iPad game reviews." },
      { title: "Game Developer (Gamasutra)", url: "https://www.gamedeveloper.com/rss.xml", description: "Art, code, design, and business of video game creation." }
    ]
  },
  {
    category: "AI, Machine Learning & Robotics",
    feeds: [
      { title: "MIT Technology Review (AI)", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", description: "Breakthroughs in artificial intelligence, neural networks, and LLMs." },
      { title: "OpenAI Research Blog", url: "https://openai.com/news/rss.xml", description: "Official research announcements, models, and safety updates from OpenAI." },
      { title: "Google DeepMind Blog", url: "https://deepmind.google/blog/rss.xml", description: "Frontier AI research, AlphaFold, reasoning models, and scientific AI." },
      { title: "ArXiv Artificial Intelligence", url: "https://rss.arxiv.org/rss/cs.AI", description: "Latest computer science & artificial intelligence preprints." },
      { title: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", description: "Open source AI models, machine learning benchmarks, and transformers." },
      { title: "BAIR (Berkeley AI Research)", url: "https://bair.berkeley.edu/blog/feed.xml", description: "Deep learning, robotics, and reinforcement learning research." }
    ]
  },
  {
    category: "Technology, Tech News & Startups",
    feeds: [
      { title: "Hacker News", url: "https://hnrss.org/frontpage", description: "Y Combinator's Hacker News front page." },
      { title: "The Verge", url: "https://www.theverge.com/rss/index.xml", description: "Technology, science, art, and culture." },
      { title: "TechCrunch", url: "https://techcrunch.com/feed/", description: "Startup, venture capital, and technology news." },
      { title: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", description: "Serving the technologist for more than two decades." },
      { title: "Wired", url: "https://www.wired.com/feed/rss", description: "How emerging technologies affect culture, economy, and politics." },
      { title: "Engadget", url: "https://www.engadget.com/rss.xml", description: "Technology news, reviews, and buyer guides." },
      { title: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", description: "PC hardware news, CPU/GPU benchmarks, and specs." },
      { title: "9to5Mac", url: "https://9to5mac.com/feed/", description: "Apple news, leaks, and iOS updates." },
      { title: "Android Central", url: "https://www.androidcentral.com/feed", description: "Android OS, smartphones, smart home, and tech reviews." }
    ]
  },
  {
    category: "Software Development, Systems & Rust",
    feeds: [
      { title: "GitHub Blog", url: "https://github.blog/feed/", description: "Official updates, developer tools, and engineering stories from GitHub." },
      { title: "Rust Programming Language Blog", url: "https://blog.rust-lang.org/feed.xml", description: "Official Rust release notes, compiler updates, and roadmap." },
      { title: "This Week in Rust", url: "https://this-week-in-rust.org/rss.xml", description: "Weekly roundup of Rust news, crates, and community RFCs." },
      { title: "CSS-Tricks", url: "https://css-tricks.com/feed/", description: "Frontend web development, CSS, JavaScript, and UI techniques." },
      { title: "Lobsters", url: "https://lobste.rs/rss", description: "Computing-focused link aggregation community." },
      { title: "Martin Fowler Blog", url: "https://martinfowler.com/feed.atom", description: "Software architecture, refactoring, agile design, and microservices." }
    ]
  },
  {
    category: "Linux, Cybersecurity & Self-Hosting",
    feeds: [
      { title: "Phoronix", url: "https://www.phoronix.com/rss.php", description: "Linux hardware reviews, open-source tech, and graphics driver benchmarks." },
      { title: "OMG! Ubuntu!", url: "https://www.omgubuntu.co.uk/feed", description: "Ubuntu Linux news, desktop apps, and open-source updates." },
      { title: "KrebsonSecurity", url: "https://krebsonsecurity.com/feed/", description: "In-depth cybercrime, security vulnerabilities, and data breach investigations." },
      { title: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", description: "Cybersecurity news, malware analysis, and tech security alerts." },
      { title: "The Hacker News (THN)", url: "https://feeds.feedburner.com/TheHackersNews", description: "Trusted cybersecurity news and vulnerability disclosures." },
      { title: "DistroWatch Weekly", url: "https://distrowatch.com/news/dw.xml", description: "Linux distribution releases, BSD news, and package updates." }
    ]
  },
  {
    category: "Literature, Sci-Fi & Fantasy Books",
    feeds: [
      { title: "Book Riot", url: "https://bookriot.com/feed/", description: "Book recommendations, reading news, and literary podcasts." },
      { title: "Literary Hub", url: "https://lithub.com/feed/", description: "Daily literary news, essays, and book excerpts." },
      { title: "Publishers Weekly", url: "https://www.publishersweekly.com/pw/rss/feed/index.html", description: "The international news magazine of book publishing." },
      { title: "Tor.com (Reactor Mag)", url: "https://www.reactormag.com/feed/", description: "Science fiction, fantasy, book news, and original fiction." },
      { title: "Fantasy Faction", url: "http://fantasy-faction.com/feed", description: "Fantasy book community, reviews, and writing tips." },
      { title: "Goodreads Blog", url: "https://www.goodreads.com/blog/rss", description: "Book news, author interviews, and reading lists." },
      { title: "The Paris Review", url: "https://www.theparisreview.org/blog/feed/", description: "Literary magazine featuring fiction, poetry, and interviews." }
    ]
  },
  {
    category: "Astronomy, Space & Science",
    feeds: [
      { title: "NASA Breaking News", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", description: "Latest space discovery news from NASA." },
      { title: "Nature News", url: "https://www.nature.com/nature.rss", description: "International weekly journal of science." },
      { title: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml", description: "Breaking scientific news and research papers." },
      { title: "Scientific American", url: "https://rss.sciam.com/ScientificAmerican-Global", description: "Science news, articles, and analysis." },
      { title: "Space.com", url: "https://www.space.com/feeds/all", description: "Space exploration, astronomy, and skywatching." },
      { title: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/", description: "Illuminating science and math research." },
      { title: "Phys.org", url: "https://phys.org/rss-feed/", description: "Physics, nanotechnology, space, and earth science news." }
    ]
  },
  {
    category: "Business, Economics & Markets",
    feeds: [
      { title: "The Economist (Latest)", url: "https://www.economist.com/latest/rss.xml", description: "World news, politics, business, finance, science, and technology." },
      { title: "Financial Times (World)", url: "https://www.ft.com/rss/home/uk", description: "International business, global finance, and economic analysis." },
      { title: "Bloomberg News", url: "https://feeds.bloomberg.com/markets/news.rss", description: "Global financial market news, commodities, and business trends." },
      { title: "Wall Street Journal (Tech)", url: "https://feeds.a.dj.com/rss/RSSWSJTechnology.xml", description: "Business and technology coverage from the WSJ." },
      { title: "CNBC Top News", url: "https://search.cnbc.com/rs/search/view.html?partnerId=2000&keywords=topnews", description: "Stock markets, corporate earnings, and global economics." }
    ]
  },
  {
    category: "Movies, Film Culture & TV",
    feeds: [
      { title: "Variety", url: "https://variety.com/feed/", description: "Entertainment news, film reviews, box office, and awards." },
      { title: "Deadline", url: "https://deadline.com/feed/", description: "Breaking Hollywood, film, and TV news." },
      { title: "Screen Rant", url: "https://screenrant.com/feed/", description: "Movie news, TV news, trailers, and reviews." },
      { title: "Collider", url: "https://collider.com/feed/", description: "Movie news, TV news, and entertainment features." },
      { title: "IndieWire", url: "https://www.indiewire.com/feed/", description: "Independent film, television, and cinema culture news." },
      { title: "SlashFilm (/Film)", url: "https://www.slashfilm.com/feed/", description: "Blogging movie news, trailers, and film reviews." },
      { title: "The AV Club", url: "https://www.avclub.com/rss", description: "Pop culture news, reviews, and entertainment analysis." }
    ]
  },
  {
    category: "Design, Art & Architecture",
    feeds: [
      { title: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed/", description: "For web designers and developers." },
      { title: "Creative Bloq", url: "https://www.creativebloq.com/feed", description: "Art, design, 3D modeling, and digital art tips." },
      { title: "Colossal", url: "https://www.thisiscolossal.com/feed/", description: "Art, design, and visual culture." },
      { title: "Awwwards Blog", url: "https://www.awwwards.com/blog/feed/", description: "Awards for design, creativity, and innovation on the web." },
      { title: "ArchDaily", url: "https://www.archdaily.com/feed", description: "The world's most visited architecture website." }
    ]
  }
];
