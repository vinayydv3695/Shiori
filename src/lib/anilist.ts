export const ANILIST_API_URL = 'https://graphql.anilist.co';

export interface AnilistUser {
  id: number;
  name: string;
  createdAt: number;
  avatar: {
    large: string;
    medium: string;
  };
  bannerImage?: string | null;
  statistics?: {
    manga: {
      count: number;
      chaptersRead: number;
      meanScore: number;
      standardDeviation: number;
      scores: { score: number; count: number }[];
      lengths: { length: string; count: number }[];
      formats: { format: string; count: number }[];
      statuses: { status: string; count: number }[];
      countries: { country: string; count: number }[];
    }
  };
}

export interface AnilistMedia {
  id: number;
  title: {
    romaji: string;
    english: string;
    native: string;
    userPreferred: string;
  };
  coverImage: {
    extraLarge: string;
    large: string;
    medium: string;
  };
  bannerImage?: string | null;
  description: string;
  format: string;
  status: string;
  chapters: number;
  volumes: number;
  averageScore: number;
  countryOfOrigin?: string;
}

export interface AnilistMediaList {
  id: number;
  status: string;
  progress: number;
  score: number;
  score100?: number;
  progressVolumes: number;
  startedAt?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  completedAt?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  notes?: string;
  repeat?: number;
  media: AnilistMedia;
}

export interface AnilistMediaListGroup {
  name: string;
  isCustomList: boolean;
  isSplitCompletedList: boolean;
  status: string;
  entries: AnilistMediaList[];
}

export interface AnilistMediaListCollection {
  lists: AnilistMediaListGroup[];
  user: {
    id: number;
    name: string;
  };
}

export interface AnilistMediaDetails extends AnilistMedia {
  tags: { id: number; name: string; description: string; isMediaSpoiler: boolean; rank: number }[];
  genres: string[];
  characters: {
    edges: {
      role: string;
      node: {
        id: number;
        name: { full: string };
        image: { large: string };
      };
    }[];
  };
  staff: {
    edges: {
      role: string;
      node: {
        id: number;
        name: { full: string };
        image: { large: string };
      };
    }[];
  };
  relations: {
    edges: {
      relationType: string;
      node: {
        id: number;
        title: { romaji: string };
        coverImage: { large: string };
        type: string;
      };
    }[];
  };
  recommendations: {
    nodes: {
      mediaRecommendation: {
        id: number;
        title: { romaji: string };
        coverImage: { large: string };
      };
    }[];
  };
  externalLinks: { id: number; url: string; site: string }[];
  meanScore: number;
  popularity: number;
  rankings: { id: number; rank: number; type: string; format: string; year: number; season: string; allTime: boolean; context: string }[];
}

