import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BookOpen, Layers, CalendarDays, Star, TrendingUp } from 'lucide-react';

interface StatisticsManga {
  count: number;
  chaptersRead: number;
  meanScore: number;
  standardDeviation: number;
  scores: { score: number; count: number }[];
  lengths: { length: string; count: number }[];
  formats: { format: string; count: number }[];
  statuses: { status: string; count: number }[];
  countries: { country: string; count: number }[];
}

interface AniListMangaStatisticsProps {
  stats: StatisticsManga;
}

const COLORS = ['#8884d8', '#8dd1e1', '#82ca9d', '#a4de6c', '#d0ed57', '#ffc658'];

export function AniListMangaStatistics({ stats }: AniListMangaStatisticsProps) {
  // Calculate max values for bar charts
  const maxScoreCount = Math.max(...stats.scores.map(s => s.count), 1);
  const maxLengthCount = Math.max(...stats.lengths.map(l => l.count), 1);
  const totalScoreCount = stats.scores.reduce((a, b) => a + b.count, 0) || 1;
  const totalLengthCount = stats.lengths.reduce((a, b) => a + b.count, 0) || 1;

  // Assuming chaptersRead gives an approximate "Days Read" based on average reading speed
  // A standard manga chapter takes roughly 5 minutes to read.
  const estimatedDaysRead = ((stats.chaptersRead * 5) / 60 / 24).toFixed(1);

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Manga" value={stats.count} icon={<BookOpen className="w-5 h-5 text-primary/80" />} />
        <MetricCard label="Chapters Read" value={stats.chaptersRead} icon={<Layers className="w-5 h-5 text-primary/80" />} />
        <MetricCard label="Days Read" value={estimatedDaysRead} icon={<CalendarDays className="w-5 h-5 text-primary/80" />} />
        <MetricCard label="Mean Score" value={stats.meanScore.toFixed(2)} icon={<Star className="w-5 h-5 text-primary/80" />} />
        <MetricCard label="Standard Dev" value={stats.standardDeviation.toFixed(2)} icon={<TrendingUp className="w-5 h-5 text-primary/80" />} />
      </div>

      {/* Score Distribution */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Score</h3>
        <div className="flex flex-col gap-3 bg-secondary/10 p-4 rounded-xl border border-border/20">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1 pb-2 border-b border-border/20">
            <span className="w-8">Score</span>
            <span className="flex-1 px-4">% Titles</span>
            <span className="w-12 text-right">Count</span>
          </div>
          {stats.scores.length === 0 ? <p className="text-muted-foreground text-sm">No score data available.</p> : stats.scores.slice().sort((a, b) => a.score - b.score).map((s) => {
            const percentage = ((s.count / totalScoreCount) * 100).toFixed(1);
            const fillWidth = ((s.count / maxScoreCount) * 100) + '%';
            return (
              <div key={s.score} className="flex items-center text-sm relative group">
                <span className="w-8 font-medium">{s.score}</span>
                <div className="flex-1 px-4 relative h-6 flex items-center">
                  <div className="absolute inset-y-1 left-4 rounded-md bg-primary/20 overflow-hidden" style={{ width: `calc(100% - 2rem)` }}>
                    <div 
                      className="h-full bg-primary/70 group-hover:bg-primary transition-all duration-500 rounded-md shadow-[inset_0_1px_3px_rgba(255,255,255,0.2)]" 
                      style={{ width: fillWidth }}
                    />
                  </div>
                  <span className="relative z-10 text-xs ml-2 font-medium opacity-80 mix-blend-difference text-white">{percentage}%</span>
                </div>
                <span className="w-12 text-right font-medium">{s.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Length Distribution */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Chapters</h3>
        <div className="flex flex-col gap-3 bg-secondary/10 p-4 rounded-xl border border-border/20">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1 pb-2 border-b border-border/20">
            <span className="w-16">Length</span>
            <span className="flex-1 px-4">% Titles</span>
            <span className="w-12 text-right">Count</span>
          </div>
          {stats.lengths.length === 0 ? <p className="text-muted-foreground text-sm">No chapters data available.</p> : stats.lengths.map((l) => {
            const percentage = ((l.count / totalLengthCount) * 100).toFixed(1);
            const fillWidth = ((l.count / maxLengthCount) * 100) + '%';
            return (
              <div key={l.length} className="flex items-center text-sm relative group">
                <span className="w-16 font-medium truncate">{l.length}</span>
                <div className="flex-1 px-4 relative h-6 flex items-center">
                  <div className="absolute inset-y-1 left-4 rounded-md bg-primary/20 overflow-hidden" style={{ width: `calc(100% - 2rem)` }}>
                    <div 
                      className="h-full bg-primary/70 group-hover:bg-primary transition-all duration-500 rounded-md shadow-[inset_0_1px_3px_rgba(255,255,255,0.2)]" 
                      style={{ width: fillWidth }}
                    />
                  </div>
                  <span className="relative z-10 text-xs ml-2 font-medium opacity-80 mix-blend-difference text-white">{percentage}%</span>
                </div>
                <span className="w-12 text-right font-medium">{l.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PieChartCard title="Format Distribution" data={stats.formats} nameKey="format" valueKey="count" />
        <PieChartCard title="Status Distribution" data={stats.statuses} nameKey="status" valueKey="count" />
        <PieChartCard title="Country Distribution" data={stats.countries} nameKey="country" valueKey="count" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-secondary/20 p-4 rounded-xl border border-border/10 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wide truncate">{label}</div>
        <div className="font-bold text-foreground text-sm sm:text-base truncate">{value}</div>
      </div>
    </div>
  );
}

function PieChartCard({ title, data, nameKey, valueKey }: { title: string, data: any[], nameKey: string, valueKey: string }) {
  const hasData = data && data.length > 0;
  const sortedData = hasData ? [...data].sort((a, b) => b[valueKey] - a[valueKey]) : [];
  
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="bg-secondary/10 rounded-xl border border-border/20 p-4 flex flex-col items-center gap-6 h-[250px] relative">
        {!hasData ? (
           <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">No data</div>
        ) : (
          <>
            <div className="h-full w-full flex-1 relative drop-shadow-xl flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <radialGradient id={`pieGradient-${title.replace(/\s+/g, '')}`} cx="50%" cy="50%" r="50%" fx="30%" fy="30%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={1} />
                    </radialGradient>
                  </defs>
                  <Pie
                    data={sortedData}
                    dataKey={valueKey}
                    nameKey={nameKey}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={70}
                    stroke="rgba(0,0,0,0.2)"
                    strokeWidth={1}
                    fill={`url(#pieGradient-${title.replace(/\s+/g, '')})`}
                    isAnimationActive={true}
                  >
                    {sortedData.map((entry, index) => (
                       <Cell key={`cell-${index}`} opacity={1 - (index * 0.15)} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full flex flex-wrap justify-center gap-x-4 gap-y-1">
              {sortedData.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-primary" style={{ opacity: 1 - (i * 0.15) }} />
                  <span className="font-medium text-muted-foreground capitalize">
                    {item[nameKey].toLowerCase().replace(/_/g, ' ')}
                  </span>
                  <span className="font-semibold text-foreground ml-1">{item[valueKey]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
