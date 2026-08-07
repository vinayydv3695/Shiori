export interface AnnasArchiveBook {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  source_id: string;
  extra: {
    md5: string;
    detail_url: string;
    author?: string;
    year?: string;
    language?: string;
    format?: string;
    file_size?: string;
    mirror?: string;
  };
}
