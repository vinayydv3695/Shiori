export function extractFirstImage(htmlContent: string): string | null {
  if (!htmlContent) return null;
  const imgRegex = /<img[^>]+src="([^">]+)"/i;
  const match = htmlContent.match(imgRegex);
  return match ? match[1] : null;
}
