import type { ReadingWrappedData } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export type WrappedExportFormat = 'story' | 'card';
export type WrappedCardTheme = 'parchment' | 'obsidian';

/** Helper to format seconds into readable hours/minutes string */
export function formatWrappedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hrs`;
  }
  return `${minutes} mins`;
}

/** Safely draw a rounded rectangle */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number | number[]
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    const r = typeof radius === 'number' ? radius : radius[0] || 0;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/** Helper to wrap text cleanly into multiple lines with safe truncation */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 3
): string[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) {
        // Collect remaining words for final line with ellipsis if needed
        const remaining = words.slice(i).join(' ');
        let lastLine = '';
        const remWords = remaining.split(/\s+/);
        for (let j = 0; j < remWords.length; j++) {
          const testLast = lastLine ? `${lastLine} ${remWords[j]}` : remWords[j];
          if (ctx.measureText(testLast + '...').width > maxWidth) {
            lines.push((lastLine || remWords[j]) + '...');
            return lines;
          }
          lastLine = testLast;
        }
        lines.push(lastLine);
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

/** Preload image as promise */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Helper to format peak hour into readable time like '3 PM' */
function getPeakHourLabel(hourly: { hour: number; total_seconds: number }[]): string {
  if (!hourly || hourly.length === 0) return 'Afternoon';
  let maxSec = -1;
  let maxHour = 15;
  for (const h of hourly) {
    if (h.total_seconds > maxSec) {
      maxSec = h.total_seconds;
      maxHour = h.hour;
    }
  }
  if (maxSec <= 0) return 'Afternoon';
  const ampm = maxHour >= 12 ? 'PM' : 'AM';
  const disp = maxHour % 12 === 0 ? 12 : maxHour % 12;
  return `${disp} ${ampm}`;
}

/** Draw clean modern book cover matching Shiori home card aesthetic */
function drawModernBookCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  isParchment: boolean,
  fallbackTitle: string
) {
  ctx.save();

  // Clean ambient drop shadow
  ctx.shadowColor = isParchment ? 'rgba(38, 23, 14, 0.18)' : 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;

  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = isParchment ? '#d5c4b1' : '#1e1a17';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Clip and draw image or warm cloth fallback
  ctx.save();
  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.clip();

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, isParchment ? '#4a2f1d' : '#261a12');
    grad.addColorStop(1, isParchment ? '#28170d' : '#140d09');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('SHIORI', x + w / 2, y + h / 2 - 10);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(250, 250, 249, 0.7)';
    const lines = wrapText(ctx, fallbackTitle, w - 24, 2);
    lines.forEach((l, i) => {
      ctx.fillText(l, x + w / 2, y + h / 2 + 16 + i * 18);
    });
  }

  // Left spine subtle crease
  const spineGrad = ctx.createLinearGradient(x, y, x + 18, y);
  spineGrad.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
  spineGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.16)');
  spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = spineGrad;
  ctx.fillRect(x, y, 18, h);

  ctx.restore();

  // Clean 1px border
  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.strokeStyle = isParchment ? 'rgba(80, 50, 30, 0.18)' : 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

/** Draw modern clean background matching Shiori theme */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: WrappedCardTheme
) {
  if (theme === 'parchment') {
    // Warm soft cream matching Shiori's Sepia theme
    ctx.fillStyle = '#f4ece1';
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient warmth
    const topGlow = ctx.createRadialGradient(
      width * 0.25, height * 0.2, 40,
      width * 0.25, height * 0.2, width * 0.6
    );
    topGlow.addColorStop(0, 'rgba(217, 119, 6, 0.06)');
    topGlow.addColorStop(1, 'rgba(244, 236, 225, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Rich obsidian black
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(0, 0, width, height);

    const topGlow = ctx.createRadialGradient(
      width * 0.25, height * 0.2, 40,
      width * 0.25, height * 0.2, width * 0.6
    );
    topGlow.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
    topGlow.addColorStop(1, 'rgba(14, 12, 10, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);
  }

  // Single clean outer border line
  drawRoundRect(ctx, 16, 16, width - 32, height - 32, 28);
  ctx.strokeStyle = theme === 'parchment' ? 'rgba(180, 160, 130, 0.35)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Render 9:16 Vertical Story Format (1080 x 1920) */
export async function renderStoryCard(
  canvas: HTMLCanvasElement,
  data: ReadingWrappedData,
  theme: WrappedCardTheme = 'parchment'
): Promise<void> {
  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  drawBackground(ctx, width, height, theme);

  const isParchment = theme === 'parchment';
  const textPrimary = isParchment ? '#26170e' : '#faf8f5';
  const textMuted = isParchment ? '#7c6a58' : 'rgba(250, 248, 245, 0.65)';
  const cardFill = isParchment ? '#ede4ce' : '#181512';
  const cardStroke = isParchment ? 'rgba(180, 160, 130, 0.35)' : 'rgba(255, 255, 255, 0.08)';
  const accentColor = isParchment ? '#b05224' : '#f59e0b';

  ctx.save();

  // ── Header: Shiori Branding Pill ──
  const pillW = 100;
  const pillH = 38;
  drawRoundRect(ctx, 72, 76, pillW, pillH, 19);
  ctx.fillStyle = accentColor;
  ctx.fill();

  ctx.font = '900 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = isParchment ? '#ffffff' : '#0c0a08';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHIORI', 72 + pillW / 2, 76 + pillH / 2);

  ctx.textAlign = 'left';
  ctx.font = '800 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(`${data.year} READING WRAPPED`, 190, 95);

  // ── Hero Archetype Title & Single Line Subtitle ──
  ctx.font = '900 54px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textPrimary;
  ctx.fillText(data.persona_title || 'The Dedicated Reader', 72, 185);

  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(
    `${data.primary_rhythm || 'Balanced Reader'} · ${data.total_reading_days} Active Reading Days`,
    72,
    224
  );

  // ── 4 Clean Metric Cards (2x2 Grid) ──
  const statGridY = 270;
  const cardW = 444;
  const cardH = 145;

  const statItems = [
    { label: 'READING TIME', value: formatWrappedTime(data.total_seconds) },
    { label: 'BOOKS FINISHED', value: `${data.books_completed}` },
    { label: 'PAGES TURNED', value: data.total_pages_read.toLocaleString() },
    { label: 'ACTIVE STREAK', value: `${data.longest_streak || data.total_reading_days || 0}d` },
  ];

  statItems.forEach((stat, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const sx = 72 + col * (cardW + 48);
    const sy = statGridY + row * (cardH + 20);

    drawRoundRect(ctx, sx, sy, cardW, cardH, 24);
    ctx.fillStyle = cardFill;
    ctx.fill();
    ctx.strokeStyle = cardStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '800 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(stat.label, sx + 28, sy + 44);

    ctx.font = '900 46px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    ctx.fillText(stat.value, sx + 28, sy + 102);
  });

  // ── Top Book Spotlight Card ──
  const topBook = data.top_books[0];
  const topBookY = 615;
  const topBookH = 460;
  drawRoundRect(ctx, 72, topBookY, 936, topBookH, 28);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.strokeStyle = cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Badge pill
  drawRoundRect(ctx, 106, topBookY + 36, 170, 32, 16);
  ctx.fillStyle = isParchment ? 'rgba(176, 82, 36, 0.1)' : 'rgba(245, 158, 11, 0.15)';
  ctx.fill();
  ctx.font = '800 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'center';
  ctx.fillText('#1 READ TITLE', 191, topBookY + 52);
  ctx.textAlign = 'left';

  const coverX = 106;
  const coverY = topBookY + 86;
  const coverW = 200;
  const coverH = 300;

  let loadedCover: HTMLImageElement | null = null;
  if (topBook?.cover_path) {
    try {
      const src = topBook.cover_path.startsWith('http') || topBook.cover_path.startsWith('asset://')
        ? topBook.cover_path
        : convertFileSrc(topBook.cover_path.replace(/\\/g, '/'));
      loadedCover = await loadImage(src);
    } catch {
      loadedCover = null;
    }
  }

  drawModernBookCover(ctx, loadedCover, coverX, coverY, coverW, coverH, isParchment, topBook?.title || 'Top Selection');

  if (topBook) {
    const bookInfoX = coverX + coverW + 36;
    const bookInfoW = 936 - (coverW + 100);

    ctx.font = '900 32px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    const titleLines = wrapText(ctx, topBook.title, bookInfoW, 2);
    titleLines.forEach((line, idx) => {
      ctx.fillText(line, bookInfoX, coverY + 40 + idx * 40);
    });

    const authorY = coverY + 44 + titleLines.length * 40;
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(topBook.author || 'Unknown Author', bookInfoX, authorY);

    const pillY = authorY + 30;
    drawRoundRect(ctx, bookInfoX, pillY, 220, 48, 24);
    ctx.fillStyle = isParchment ? 'rgba(176, 82, 36, 0.1)' : 'rgba(245, 158, 11, 0.15)';
    ctx.fill();

    ctx.font = '800 17px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(`⏱ ${formatWrappedTime(topBook.total_seconds)} logged`, bookInfoX + 22, pillY + 30);
  }

  // ── Circadian Rhythm Activity Card ──
  const rhythmY = 1115;
  const rhythmH = 340;
  drawRoundRect(ctx, 72, rhythmY, 936, rhythmH, 28);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.strokeStyle = cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '800 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText('DAILY READING RHYTHM', 110, rhythmY + 48);

  ctx.font = '700 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'right';
  ctx.fillText(`Peak focus at ${getPeakHourLabel(data.hourly_distribution)}`, 960, rhythmY + 48);
  ctx.textAlign = 'left';

  // 24-Hour Bar Chart
  const chartX = 110;
  const chartY = rhythmY + 80;
  const chartW = 856;
  const chartH = 170;
  const maxHourlySec = Math.max(1, ...data.hourly_distribution.map(h => h.total_seconds));

  data.hourly_distribution.forEach((bucket, i) => {
    const barW = Math.max(6, (chartW / 24) - 5);
    const barH = Math.max(6, (bucket.total_seconds / maxHourlySec) * chartH);
    const bx = chartX + i * (chartW / 24);
    const by = chartY + chartH - barH;

    const isPeak = bucket.total_seconds === maxHourlySec && maxHourlySec > 0;
    drawRoundRect(ctx, bx, by, barW, barH, 4);
    ctx.fillStyle = isPeak
      ? accentColor
      : isParchment
      ? 'rgba(124, 106, 88, 0.28)'
      : 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
  });

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText('12 AM', chartX, chartY + chartH + 28);
  ctx.fillText('12 PM', chartX + chartW / 2 - 20, chartY + chartH + 28);
  ctx.fillText('11 PM', chartX + chartW - 44, chartY + chartH + 28);

  // ── Runners Up / Top Formats Strip ──
  const validRunners = (data.top_books || [])
    .slice(1)
    .filter(b => b.total_seconds > 0)
    .slice(0, 3);

  const runnerY = 1495;
  const runnerH = 260;
  drawRoundRect(ctx, 72, runnerY, 936, runnerH, 28);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.strokeStyle = cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '800 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(validRunners.length > 0 ? 'MORE BOOKS FINISHED & READ' : 'LIBRARY HIGHLIGHTS', 110, runnerY + 46);

  if (validRunners.length > 0) {
    const rCardW = (936 - 76 - (validRunners.length - 1) * 16) / validRunners.length;
    validRunners.forEach((rb, idx) => {
      const rx = 110 + idx * (rCardW + 16);
      const ry = runnerY + 70;
      const rh = 150;

      drawRoundRect(ctx, rx, ry, rCardW, rh, 18);
      ctx.fillStyle = isParchment ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fill();

      ctx.font = '800 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = accentColor;
      ctx.fillText(`#${idx + 2}`, rx + 18, ry + 32);

      ctx.font = '800 17px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = textPrimary;
      const lines = wrapText(ctx, rb.title, rCardW - 36, 2);
      lines.forEach((l, i) => {
        ctx.fillText(l, rx + 18, ry + 62 + i * 22);
      });

      ctx.font = '700 14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = textMuted;
      ctx.fillText(`⏱ ${formatWrappedTime(rb.total_seconds)}`, rx + 18, ry + rh - 22);
    });
  } else {
    // Clean format pill chips
    ctx.font = '900 28px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    ctx.fillText(`${data.total_pages_read.toLocaleString()} Pages Read Across Your Library`, 110, runnerY + 110);
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(`${data.total_sessions} logged reading sessions in ${data.year}`, 110, runnerY + 150);
  }

  // ── Clean Watermark Footer ──
  ctx.textAlign = 'center';
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(`shiori · reading wrapped ${data.year}`, width / 2, 1840);

  ctx.restore();
}

