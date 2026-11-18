/**
 * "📸 הורד תמונת חוסרים למפקד": draws the weekly shortages report as a crisp PNG card with
 * HTML5 Canvas (no extra library). Width 1080 px drawn at 2× → a 2160 px wide image that stays
 * sharp after WhatsApp compresses it.
 *
 * Hebrew + numbers in one canvas string are laid out differently by different browsers, so every
 * line is drawn as separate pieces placed right-to-left by hand (pure-Hebrew pieces, number
 * pieces, the pill). The result looks the same in Chrome, Safari and Firefox.
 */

export type ImageShiftType = 'MORNING' | 'EVENING' | 'NIGHT';
export interface ImageItem {
  date: string; // YYYY-MM-DD
  shiftType: ImageShiftType;
  missing: number;
}

const SHIFT_NAME: Record<ImageShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };
const FONT = 'Rubik, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif';
const W = 1080; // CSS px; drawn at SCALE
const SCALE = 2;
const PAD = 64;

const COLORS = {
  bgTop: '#0B192C',
  bgBottom: '#132743',
  red: '#DC2626',
  amber: '#D97706',
  green: '#16A34A',
  white: '#FFFFFF',
  soft: 'rgba(255,255,255,0.72)',
  faint: 'rgba(255,255,255,0.5)',
  row: 'rgba(255,255,255,0.055)',
  rowLine: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.16)',
};

/** "15/11" */
export function ddmm(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}
/** "18/11/2026" */
export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
/** "יום ראשון" */
export function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' });
}
/** "חסרים 2" / "חסר 1" split into [word, number] */
export function pillParts(missing: number): [string, string] {
  return [missing === 1 ? 'חסר' : 'חסרים', String(missing)];
}
export const pillColor = (missing: number) => (missing >= 2 ? COLORS.red : COLORS.amber);
/** shortages-week-<first day of the week>.png */
export const reportFileName = (weekStart: string) => `shortages-week-${weekStart}.png`;

type Ctx = CanvasRenderingContext2D;
type Piece = { text: string; font: string; color: string; rtl?: boolean };