async function fetchAnilistAPI(query: string, variables: any, token: string, retries = 3, backoff = 2000): Promise<any> {
  let response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query,
        variables
      })
    });
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      if (retries > 0) {
        console.warn(`[AniList] Network/Rate limit error. Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return fetchAnilistAPI(query, variables, token, retries - 1, backoff * 2);
      }
      throw new Error("Network error or Rate Limit (429) exceeded from AniList.");
    }
    throw err;
  }

  if (response.status === 429) {
    if (retries > 0) {
      const retryAfterStr = response.headers.get('Retry-After');
      let waitTime = backoff;
      if (retryAfterStr && !isNaN(parseInt(retryAfterStr, 10))) {
        waitTime = parseInt(retryAfterStr, 10) * 1000 + 500;
      }
      console.warn(`[AniList] Rate limit (429). Retrying in ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      return fetchAnilistAPI(query, variables, token, retries - 1, backoff * 2);
    }
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(`Rate limit exceeded. Please wait ${retryAfter ? retryAfter + ' seconds' : 'a minute'} before trying again.`);
  }

  if (!response.ok) {
    throw new Error(`AniList API returned ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: any) => e.message).join('\n'));
  }

  return json.data;
}

export async function getViewer(token: string): Promise<AnilistUser> {
  const query = `
    query {
      Viewer {
        id
        name
        createdAt
        bannerImage
        avatar {
          large
          medium
        }
        statistics {
          manga {
            count
            chaptersRead
            meanScore
            standardDeviation
            scores { score count }
            lengths { length count }
            formats { format count }
            statuses { status count }
            countries { country count }
          }
        }
      }
    }
  `;

  const data = await fetchAnilistAPI(query, {}, token);
  return data.Viewer;
}

export async function getMediaListCollection(userId: number, token: string): Promise<AnilistMediaListCollection> {
  const query = `
    query ($userId: Int) {
      MediaListCollection(userId: $userId, type: MANGA) {
        user {
          id
          name
        }
        lists {
          name
          isCustomList
          isSplitCompletedList
          status
          entries {
            id
            status
            score
            progress
            progressVolumes
            startedAt {
              year
              month
              day
            }
            completedAt {
              year
              month
              day
            }
            media {
              id
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                extraLarge
                large
                medium
              }
              description
              format
              status
              chapters
              volumes
              averageScore
              countryOfOrigin
            }
          }
        }
      }
    }
  `;

  const data = await fetchAnilistAPI(query, { userId }, token);
  return data.MediaListCollection;
}

export async function updateMediaListEntry(
  mediaId: number, 
  progress: number, 
  status: string, 
  token: string,
  scoreRaw?: number,
  notes?: string,
  startedAt?: { year: number | null; month: number | null; day: number | null },
  completedAt?: { year: number | null; month: number | null; day: number | null },
  repeat?: number
) {
  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $scoreRaw: Int, $notes: String, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput, $repeat: Int) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, scoreRaw: $scoreRaw, notes: $notes, startedAt: $startedAt, completedAt: $completedAt, repeat: $repeat) {
        id
        status
        progress
        score
        score100: score(format: POINT_100)
        notes
        repeat
        startedAt { year month day }
        completedAt { year month day }
      }
    }
  `;

  const data = await fetchAnilistAPI(mutation, { 
    mediaId, progress, status, scoreRaw, notes, startedAt, completedAt, repeat 
  }, token);
  return data.SaveMediaListEntry;
}

export async function getMediaDetails(mediaId: number, token: string): Promise<AnilistMediaDetails> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title {
          romaji
          english
          native
          userPreferred
        }
        coverImage {
          extraLarge
          large
          medium
        }
        description
        format
        status
        chapters
        volumes
        averageScore
        meanScore
        popularity
        tags {
          id
          name
          description
          isMediaSpoiler
          rank
        }
        genres
        characters(perPage: 12, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node {
              id
              name {
                full
              }
              image {
                large
              }
            }
          }
        }
        staff(perPage: 12, sort: [RELEVANCE]) {
          edges {
            role
            node {
              id
              name {
                full
              }
              image {
                large
              }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id
              title {
                romaji
              }
              coverImage {
                large
              }
              type
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 10) {
          nodes {
            mediaRecommendation {
              id
              title {
                romaji
              }
              coverImage {
                large
              }
            }
          }
        }
        externalLinks {
          id
          url
          site
        }
        rankings {
          id
          rank
          type
          format
          year
          season
          allTime
          context
        }
      }
    }
  `;

  const data = await fetchAnilistAPI(query, { id: mediaId }, token);
  return data.Media;
}

export async function searchMedia(search: string, token: string): Promise<AnilistMedia[]> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 20) {
        media(search: $search, type: MANGA) {
          id
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
          }
          description
          format
          status
          chapters
          volumes
          averageScore
        }
      }
    }
  `;

  const data = await fetchAnilistAPI(query, { search }, token);
  return data.Page.media;
}

