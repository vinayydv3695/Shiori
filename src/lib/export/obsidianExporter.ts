/**
 * Obsidian Vault Exporter for Shiori Annotations
 * Generates rich Obsidian-compatible Markdown with YAML frontmatter,
 * callout quote blocks (> [!quote]), tags, and reading metadata.
 */

export interface ObsidianExportOptions {
  includeCallouts?: boolean;
  includeTags?: boolean;
  vaultPath?: string;
}

interface RawAnnotationItem {
  type?: string;
  text?: string;
  note?: string;
  color?: string;
  location?: string;
  chapter?: string;
  created_at?: string;
  book_title?: string;
  book_author?: string;
}

export function formatForObsidian(
  rawJsonOrItems: string | RawAnnotationItem[],
  bookTitle?: string,
  bookAuthor?: string,
  options: ObsidianExportOptions = { includeCallouts: true, includeTags: true }
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

  const now = new Date().toISOString().split('T')[0];
  const first = itemsList[0];
  const title = bookTitle || first?.book_title || 'Untitled Book';
  const author = bookAuthor || first?.book_author || 'Unknown Author';
  const total = itemsList.length;

  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `author: "${author.replace(/"/g, '\\"')}"`,
    'tags:',
    '  - reading/book',
    '  - shiori/highlights',
    `total_annotations: ${total}`,
    `exported_date: ${now}`,
    '---',
    '',
  ].join('\n');

  const header = [
    `# 📖 ${title}`,
    `*By ${author}*`,
    '',
    `> [!info] Reading Summary`,
    `> **Total Highlights & Notes:** ${total} items`,
    `> **Exported from:** Shiori Reader on ${now}`,
    '',
    '---',
    '',
    '## 📝 Highlights & Notes',
    '',
  ].join('\n');

  const formattedItems = itemsList.map((a, idx) => {
    const quoteText = a.text ? a.text.trim() : '';
    const noteText = a.note ? a.note.trim() : '';
    const chapterName = a.chapter ? `(${a.chapter})` : '';

    if (options.includeCallouts) {
      const calloutLines = [
        `> [!quote] Item #${idx + 1} ${chapterName}`,
        `> ${quoteText.replace(/\n/g, '\n> ')}`,
      ];

      if (noteText) {
        calloutLines.push('>', `> 💡 **Note:** ${noteText.replace(/\n/g, '\n> ')}`);
      }

      calloutLines.push('');
      return calloutLines.join('\n');
    }

    let itemMd = `### Highlight #${idx + 1} ${chapterName}\n`;
    if (quoteText) itemMd += `> "${quoteText}"\n\n`;
    if (noteText) itemMd += `**Note:** ${noteText}\n\n`;
    return itemMd;
  });

  return `${frontmatter}\n${header}\n${formattedItems.join('\n')}`;
}
