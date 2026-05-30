export interface LibgenBook {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  source_id: string;
  extra: {
    title: string;
    author?: string;
    publisher?: string;
    year?: string;
    language?: string;
    format?: string;
    file_size?: string;
    file_size_bytes?: string;
    url?: string;
    detail_url?: string;
    mirror_1?: string;
    mirror_2?: string;
    mirror_3?: string;
    mirror_4?: string;
  };
}