function setFont(ctx: Ctx, font: string) {
  ctx.font = `${font} ${FONT}`;
}
function width(ctx: Ctx, p: Piece): number {
  setFont(ctx, p.font);
  return ctx.measureText(p.text).width;
}
/** Draw pieces from right edge `x` leftwards (RTL order). Returns the x where the line ended. */
function drawRtl(ctx: Ctx, pieces: Piece[], x: number, y: number, gap = 10): number {
  let cur = x;
  for (const p of pieces) {
    setFont(ctx, p.font);
    ctx.fillStyle = p.color;
    ctx.textAlign = 'right';
    try {
      (ctx as unknown as { direction: string }).direction = p.rtl === false ? 'ltr' : 'rtl';
    } catch {
      /* older browsers: pieces are short and single-direction, so this is only a nicety */
    }
    ctx.fillText(p.text, cur, y);
    cur -= width(ctx, p) + gap;
  }
  return cur + gap;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rounded pill "חסרים 2", its LEFT edge at `left` (pills line up), vertically centred on `cy`. */
function drawPill(ctx: Ctx, missing: number, left: number, cy: number): number {
  const [word, num] = pillParts(missing);
  const wp: Piece = { text: word, font: '700 30px', color: COLORS.white };
  const np: Piece = { text: num, font: '800 32px', color: COLORS.white, rtl: false };
  const inner = width(ctx, wp) + 10 + width(ctx, np);
  const w = inner + 44;
  const h = 54;
  const x = left;
  const rightEdge = left + w;
  ctx.fillStyle = pillColor(missing);
  roundRect(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.textBaseline = 'middle';
  drawRtl(ctx, [wp, np], rightEdge - 22, cy + 1, 10);
  ctx.textBaseline = 'alphabetic';
  return w;
}

/** Subtle police styling: red/blue light-bar glow at the top, light bar strip, faint car outline. */
function drawBackdrop(ctx: Ctx, h: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, h);

  for (const [cx, color] of [
    [W * 0.18, 'rgba(220,38,38,0.22)'],
    [W * 0.82, 'rgba(37,99,235,0.24)'],
  ] as const) {
    const g = ctx.createRadialGradient(cx, -40, 10, cx, -40, 420);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 460);
  }
  // light bar strip
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, '#DC2626');
  bar.addColorStop(0.48, '#DC2626');
  bar.addColorStop(0.52, '#2563EB');
  bar.addColorStop(1, '#2563EB');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 10);

  // faint patrol-car outline, bottom-left corner
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  const bx = 40;
  const by = h - 230;
  roundRect(ctx, bx, by + 70, 320, 90, 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + 60, by + 70);
  ctx.lineTo(bx + 105, by + 15);
  ctx.lineTo(bx + 215, by + 15);
  ctx.lineTo(bx + 260, by + 70);
  ctx.stroke();
  for (const wx of [bx + 75, bx + 245]) {
    ctx.beginPath();
    ctx.arc(wx, by + 160, 30, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(bx + 135, by - 5, 50, 14);
  ctx.restore();
}

/** Measure + draw. Returns the finished canvas (2160 px wide). */
export function drawShortagesImage(
  data: { today: string; items: ImageItem[]; week?: { from: string; to: string } | null },
  doc: Document = document,
): HTMLCanvasElement {
  const items = data.items.filter((i) => i.missing > 0);
  const ROW = 78;
  const ROW_GAP = 10;
  const DAY_GAP = 14;
  const dayBreaks = items.reduce((n, it, i) => n + (i > 0 && it.date !== items[i - 1].date ? 1 : 0), 0);
  const listH = items.length === 0 ? ROW : items.length * ROW + (items.length - 1) * ROW_GAP + dayBreaks * DAY_GAP;
  const H = 64 + 70 + 52 + 40 + 1 + 40 + listH + 44 + 1 + 52 + 50 + 40 + 56;

  const canvas = doc.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  drawBackdrop(ctx, H);

  const R = W - PAD; // right edge (RTL start)
  let y = 64 + 52;

  // header
  drawRtl(ctx, [{ text: '🚔 חוסרים במשמרות | יחידת מתנדבים', font: '800 52px', color: COLORS.white }], R, y);
  y += 52;
  // "שבוע 15/11 – 21/11 | נכון לתאריך: 18/11/2026"
  drawRtl(
    ctx,
    [
      ...(data.week
        ? ([
            { text: 'שבוע', font: '400 30px', color: COLORS.soft },
            { text: `${ddmm(data.week.from)} – ${ddmm(data.week.to)}`, font: '600 30px', color: COLORS.white, rtl: false },
            { text: '|', font: '400 30px', color: COLORS.faint },
          ] as Piece[])
        : []),
      { text: 'נכון לתאריך:', font: '400 30px', color: COLORS.soft },
      { text: ddmmyyyy(data.today), font: '600 30px', color: COLORS.white, rtl: false },
    ],
    R,
    y,
    10,
  );
  y += 40;
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(PAD, y, W - 2 * PAD, 1);
  y += 1 + 40;

  // rows
  if (items.length === 0) {
    ctx.fillStyle = COLORS.row;
    roundRect(ctx, PAD, y, W - 2 * PAD, ROW, 18);
    ctx.fill();
    drawRtl(ctx, [{ text: '✅ אין חוסרים בשבוע זה – כל המשמרות מאוישות', font: '600 32px', color: '#86EFAC' }], R - 26, y + ROW / 2 + 11);
    y += ROW;
  }
  items.forEach((it, i) => {
    if (i > 0) y += ROW_GAP + (it.date !== items[i - 1].date ? DAY_GAP : 0);
    ctx.fillStyle = COLORS.row;
    roundRect(ctx, PAD, y, W - 2 * PAD, ROW, 18);
    ctx.fill();
    ctx.strokeStyle = COLORS.rowLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    const base = y + ROW / 2 + 11;
    drawRtl(
      ctx,
      [
        { text: '•', font: '700 34px', color: COLORS.faint },
        { text: weekday(it.date), font: '700 33px', color: COLORS.white },
        { text: `(${ddmm(it.date)})`, font: '500 31px', color: COLORS.soft, rtl: false },
        { text: '—', font: '400 31px', color: COLORS.faint },
        { text: `משמרת ${SHIFT_NAME[it.shiftType]}:`, font: '600 33px', color: COLORS.white },
      ],
      R - 26,
      base,
      12,
    );
    drawPill(ctx, it.missing, PAD + 22, y + ROW / 2); // pills line up on the left (end of the RTL line)
    y += ROW;
  });

  // footer
  y += 44;
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(PAD, y, W - 2 * PAD, 1);
  y += 1 + 52;
  const total = items.reduce((n, i) => n + i.missing, 0);
  drawRtl(
    ctx,
    [
      { text: 'סה״כ חוסרים בשבוע זה:', font: '700 36px', color: COLORS.white },
      { text: String(total), font: '800 38px', color: total > 0 ? '#FCA5A5' : '#86EFAC', rtl: false },
      { text: total === 1 ? 'מתנדב' : 'מתנדבים', font: '700 36px', color: COLORS.white },
    ],
    R,
    y,
    12,
  );
  y += 50;
  drawRtl(ctx, [{ text: 'הופק ממערכת ניהול מתנדבים', font: '400 24px', color: COLORS.faint }], R, y);
  return canvas;
}

/** Load the page font before drawing, so the image doesn't fall back to a system font. */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.all(['800 52px', '700 36px', '600 33px', '400 24px'].map((f) => document.fonts.load(`${f} Rubik`, 'אבג')));
  } catch {
    /* system Hebrew font is fine */
  }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('לא הצלחנו ליצור את התמונה.'))), 'image/png'));
}
