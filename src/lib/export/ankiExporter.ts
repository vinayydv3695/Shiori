/**
 * Anki Flashcard Exporter
 * Generates tab-separated values (.tsv / .txt) ready for 1-click import into Anki decks.
 */

interface RawAnnotationItem {
  type?: string;
  text?: string;
  note?: string;
  color?: string;
  chapter?: string;
  book_title?: string;
  book_author?: string;
}

export function formatForAnki(
  rawJsonOrItems: string | RawAnnotationItem[],
  bookTitle?: string
): string {
  let itemsList: RawAnnotationItem[] = [];
  if (typeof rawJsonOrItems === 'string') {
    try {
      itemsList = JSON.parse(rawJsonOrItems);
    } catch {
      itemsList = [];
    }
  } else {
    itemsList = rawJsonOrItems;
  }

  const title = bookTitle || itemsList[0]?.book_title || 'Book';
  const bookTag = title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const lines: string[] = [];

  for (const a of itemsList) {
    const frontText = (a.text || '').trim().replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const backText = (a.note || '').trim().replace(/\t/g, ' ').replace(/\n/g, '<br>');

    if (!frontText && !backText) continue;

    let front = '';
    let back = '';

    if (frontText && backText) {
      front = frontText;
      back = `<b>Note:</b> ${backText}<br><br><small style="color:gray;">From: ${title}</small>`;
    } else if (frontText) {
      front = frontText;
      back = `<small style="color:gray;">From: ${title}</small>`;
    } else {
      front = backText;
      back = `<small style="color:gray;">From: ${title}</small>`;
    }

    const chapterTag = a.chapter ? a.chapter.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : 'General';
    const tag = `Shiori::${bookTag} ${chapterTag}`;

    lines.push(`${front}\t${back}\t${tag}`);
  }

  return lines.join('\n');
}
