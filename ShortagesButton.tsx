import { useState } from 'react';
import { api } from '../api.ts';
import { Sheet, toast } from '../ui.tsx';
import { ChatIcon, CheckIcon, ClipboardIcon } from '../icons.tsx';

interface Summary {
  text: string;
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

/**
 * "העתק רשימת חוסרים לוואטסאפ": builds the live shortage summary for the next 7 days on the
 * server and copies it to the clipboard. The text is requested inside the click itself
 * (ClipboardItem with a pending value), so Safari/iPhone also allow the copy. If the browser
 * still refuses, the text opens in a window with its own copy button.
 */
export function ShortagesButton() {
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<Summary | null>(null);

  function done(s: Summary) {
    toast(
      s.shiftsWithShortage === 0
        ? 'אין חוסרים השבוע – ההודעה הועתקה. אפשר להדביק בוואטסאפ.'
        : `רשימת החוסרים הועתקה (${s.shiftsWithShortage} משמרות). אפשר להדביק בוואטסאפ.`,
    );
  }

  async function copy() {
    setBusy(true);
    const pending = api<Summary>('/admin/shortages');
    try {
      const C = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (C && navigator.clipboard?.write) {
        await navigator.clipboard.write([new C({ 'text/plain': pending.then((s) => new Blob([s.text], { type: 'text/plain' })) })]);
      } else {
        await navigator.clipboard.writeText((await pending).text);
      }
      done(await pending);
    } catch {
      try {
        const s = await pending; // the summary itself may have failed
        if (copyViaTextarea(s.text)) done(s);
        else setFallback(s);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'לא הצלחנו להכין את רשימת החוסרים.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-whatsapp" onClick={copy} disabled={busy}>
        <ChatIcon size={17} />
        {busy ? 'מכינים רשימה…' : 'העתק רשימת חוסרים לוואטסאפ'}
      </button>
      {fallback && <FallbackSheet summary={fallback} onClose={() => setFallback(null)} onCopied={() => done(fallback)} />}
    </>
  );
}

function FallbackSheet({ summary, onClose, onCopied }: { summary: Summary; onClose: () => void; onCopied: () => void }) {
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
    <Sheet title="ריכוז חוסרים לוואטסאפ" onClose={onClose}>
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
