/**
 * Text extraction utilities for DOM and PDF content
 * Provides clean text output for TTS processing
 */

export type TextExtractionResult = {
  text: string;
  source: 'dom' | 'pdf';
};

/**
 * Extract text content from a DOM container
 * Normalizes whitespace and newlines for clean output
 */
export function extractTextFromDOM(container: HTMLElement): string {
  // Get inner text (respects display:none, etc.)
  let text = container.innerText || '';
  
  // Trim leading/trailing whitespace
  text = text.trim();
  
  // Normalize multiple newlines to single newlines
  text = text.replace(/\n{2,}/g, '\n');
  
  // Normalize multiple spaces to single spaces
  text = text.replace(/ {2,}/g, ' ');
  
  return text;
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
}

interface PdfDocument {
  getPage(pageNumber: number): Promise<PdfPage>;
}

/**
 * Extract text content from a PDF page
 * 
 * @param pdfDocument - PDFDocumentProxy from pdf.js
 * @param pageNumber - Page number to extract (1-indexed)
 * @returns Promise resolving to extracted text
 */
export async function extractTextFromPdfPage(
  pdfDocument: PdfDocument,
  pageNumber: number
): Promise<string> {
  try {
    // Get the page
    const page = await pdfDocument.getPage(pageNumber);
    
    // Get text content
    const textContent = await page.getTextContent();
    
    // Build text string from items
    let text = '';
    for (const item of textContent.items) {
      // Check if item has str property (text content item)
      if ('str' in item) {
        text += item.str;
        
        // Add newline if item marks end of line
        if (item.hasEOL) {
          text += '\n';
        } else {
          text += ' ';
        }
      }
    }
    
    // Normalize whitespace
    text = text.trim();
    text = text.replace(/\n{2,}/g, '\n');
    text = text.replace(/ {2,}/g, ' ');
    
    return text;
  } catch (error) {
    console.error('Failed to extract text from PDF page:', error);
    return '';
  }
}
