import { useMemo } from 'react';
import { DailyReadingStats } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface ActivityHeatmapProps {
  data: DailyReadingStats[];
}

// Generate the last 365 days
function generateDateRange() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d);
  }
  return dates;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(d => {
      map.set(d.date, d.total_seconds);
    });
    return map;
  }, [data]);

  const gridDates = useMemo(() => {
    return generateDateRange();
  }, []);

  const getIntensityLevel = (seconds: number) => {
    if (seconds === 0) return 0;
    const minutes = seconds / 60;
    if (minutes < 15) return 1;
    if (minutes < 30) return 2;
    if (minutes < 60) return 3;
    return 4;
  };

  const getIntensityClass = (level: number) => {
    switch (level) {
      case 1: return 'bg-orange-300 dark:bg-orange-800/60';
      case 2: return 'bg-orange-400 dark:bg-orange-600';
      case 3: return 'bg-orange-500 dark:bg-orange-500';
      case 4: return 'bg-orange-600 dark:bg-orange-400';
      default: return 'bg-muted/50 dark:bg-muted/30';
    }
  };

  const formatDate = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatTooltip = (seconds: number, d: Date) => {
    const mins = Math.floor(seconds / 60);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (mins === 0) return `No reading on ${dateStr}`;
    if (mins < 60) return `${mins} min on ${dateStr}`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m on ${dateStr}`;
  };

  // Group into weeks (columns)
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  
  // Pad the first week if the first date isn't a Sunday
  const firstDayOfWeek = gridDates[0].getDay();
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(new Date(0)); // Dummy padding
  }

  gridDates.forEach(d => {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(new Date(0));
    }
    weeks.push(currentWeek);
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <TooltipProvider delayDuration={100}>
        <div className="flex gap-1 min-w-max">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((day, dIdx) => {
                if (day.getTime() === 0) {
                  return <div key={dIdx} className="w-3.5 h-3.5 rounded-sm opacity-0" />;
                }
                const dateStr = formatDate(day);
                const seconds = dataMap.get(dateStr) || 0;
                const level = getIntensityLevel(seconds);
                
                return (
                  <Tooltip key={dIdx}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded-sm transition-colors hover:ring-2 ring-ring ring-offset-1 ring-offset-background cursor-pointer",
                          getIntensityClass(level)
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{formatTooltip(seconds, day)}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </TooltipProvider>
      <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
        <span>Less</span>
        <div className={cn("w-3 h-3 rounded-sm", getIntensityClass(0))} />
        <div className={cn("w-3 h-3 rounded-sm", getIntensityClass(1))} />
        <div className={cn("w-3 h-3 rounded-sm", getIntensityClass(2))} />
        <div className={cn("w-3 h-3 rounded-sm", getIntensityClass(3))} />
        <div className={cn("w-3 h-3 rounded-sm", getIntensityClass(4))} />
        <span>More</span>
      </div>
    </div>
  );
}
