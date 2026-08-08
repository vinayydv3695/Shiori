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
      <div className="bg-popover text-popover-foreground px-3.5 py-2 rounded-xl shadow-xl border border-border/50 backdrop-blur-md">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-bold text-primary">
          {formatMinutesAndSeconds(totalSeconds)}
        </p>
      </div>
    );
  }
  return null;
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center text-muted-foreground text-sm">
        No reading data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    minutes: Math.round(d.total_seconds / 60),
    formattedDate: formatDayName(d.date),
  }));

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
          <XAxis
            dataKey="formattedDate"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickFormatter={(value: number) => `${value}m`}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            content={<CustomTooltip />}
          />
          <Bar
            dataKey="minutes"
            radius={[6, 6, 0, 0]}
            fill="hsl(var(--primary))"
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
