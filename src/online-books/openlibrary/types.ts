export interface OpenLibraryWork {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  docs: OpenLibraryWork[];
}

export interface OpenLibraryTrendingResponse {
  query: string;
  works: {
    key: string;
    title: string;
    author_name?: string[];
    cover_i?: number;
    first_publish_year?: number;
  }[];
}

export interface OpenLibrarySubjectResponse {
  key: string;
  name: string;
  subject_type: string;
  work_count: number;
  works: {
    key: string;
    title: string;
    authors?: { name: string }[];
    cover_id?: number;
    first_publish_year?: number;
  }[];
}
