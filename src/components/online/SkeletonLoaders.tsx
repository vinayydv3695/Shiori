import { Skeleton } from '@/components/ui/skeleton';

export function BookSkeletonCard() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-[2/3] rounded-xl" />
      <Skeleton className="h-4 w-3/4 rounded-md" />
      <Skeleton className="h-3 w-1/2 rounded-md" />
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <BookSkeletonCard key={i} />
      ))}
    </div>
  );
}
