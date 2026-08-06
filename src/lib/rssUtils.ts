export function extractFirstImage(htmlContent: string): string | null {
  if (!htmlContent) return null;
  const imgRegex = /<img[^>]+src="([^">]+)"/i;
  const match = htmlContent.match(imgRegex);
  return match ? match[1] : null;
}

export function stripHtmlTags(htmlContent: string | null | undefined): string {
  if (!htmlContent) return '';
  return htmlContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFeedGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 45) % 360;
  const c1 = `hsl(${h1}, 65%, 35%)`;
  const c2 = `hsl(${h2}, 75%, 15%)`;
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}
