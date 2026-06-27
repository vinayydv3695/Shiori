import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DailyReadingStats } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

interface ReadingCalendarProps {
  data: DailyReadingStats[];
}

export function ReadingCalendar({ data }: ReadingCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(d => {
      map.set(d.date, d.total_seconds);
    });
    return map;
  }, [data]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  const nextMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  const getIntensityClass = (seconds: number) => {
    if (seconds === 0) return 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent';
    const minutes = seconds / 60;
    if (minutes < 15) return 'bg-primary/20 text-primary border border-primary/20 font-bold';
    if (minutes < 30) return 'bg-primary/40 text-primary-foreground border border-primary/40 font-bold';
    if (minutes < 60) return 'bg-primary/70 text-primary-foreground border border-primary/70 font-bold';
    return 'bg-primary text-primary-foreground border border-primary font-bold';
  };

  const formatDate = (year: number, month: number, day: number) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Generate blank spaces for the first row
  const blanks = Array.from({ length: firstDayOfMonth }).map((_, i) => (
    <div key={`blank-${i}`} className="h-10 w-full" />
  ));

  // Generate days
  const days = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    const dateStr = formatDate(currentDate.getFullYear(), currentDate.getMonth(), day);
    const seconds = dataMap.get(dateStr) || 0;
    
    // Check if today
    const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();

    return (
      <div 
        key={`day-${day}`} 
        className={cn(
          "h-10 w-full flex items-center justify-center rounded-lg text-sm transition-all duration-200 cursor-default",
          getIntensityClass(seconds),
          isToday && seconds === 0 && "border-primary/50 text-foreground"
        )}
        title={seconds > 0 ? `${Math.floor(seconds / 60)} minutes read` : "No reading"}
      >
        {day}
      </div>
    );
  });

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          {monthNames[currentDate.getMonth()]} <span className="text-muted-foreground font-normal">{currentDate.getFullYear()}</span>
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="w-8 h-8 bg-transparent" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="w-8 h-8 bg-transparent" 
            onClick={nextMonth}
            disabled={
              currentDate.getFullYear() === new Date().getFullYear() && 
              currentDate.getMonth() === new Date().getMonth()
            }
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1.5 flex-1">
        {blanks}
        {days}
      </div>
    </div>
  );
}