/** Render 16:9 Landscape Card Format (1200 x 675) */
export async function renderLandscapeCard(
  canvas: HTMLCanvasElement,
  data: ReadingWrappedData,
  theme: WrappedCardTheme = 'parchment'
): Promise<void> {
  const width = 1200;
  const height = 675;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  drawBackground(ctx, width, height, theme);

  const isParchment = theme === 'parchment';
  const textPrimary = isParchment ? '#26170e' : '#faf8f5';
  const textMuted = isParchment ? '#7c6a58' : 'rgba(250, 248, 245, 0.65)';
  const cardFill = isParchment ? '#ede4ce' : '#181512';
  const cardStroke = isParchment ? 'rgba(180, 160, 130, 0.35)' : 'rgba(255, 255, 255, 0.08)';
  const accentColor = isParchment ? '#b05224' : '#f59e0b';

  ctx.save();

  // ════════════════════════════════════════════════════════════════
  // ── LEFT COLUMN: BRAND, ARCHETYPE & 4 STAT CARDS ──
  // ════════════════════════════════════════════════════════════════

  // Shiori Brand Pill
  const pillW = 84;
  const pillH = 32;
  drawRoundRect(ctx, 52, 48, pillW, pillH, 16);
  ctx.fillStyle = accentColor;
  ctx.fill();

  ctx.font = '900 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = isParchment ? '#ffffff' : '#0c0a08';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHIORI', 52 + pillW / 2, 48 + pillH / 2);

  ctx.textAlign = 'left';
  ctx.font = '800 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(`${data.year} READING WRAPPED`, 148, 64);

  // Hero Archetype Title
  ctx.font = '900 40px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textPrimary;
  ctx.fillText(data.persona_title || 'The Dedicated Reader', 52, 128);

  // Single clean line subtitle (NO long text!)
  ctx.font = '600 15px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(
    `${data.primary_rhythm || 'Balanced Reader'} · ${data.total_reading_days} Active Reading Days`,
    52,
    156
  );

  // 4 Big Clean Metric Cards (2x2 Grid)
  const statBoxY = 184;
  const bw = 268;
  const bh = 104;
  const miniStats = [
    { label: 'READING TIME', val: formatWrappedTime(data.total_seconds) },
    { label: 'BOOKS FINISHED', val: `${data.books_completed}` },
    { label: 'PAGES TURNED', val: data.total_pages_read.toLocaleString() },
    { label: 'ACTIVE STREAK', val: `${data.longest_streak || data.total_reading_days || 0}d` },
  ];

  miniStats.forEach((s, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const bx = 52 + col * (bw + 18);
    const by = statBoxY + row * (bh + 14);

    drawRoundRect(ctx, bx, by, bw, bh, 20);
    ctx.fillStyle = cardFill;
    ctx.fill();
    ctx.strokeStyle = cardStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '800 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(s.label, bx + 22, by + 34);

    ctx.font = '900 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    ctx.fillText(s.val, bx + 22, by + 78);
  });

  // Circadian Rhythm Activity Waveform Card
  const circBoxY = 422;
  const circBoxW = 554;
  const circBoxH = 152;
  drawRoundRect(ctx, 52, circBoxY, circBoxW, circBoxH, 20);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.strokeStyle = cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '800 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText('DAILY READING RHYTHM', 74, circBoxY + 30);

  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'right';
  ctx.fillText(`Peak focus at ${getPeakHourLabel(data.hourly_distribution)}`, 52 + circBoxW - 22, circBoxY + 30);
  ctx.textAlign = 'left';

  // 24-Hour Activity Histogram
  const histX = 74;
  const histY = circBoxY + 48;
  const histW = circBoxW - 44;
  const histH = 58;
  const maxHourlySec = Math.max(1, ...data.hourly_distribution.map(h => h.total_seconds));

  data.hourly_distribution.forEach((bucket, i) => {
    const barW = Math.max(4, (histW / 24) - 3.5);
    const barH = Math.max(4, (bucket.total_seconds / maxHourlySec) * histH);
    const bx = histX + i * (histW / 24);
    const by = histY + histH - barH;

    const isPeak = bucket.total_seconds === maxHourlySec && maxHourlySec > 0;
    drawRoundRect(ctx, bx, by, barW, barH, 2.5);
    ctx.fillStyle = isPeak
      ? accentColor
      : isParchment
      ? 'rgba(124, 106, 88, 0.25)'
      : 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
  });

  // Time Axis
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText('12 AM', histX, circBoxY + circBoxH - 12);
  ctx.fillText('12 PM', histX + histW / 2 - 16, circBoxY + circBoxH - 12);
  ctx.fillText('11 PM', histX + histW - 32, circBoxY + circBoxH - 12);

  // ════════════════════════════════════════════════════════════════
  // ── RIGHT COLUMN: TOP READ TITLE & RUNNERS UP (x = 636 to 1148) ──
  // ════════════════════════════════════════════════════════════════
  const rightBoxX = 636;
  const rightBoxY = 48;
  const rightBoxW = 512;
  const rightBoxH = 526;

  drawRoundRect(ctx, rightBoxX, rightBoxY, rightBoxW, rightBoxH, 24);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.strokeStyle = cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Badge pill
  drawRoundRect(ctx, rightBoxX + 26, rightBoxY + 26, 156, 28, 14);
  ctx.fillStyle = isParchment ? 'rgba(176, 82, 36, 0.1)' : 'rgba(245, 158, 11, 0.15)';
  ctx.fill();

  ctx.font = '800 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'center';
  ctx.fillText('#1 READ TITLE', rightBoxX + 26 + 78, rightBoxY + 40);
  ctx.textAlign = 'left';

  const topBook = data.top_books[0];
  const coverX = rightBoxX + 26;
  const coverY = rightBoxY + 68;
  const coverW = 162;
  const coverH = 244;

  let loadedCover: HTMLImageElement | null = null;
  if (topBook?.cover_path) {
    try {
      const src = topBook.cover_path.startsWith('http') || topBook.cover_path.startsWith('asset://')
        ? topBook.cover_path
        : convertFileSrc(topBook.cover_path.replace(/\\/g, '/'));
      loadedCover = await loadImage(src);
    } catch {
      loadedCover = null;
    }
  }

  drawModernBookCover(ctx, loadedCover, coverX, coverY, coverW, coverH, isParchment, topBook?.title || 'Top Selection');

  const bookInfoX = coverX + coverW + 24;
  const bookInfoW = rightBoxW - (coverW + 72);

  ctx.textAlign = 'left';
  if (topBook) {
    ctx.font = '900 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    const lines = wrapText(ctx, topBook.title, bookInfoW, 3);
    lines.forEach((l, idx) => {
      ctx.fillText(l, bookInfoX, coverY + 34 + idx * 30);
    });

    const by = coverY + 38 + lines.length * 30;
    ctx.font = '600 15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(topBook.author || 'Unknown Author', bookInfoX, by);

    // Duration Pill
    const pillY = by + 20;
    drawRoundRect(ctx, bookInfoX, pillY, 180, 38, 19);
    ctx.fillStyle = isParchment ? 'rgba(176, 82, 36, 0.1)' : 'rgba(245, 158, 11, 0.15)';
    ctx.fill();

    ctx.font = '800 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(`⏱ ${formatWrappedTime(topBook.total_seconds)} read`, bookInfoX + 18, pillY + 24);
  }

  // Runners Up Section (strictly books with actual reading seconds!)
  const validRunners = (data.top_books || [])
    .slice(1)
    .filter(b => b.total_seconds > 0)
    .slice(0, 3);

  const ry = rightBoxY + 338;
  ctx.font = '800 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(validRunners.length > 0 ? 'MORE BOOKS READ' : 'LIBRARY HIGHLIGHT', rightBoxX + 26, ry);

  if (validRunners.length > 0) {
    const rCardW = (rightBoxW - 52 - (validRunners.length - 1) * 10) / validRunners.length;
    validRunners.forEach((rb, idx) => {
      const rx = rightBoxX + 26 + idx * (rCardW + 10);
      const rCardY = ry + 14;
      const rCardH = 104;

      drawRoundRect(ctx, rx, rCardY, rCardW, rCardH, 14);
      ctx.fillStyle = isParchment ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fill();

      // Rank Pill
      ctx.font = '800 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = accentColor;
      ctx.fillText(`#${idx + 2}`, rx + 14, rCardY + 24);

      // Book Title
      ctx.font = '700 13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = textPrimary;
      const rLines = wrapText(ctx, rb.title, rCardW - 28, 2);
      rLines.forEach((rl, i) => {
        ctx.fillText(rl, rx + 14, rCardY + 46 + i * 18);
      });

      // Reading Time
      ctx.font = '700 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = textMuted;
      ctx.fillText(`⏱ ${formatWrappedTime(rb.total_seconds)}`, rx + 14, rCardY + rCardH - 14);
    });
  } else {
    // If no other books have logged time
    const rCardY = ry + 14;
    const rCardH = 104;
    drawRoundRect(ctx, rightBoxX + 26, rCardY, rightBoxW - 52, rCardH, 14);
    ctx.fillStyle = isParchment ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.04)';
    ctx.fill();

    ctx.font = '800 16px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textPrimary;
    ctx.fillText(`${data.total_pages_read.toLocaleString()} Total Pages Turned Across Your Library`, rightBoxX + 44, rCardY + 44);

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText(`Keep reading to log more titles into your annual review.`, rightBoxX + 44, rCardY + 72);
  }

  // ════════════════════════════════════════════════════════════════
  // ── FOOTER: CLEAN MINIMALIST WATERMARK ──
  // ════════════════════════════════════════════════════════════════
  ctx.textAlign = 'center';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = textMuted;
  ctx.fillText(`shiori · reading wrapped ${data.year}`, width / 2, 626);

  ctx.restore();
}
