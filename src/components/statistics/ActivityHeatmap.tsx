import { useMemo } from 'react';
import { DailyReadingStats } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface ActivityHeatmapProps {
  data: DailyReadingStats[];
  currentStreak?: number;
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

export function ActivityHeatmap({ data, currentStreak = 0 }: ActivityHeatmapProps) {
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
      case 1: return 'bg-primary/40 dark:bg-primary/40';
      case 2: return 'bg-primary/60 dark:bg-primary/60';
      case 3: return 'bg-primary/80 dark:bg-primary/80';
      case 4: return 'bg-primary dark:bg-primary';
      default: return 'bg-muted/50 dark:bg-muted/30';
    }
  };

  const formatDate = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const streakDates = useMemo(() => {
    const set = new Set<string>();
    if (currentStreak <= 0) return set;
    
    // Find the end of the streak (today or yesterday if today is 0)
    const todayStr = formatDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    let endDate = new Date();
    if ((dataMap.get(todayStr) || 0) === 0 && (dataMap.get(yesterdayStr) || 0) > 0) {
      endDate = yesterday;
    }

    for (let i = 0; i < currentStreak; i++) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      set.add(formatDate(d));
    }
    return set;
  }, [currentStreak, dataMap]);

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

  // Generate Month Labels
  const monthLabels = useMemo(() => {
    const labels: { name: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wIdx) => {
      const validDay = week.find(d => d.getTime() !== 0);
      if (validDay) {
        const month = validDay.getMonth();
        if (month !== lastMonth) {
          labels.push({
            name: validDay.toLocaleDateString('en-US', { month: 'short' }),
            weekIndex: wIdx,
          });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
      <TooltipProvider delayDuration={100}>
        <div className="flex flex-col gap-2 min-w-[700px]">
          {/* Month Header Labels */}
          <div className="flex text-[10px] font-bold text-muted-foreground pl-8 pr-2 relative h-4">
            {monthLabels.map((m, idx) => (
              <span
                key={idx}
                className="absolute"
                style={{ left: `calc(2rem + ${(m.weekIndex / weeks.length) * 100}%)` }}
              >
                {m.name}
              </span>
            ))}
          </div>

          <div className="flex items-start gap-3">
            {/* Weekday Side Labels */}
            <div className="flex flex-col justify-between h-[112px] text-[10px] font-bold text-muted-foreground py-0.5 shrink-0 w-6">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            {/* Heatmap Grid */}
            <div className="flex flex-1 gap-[3px]">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-[3px] flex-1">
                  {week.map((day, dIdx) => {
                    if (day.getTime() === 0) {
                      return <div key={dIdx} className="w-full aspect-square rounded-[3px] opacity-0" />;
                    }
                    const dateStr = formatDate(day);
                    const seconds = dataMap.get(dateStr) || 0;
                    const level = getIntensityLevel(seconds);
                    const isStreak = streakDates.has(dateStr);
                    
                    return (
                      <Tooltip key={dIdx}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "w-full aspect-square rounded-[3px] transition-all cursor-pointer relative",
                              getIntensityClass(level),
                              isStreak ? "ring-1 ring-primary/80 shadow-xs z-10" : "hover:ring-1 ring-ring ring-offset-1 ring-offset-background"
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs font-semibold">{formatTooltip(seconds, day)}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Footer Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 text-xs font-semibold text-muted-foreground">
        <span>Less</span>
        <div className={cn("w-3 h-3 rounded-xs", getIntensityClass(0))} />
        <div className={cn("w-3 h-3 rounded-xs", getIntensityClass(1))} />
        <div className={cn("w-3 h-3 rounded-xs", getIntensityClass(2))} />
        <div className={cn("w-3 h-3 rounded-xs", getIntensityClass(3))} />
        <div className={cn("w-3 h-3 rounded-xs", getIntensityClass(4))} />
        <span>More</span>
      </div>
    </div>
  );
}
