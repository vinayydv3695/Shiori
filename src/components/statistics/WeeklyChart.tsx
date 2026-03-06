import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface WeeklyChartProps {
  data: Array<{ date: string; total_seconds: number }>;
}

function formatMinutesAndSeconds(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min} min ${sec} sec`;
}

function formatDayName(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return dateStr;
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { total_seconds: number; date: string } }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length && label !== undefined) {
    const totalSeconds = payload[0].payload.total_seconds;
    return (
      <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
          {formatMinutesAndSeconds(totalSeconds)}
        </p>
      </div>
    );
  }
  return null;
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'));
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  const isDark = useIsDark();

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        No reading data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    minutes: Math.round(d.total_seconds / 60),
    formattedDate: formatDayName(d.date),
  }));

  const barColor = isDark ? '#60a5fa' : '#3b82f6';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const tickColor = isDark ? '#9ca3af' : '#6b7280';
  const cursorColor = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)';

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis
            dataKey="formattedDate"
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickColor, fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickColor, fontSize: 12 }}
            tickFormatter={(value: number) => `${value}m`}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: cursorColor }}
            content={<CustomTooltip />}
          />
          <Bar
            dataKey="minutes"
            radius={[4, 4, 0, 0]}
            fill={barColor}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
