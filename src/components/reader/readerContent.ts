export type ReaderContentFormat =
  | 'epub'
  | 'pdf'
  | 'mobi'
  | 'azw'
  | 'azw3'
  | 'fb2'
  | 'docx'
  | 'html'
  | 'htm'
  | 'txt'
  | 'md'
  | 'markdown'
  | 'cbz'
  | 'cbr'
  | string;

export interface ReaderContent {
  title: string;
  author?: string;
  cover?: string;
  html?: string;
  text?: string;
  pages?: number;
  chapters?: number | Array<{
    id?: string | number;
    index?: number;
    title?: string;
    content?: string;
    html?: string;
    text?: string;
  }>;
  format: ReaderContentFormat;
}