export async function getTopManga(token: string, page = 1, perPage = 25): Promise<AnilistMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: MANGA, format_in: [MANGA, ONE_SHOT], sort: SCORE_DESC) {
          id
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
          }
          description
          format
          status
          chapters
          volumes
          averageScore
        }
      }
    }
  `;

  const data = await fetchAnilistAPI(query, { page, perPage }, token);
  return data.Page.media;
}

export async function safeUpdateMediaListEntry(
  mediaId: number, 
  progress: number, 
  status: string, 
  token: string,
  scoreRaw?: number,
  notes?: string
) {
  try {
    await updateMediaListEntry(mediaId, progress, status, token, scoreRaw, notes);
  } catch (err) {
    console.warn(`[AniList] Network failure syncing ${mediaId}. Queueing offline.`, err);
    // Dynamic import to avoid circular dependency issues if any
    const { useOfflineSyncStore } = await import('@/store/offlineSyncStore');
    useOfflineSyncStore.getState().addSyncAction({
      mediaId,
      chapterNum: progress,
      status,
      scoreRaw,
      notes
    });
  }
}

export interface AnilistUserSocial {
  id: number;
  name: string;
  avatar: { large: string };
}

export interface AnilistActivity {
  id: number;
  type: string;
  createdAt: number;
  status?: string;
  progress?: string;
  text?: string;
  media?: {
    id: number;
    title: { romaji: string; english?: string };
    coverImage: { large: string };
  };
}

export interface AnilistFavourite {
  id: number;
  title: { romaji: string; english?: string };
  coverImage: { large: string };
}

export interface AnilistReview {
  id: number;
  summary: string;
  score: number;
  rating: number;
  createdAt: number;
  media: {
    id: number;
    title: { romaji: string; english?: string };
    coverImage: { large: string };
  };
}

export async function getUserSocial(userId: number, token: string): Promise<{ following: AnilistUserSocial[], followers: AnilistUserSocial[] }> {
  const query = `
    query ($userId: Int!) {
      followingPage: Page(perPage: 50) {
        following(userId: $userId) {
          id
          name
          avatar { large }
        }
      }
      followersPage: Page(perPage: 50) {
        followers(userId: $userId) {
          id
          name
          avatar { large }
        }
      }
    }
  `;
  const data = await fetchAnilistAPI(query, { userId }, token);
  return {
    following: data.followingPage.following,
    followers: data.followersPage.followers,
  };
}

export async function getUserActivities(userId: number, token: string): Promise<AnilistActivity[]> {
  const query = `
    query ($userId: Int!) {
      Page(perPage: 25) {
        activities(userId: $userId, type: MANGA_LIST) {
          ... on ListActivity {
            id
            type
            status
            progress
            createdAt
            media {
              id
              title { romaji english }
              coverImage { large }
            }
          }
        }
      }
    }
  `;
  const data = await fetchAnilistAPI(query, { userId }, token);
  return data.Page.activities;
}

export async function getUserReviews(userId: number, token: string): Promise<AnilistReview[]> {
  const query = `
    query ($userId: Int!) {
      Page(perPage: 50) {
        reviews(userId: $userId, mediaType: MANGA, sort: [UPDATED_AT_DESC, CREATED_AT_DESC]) {
          id
          summary
          score
          rating
          createdAt
          media {
            id
            title { romaji english }
            coverImage { large }
          }
        }
      }
    }
  `;
  const data = await fetchAnilistAPI(query, { userId }, token);
  return data.Page.reviews;
}

export async function saveReview(mediaId: number, body: string, summary: string, score: number, token: string) {
  const mutation = `
    mutation ($mediaId: Int, $body: String, $summary: String, $score: Int) {
      SaveReview(mediaId: $mediaId, body: $body, summary: $summary, score: $score, private: false) {
        id
      }
    }
  `;
  const data = await fetchAnilistAPI(mutation, { mediaId, body, summary, score }, token);
  return data.SaveReview;
}

export async function getUserFavourites(userId: number, token: string): Promise<AnilistFavourite[]> {
  const query = `
    query ($userId: Int!) {
      User(id: $userId) {
        favourites {
          manga(page: 1, perPage: 50) {
            nodes {
              id
              title { romaji english }
              coverImage { large }
            }
          }
        }
      }
    }
  `;
  const data = await fetchAnilistAPI(query, { userId }, token);
  return data.User.favourites.manga.nodes;
}
