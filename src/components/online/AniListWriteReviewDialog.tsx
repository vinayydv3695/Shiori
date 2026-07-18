import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { saveReview, searchMedia, AnilistMedia } from '@/lib/anilist';
import { Loader2, Search, Star } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

interface AniListWriteReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AniListWriteReviewDialog({ open, onOpenChange, onSuccess }: AniListWriteReviewDialogProps) {
  const { token } = useAniListAccessToken();
  const { success: showSuccess, error: showError } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [searchResults, setSearchResults] = useState<AnilistMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<AnilistMedia | null>(null);

  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [score, setScore] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search for media
  useEffect(() => {
    async function doSearch() {
      if (!debouncedSearch.trim() || !token) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const results = await searchMedia(debouncedSearch, token);
        setSearchResults(results);
      } catch (err) {
        console.error('Failed to search media:', err);
      } finally {
        setIsSearching(false);
      }
    }
    doSearch();
  }, [debouncedSearch, token]);

  const handleSubmit = async () => {
    if (!token) {
      showError('Authentication required', 'Please log in to AniList first.');
      return;
    }
    if (!selectedMedia) {
      showError('Validation Error', 'Please select a manga to review.');
      return;
    }
    if (!summary.trim() || !body.trim() || score === '') {
      showError('Validation Error', 'Please fill in all fields (Summary, Body, and Score).');
      return;
    }

    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) {
      showError('Validation Error', 'Score must be a number between 0 and 100.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveReview(selectedMedia.id, body, summary, numScore, token);
      showSuccess('Review Published', 'Your review has been successfully published to AniList.');
      onOpenChange(false);
      
      // Reset state
      setSelectedMedia(null);
      setSearchQuery('');
      setSummary('');
      setBody('');
      setScore('');
      
      onSuccess?.();
    } catch (err) {
      console.error(err);
      showError('Failed to publish review', 'An error occurred while saving your review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col">
        <DialogHeader>
          <DialogTitle>Write a Review</DialogTitle>
          <DialogDescription>
            Share your thoughts on a manga with the AniList community.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4 flex-1">
          {!selectedMedia ? (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search for a manga..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar border rounded-md border-border/50 p-2">
                {isSearching ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(media => (
                    <div 
                      key={media.id}
                      onClick={() => setSelectedMedia(media)}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors"
                    >
                      <img src={media.coverImage.medium} alt={media.title.romaji} className="w-10 h-14 object-cover rounded" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium truncate">{media.title.english || media.title.romaji}</span>
                        <span className="text-xs text-muted-foreground capitalize">{media.format}</span>
                      </div>
                    </div>
                  ))
                ) : debouncedSearch ? (
                  <div className="text-center p-4 text-muted-foreground text-sm">No results found.</div>
                ) : (
                  <div className="text-center p-4 text-muted-foreground text-sm">Type to search for manga.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-secondary/20 p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  <img src={selectedMedia.coverImage.medium} alt={selectedMedia.title.romaji} className="w-12 h-16 object-cover rounded" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-bold truncate">{selectedMedia.title.english || selectedMedia.title.romaji}</span>
                    <span className="text-xs text-muted-foreground">Selected Manga</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedMedia(null)}>
                  Change
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold">Summary</label>
                <Input 
                  placeholder="A short summary of your review (max 120 chars)" 
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold">Review Body (Markdown supported)</label>
                <textarea 
                  placeholder="Write your full review here..." 
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[150px] resize-none"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold">Score (0-100)</label>
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary fill-primary opacity-50" />
                  <Input 
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 85" 
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">/ 100</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedMedia || isSubmitting || !summary || !body || score === ''}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Publish Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
