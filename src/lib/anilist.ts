export const ANILIST_API_URL = 'https://graphql.anilist.co';

export interface AnilistUser {
  id: number;
  name: string;
  avatar: {
    large: string;
    medium: string;
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
  description: string;
  format: string;
  status: string;
  chapters: number;
  volumes: number;
  averageScore: number;
}

export interface AnilistMediaList {
  id: number;
  status: string;
  score: number;
  progress: number;
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

async function fetchAnilistAPI(query: string, variables: any, token: string) {
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
      throw new Error("Network error or Rate Limit (429) exceeded from AniList.");
    }
    throw err;
  }

  if (response.status === 429) {
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
        avatar {
          large
          medium
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
