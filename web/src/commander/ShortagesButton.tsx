import { useState } from 'react';
import { api } from '../api.ts';
import { Sheet, toast } from '../ui.tsx';
import { ChatIcon, CheckIcon, ClipboardIcon } from '../icons.tsx';

interface Summary {
  text: string;
  daysWithShortage: number;
  shiftsWithShortage: number;
  missingTotal: number;
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
export function ShortagesButton() {
  const [busy, setBusy] = useState<Format | null>(null);
  const [fallback, setFallback] = useState<{ summary: Summary; format: Format } | null>(null);

  function done(s: Summary, format: Format) {
    const detail =
      s.missingTotal === 0
        ? 'אין חוסרים בשבוע הקרוב.'
        : `${s.shiftsWithShortage} משמרות עם חוסרים.`;
    toast(`הועתק ללוח בהצלחה! ${detail} אפשר להדביק בוואטסאפ.`);
  }

  async function copy(format: Format) {
    setBusy(format);
    const pending = api<Summary>(`/admin/shortages?format=${format}`);
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
