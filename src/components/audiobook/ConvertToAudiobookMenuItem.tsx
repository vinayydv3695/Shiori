/**
 * ConvertToAudiobookMenuItem.tsx
 *
 * Menu button / item that opens the AudiobookConvertDialog for any book.
 */

import React, { useState } from 'react';
import { Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudiobookConvertDialog } from './AudiobookConvertDialog';

interface ConvertToAudiobookMenuItemProps {
  bookId: number;
  bookTitle: string;
  bookAuthor?: string;
  coverUrl?: string | null;
  format?: string;
  variant?: 'menu' | 'button' | 'icon';
}

export function ConvertToAudiobookMenuItem({
  bookId,
  bookTitle,
  bookAuthor,
  coverUrl,
  format,
  variant = 'menu',
}: ConvertToAudiobookMenuItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Exclude non-text manga/comic formats
  if (format && ['online-manga', 'cbz', 'cbr'].includes(format.toLowerCase())) {
    return null;
  }

  return (
    <>
      {variant === 'button' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-2 text-xs font-semibold"
        >
          <Headphones className="w-3.5 h-3.5 text-primary" />
          <span>Convert to Audiobook</span>
        </Button>
      ) : variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          title="Convert to Audiobook"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Headphones className="w-4 h-4" />
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="premium-menu-item"
        >
          <Headphones className="premium-control-icon text-primary shrink-0" />
          <span className="premium-menu-item-label">Convert to Audiobook...</span>
        </button>
      )}

      {isOpen && (
        <AudiobookConvertDialog
          bookId={bookId}
          bookTitle={bookTitle}
          bookAuthor={bookAuthor}
          coverUrl={coverUrl}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default ConvertToAudiobookMenuItem;
