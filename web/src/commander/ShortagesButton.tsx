import { useState } from 'react';
import { api } from '../api.ts';
import { Sheet, toast } from '../ui.tsx';
import { ChatIcon, CheckIcon, ClipboardIcon } from '../icons.tsx';
import { canvasToPng, drawShortagesImage, ensureFonts, reportFileName, type ImageItem } from './shortageImage.ts';

interface Summary {
  text: string;
  today: string;
  items: ImageItem[];
  week: { from: string; to: string } | null;
  draftsSkipped: number;
  daysWithShortage: number;
  shiftsWithShortage: number;
  missingTotal: number;
}

/** Can this browser share an image file (phones: WhatsApp share sheet)? */
function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Save a blob as a file (download). */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** When the phone won't open the share sheet automatically: preview + share / download buttons. */
function ImageFallbackSheet({ png, name, file, onClose }: { png: Blob; name: string; file: File; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(png));
  const canShare = canShareFile(file);
  async function share() {
    try {
      await navigator.share({ files: [file], title: 'חוסרים במשמרות' });
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('השיתוף נכשל – אפשר להוריד את התמונה.', 'error');
    }
  }
  return (
    <Sheet title="תמונת חוסרים למפקד" onClose={() => { URL.revokeObjectURL(url); onClose(); }}>
      <div className="sheet-body">
        <p className="muted small">הדפדפן לא אישר העתקה אוטומטית. אפשר לשתף ישירות לוואטסאפ או להוריד את התמונה.</p>
        <img className="image-preview" src={url} alt="תמונת חוסרים במשמרות לשבוע המוצג" />
      </div>
      <div className="sheet-foot sheet-foot-split">
        {canShare && (
          <button className="btn btn-whatsapp" onClick={share}>
            שיתוף (וואטסאפ)
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => { saveFile(png, name); toast(`התמונה הורדה (${name}).`); }}>
          ⬇️ הורד PNG
        </button>
      </div>
    </Sheet>
  );
}

/** Draft shifts of the week aren't in the reports (volunteers can't sign up for them yet). */
function draftsNote(s: { draftsSkipped?: number }): string {
  if (!s.draftsSkipped) return '';
  return s.draftsSkipped === 1 ? ' (משמרת אחת בשבוע עדיין טיוטה ולא נכללה.)' : ` (${s.draftsSkipped} משמרות בשבוע עדיין טיוטה ולא נכללו.)`;
}

/** Old-browser fallback: copy through a hidden textarea. */
function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

type Format = 'volunteers' | 'commander';

const LABEL: Record<Format, string> = {
  volunteers: 'העתק חוסרים למתנדבים',
  commander: 'העתק סיכום חוסרים למפקד',
};

/**
 * Two copy buttons, side by side:
 *  - "העתק חוסרים למתנדבים": every open shift with its own sign-up link (for the volunteers' group);
 *  - "העתק סיכום חוסרים למפקד": one short line per open shift (day, shift, missing), no links.
 * Each click builds the live text for the next 7 days on the server and copies it. The text is
 * requested inside the click itself (ClipboardItem with a pending value), so Safari/iPhone also
 * allow the copy. If the browser still refuses, the text opens in a window with its own button.
 */
/** weekStart: the week shown on the dashboard. Every export covers exactly that week. */
export function ShortagesButton({ weekStart }: { weekStart: string }) {
  const [busy, setBusy] = useState<Format | 'image' | null>(null);
  const [imageFallback, setImageFallback] = useState<{ png: Blob; name: string; file: File } | null>(null);
  const [fallback, setFallback] = useState<{ summary: Summary; format: Format } | null>(null);

  function done(s: Summary, format: Format) {
    const detail = s.missingTotal === 0 ? 'אין חוסרים בשבוע זה.' : `${s.shiftsWithShortage} משמרות עם חוסרים בשבוע זה.`;
    toast(`הועתק ללוח בהצלחה! ${detail}${draftsNote(s)} אפשר להדביק בוואטסאפ.`);
  }

  async function copy(format: Format) {
    setBusy(format);
    const pending = api<Summary>(`/admin/shortages?format=${format}&week=${weekStart}`);
    try {
      const C = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (C && navigator.clipboard?.write) {
        await navigator.clipboard.write([new C({ 'text/plain': pending.then((s) => new Blob([s.text], { type: 'text/plain' })) })]);
      } else {
        await navigator.clipboard.writeText((await pending).text);
      }
      done(await pending, format);
    } catch {
      try {
        const s = await pending; // the summary itself may have failed
        if (copyViaTextarea(s.text)) done(s, format);
        else setFallback({ summary: s, format });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'לא הצלחנו להכין את רשימת החוסרים.', 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  /** Draw this week's report as a PNG (and the file name / data it belongs to). */
  async function buildPng(): Promise<{ png: Blob; name: string; data: Summary }> {
    const data = await api<Summary>(`/admin/shortages?format=commander&week=${weekStart}`);
    await ensureFonts();
    const png = await canvasToPng(drawShortagesImage(data));
    return { png, name: reportFileName(data.week?.from ?? weekStart), data };
  }

  /**
   * "📋 העתק תמונת חוסרים למפקד":
   *  1. copy the PNG to the clipboard (paste with Ctrl+V into WhatsApp);
   *  2. if the browser blocks that (mostly phones): open the phone's share sheet with the image;
   *  3. otherwise: download shortages-week-<date>.png.
   * If the phone refuses to open the share sheet automatically, a small window offers
   * "שיתוף" / "הורד PNG" (a fresh tap is always allowed).
   */
  async function copyImage() {
    setBusy('image');
    const pending = buildPng();
    pending.catch(() => undefined);
    let copiedOk = false;
    const C = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (C && navigator.clipboard?.write) {
      try {
        // The write starts inside the click (Safari requires it) and waits for the image.
        await navigator.clipboard.write([new C({ 'image/png': pending.then((r) => r.png) })]);
        copiedOk = true;
      } catch {
        copiedOk = false;
      }
    }
    try {
      const r = await pending;
      if (copiedOk) {
        toast(`✅ התמונה הועתקה ללוח! כעת ניתן להדביק (Ctrl+V) בוואטסאפ${draftsNote(r.data)}`);
        return;
      }
      const file = new File([r.png], r.name, { type: 'image/png' });
      if (canShareFile(file)) {
        try {
          await navigator.share({ files: [file], title: 'חוסרים במשמרות' });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // the user closed the share sheet
          setImageFallback({ ...r, file }); // share not allowed without a fresh tap
          return;
        }
      }
      saveFile(r.png, r.name);
      toast(`הדפדפן לא מאפשר העתקת תמונה – התמונה הורדה (${r.name}). אפשר לצרף אותה בוואטסאפ.${draftsNote(r.data)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'לא הצלחנו ליצור את התמונה.', 'error');
    } finally {
      setBusy(null);
    }
  }

  /** "⬇️ הורד PNG": just save the file. */
  async function downloadPng() {
    setBusy('image');
    try {
      const r = await buildPng();
      saveFile(r.png, r.name);
      toast(`התמונה הורדה (${r.name}).${draftsNote(r.data)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'לא הצלחנו ליצור את התמונה.', 'error');
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="shortage-buttons" role="group" aria-label="העתקת חוסרים לוואטסאפ">
      <button className="btn btn-whatsapp" onClick={() => copy('volunteers')} disabled={busy !== null} title="כל משמרת פנויה עם קישור הרשמה ישיר">
        <ChatIcon size={17} />
        {busy === 'volunteers' ? 'מכינים…' : LABEL.volunteers}
      </button>
      <button className="btn btn-commander-copy" onClick={() => copy('commander')} disabled={busy !== null} title="שורה לכל משמרת חסרה: יום, משמרת וכמה חסרים – בלי קישורים">
        <ClipboardIcon size={17} />
        {busy === 'commander' ? 'מכינים…' : LABEL.commander}
      </button>
      <span className="image-export">
        <button className="btn btn-image" onClick={copyImage} disabled={busy !== null} title="תמונת PNG של החוסרים בשבוע המוצג – להדבקה בוואטסאפ">
          {busy === 'image' ? 'מכינים תמונה…' : '📋 העתק תמונת חוסרים למפקד'}
        </button>
        <button className="link-small" onClick={downloadPng} disabled={busy !== null} title="שמירת התמונה כקובץ PNG">
          ⬇️ הורד PNG
        </button>
      </span>
      {imageFallback && (
        <ImageFallbackSheet
          {...imageFallback}
          onClose={() => setImageFallback(null)}
        />
      )}
      {fallback && (
        <FallbackSheet
          summary={fallback.summary}
          title={LABEL[fallback.format].replace('העתק ', '')}
          onClose={() => setFallback(null)}
          onCopied={() => done(fallback.summary, fallback.format)}
        />
      )}
    </div>
  );
}

function FallbackSheet({ summary, title, onClose, onCopied }: { summary: Summary; title: string; onClose: () => void; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyNow() {
    try {
      await navigator.clipboard.writeText(summary.text);
    } catch {
      if (!copyViaTextarea(summary.text)) {
        toast('הדפדפן לא מאפשר העתקה אוטומטית. סמנו את הטקסט והעתיקו ידנית.', 'error');
        return;
      }
    }
    setCopied(true);
    onCopied();
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="sheet-body">
        <p className="muted small">הדפדפן לא אישר העתקה אוטומטית. לחצו על הכפתור, או סמנו את הטקסט והעתיקו.</p>
        <textarea className="shortage-text" readOnly value={summary.text} rows={12} onFocus={(e) => e.currentTarget.select()} dir="rtl" />
      </div>
      <div className="sheet-foot">
        <button className="btn btn-whatsapp btn-block" onClick={copyNow}>
          {copied ? <CheckIcon size={17} /> : <ClipboardIcon size={17} />}
          {copied ? 'הועתק' : 'העתקה'}
        </button>
      </div>
    </Sheet>
  );
}
