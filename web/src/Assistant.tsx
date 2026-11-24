/**
 * "🤖 עוזרת חמ״ל" — floating smart shift assistant (bottom-left).
 * Answers come from POST /api/assistant/ask, which reads the live database; there is no
 * external AI service. Works for guests, volunteers and the commander (the current sign-in,
 * if any, is sent so "המשמרות שלי" can answer personally).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, currentArea } from './api.ts';
import { bookShift } from './deepLink.ts';

const GREETING = 'שלום! אני עוזרת החמ"ל של יחידת המתנדבים. במה אוכל לעזור?';
const CHIPS = ['🚨 איפה חסר נהג השבוע?', '📅 אילו משמרות פנויות השבוע?', '🏆 מי בטופ 5 החודש?', '📋 מה חוקי הרישום והביטול?'];
const MAX_LEN = 300;
const MIN_TYPING_MS = 450;

interface Answer {
  intent: string;
  answer: string;
  suggestions: string[];
  actions?: { shiftId: string; label: string }[];
  needsLogin?: boolean;
}

type Msg =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'bot'; text: string; data?: Answer; error?: boolean };

let nextId = 1;

function BotFace({ size = 22 }: { size?: number }) {
  return (
    <svg className="bot-face" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bot-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <line x1="16" y1="3" x2="16" y2="7" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" />
      <circle className="bot-antenna" cx="16" cy="3" r="2.2" fill="#ef4444" />
      <rect x="5" y="8" width="22" height="18" rx="7" fill="url(#bot-head)" stroke="#bae6fd" strokeOpacity="0.6" />
      <rect x="9" y="12.5" width="14" height="8" rx="4" fill="#06122a" />
      <circle className="bot-eye" cx="13" cy="16.5" r="1.8" fill="#7dd3fc" />
      <circle className="bot-eye" cx="19" cy="16.5" r="1.8" fill="#7dd3fc" />
      <rect x="2.5" y="14" width="2.5" height="6" rx="1.2" fill="#38bdf8" />
      <rect x="27" y="14" width="2.5" height="6" rx="1.2" fill="#38bdf8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* points left: "forward" in RTL */}
      <path d="M21 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: nextId++, from: 'bot', text: GREETING }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const inCommander = hash.startsWith('#/commander');

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    fabRef.current?.focus({ preventScroll: true });
  }

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_LEN);
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { id: nextId++, from: 'user', text: q }]);
    setBusy(true);
    const started = Date.now();
    let reply: Msg;
    try {
      const data = await api<Answer>('/assistant/ask', { method: 'POST', body: { question: q }, area: currentArea() });
      reply = { id: nextId++, from: 'bot', text: data.answer, data };
    } catch (e) {
      reply = { id: nextId++, from: 'bot', text: e instanceof Error ? e.message : 'משהו השתבש. כדאי לנסות שוב.', error: true };
    }
    const wait = MIN_TYPING_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setMsgs((m) => [...m, reply]);
    setBusy(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(text);
  }

  function goBook(shiftId: string) {
    setOpen(false);
    bookShift(shiftId);
  }

  function goLogin() {
    setOpen(false);
    location.hash = '#/';
  }

  const lastBot = [...msgs].reverse().find((m) => m.from === 'bot');

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`assist-fab${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls="assist-drawer"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="assist-fab-ping" aria-hidden="true" />
        <BotFace size={24} />
        <span className="assist-fab-label">עוזרת חמ״ל</span>
      </button>

      <section
        id="assist-drawer"
        className={`assist-drawer${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="assist-head">
          <span className="assist-avatar">
            <BotFace size={26} />
            <span className="assist-online" aria-hidden="true" />
          </span>
          <div className="assist-head-text">
            <h2 id={titleId}>🤖 עוזרת חמ״ל AI</h2>
            <p>תשובות מנתוני המשמרות בזמן אמת</p>
          </div>
          <button type="button" className="assist-close" onClick={close} aria-label="סגירת העוזרת">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="assist-chips" role="group" aria-label="שאלות מהירות">
          {CHIPS.map((c) => (
            <button key={c} type="button" className="assist-chip" disabled={busy} onClick={() => void ask(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="assist-log" ref={listRef} aria-live="polite" aria-busy={busy}>
          {msgs.map((m) =>
            m.from === 'user' ? (
              <div key={m.id} className="assist-msg from-user">
                <p className="assist-bubble">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className={`assist-msg from-bot${m.error ? ' is-error' : ''}`}>
                <span className="assist-msg-avatar" aria-hidden="true">
                  <BotFace size={18} />
                </span>
                <div className="assist-msg-body">
                  <p className="assist-bubble">{m.text}</p>
                  {m.data?.needsLogin && !inCommander && (
                    <div className="assist-actions">
                      <button type="button" className="assist-action" onClick={goLogin}>
                        כניסה למערכת
                      </button>
                    </div>
                  )}
                  {!inCommander && m.data?.actions && m.data.actions.length > 0 && (
                    <div className="assist-actions">
                      {m.data.actions.map((a) => (
                        <button key={a.shiftId} type="button" className="assist-action" onClick={() => goBook(a.shiftId)}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m === lastBot && m.data?.intent === 'fallback' && (
                    <div className="assist-inline-chips">
                      {m.data.suggestions.map((s) => (
                        <button key={s} type="button" className="assist-chip is-inline" disabled={busy} onClick={() => void ask(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="assist-msg from-bot">
              <span className="assist-msg-avatar" aria-hidden="true">
                <BotFace size={18} />
              </span>
              <p className="assist-bubble assist-typing" aria-label="העוזרת מקלידה">
                <span />
                <span />
                <span />
              </p>
            </div>
          )}
        </div>

        <form className="assist-form" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            className="assist-input"
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            placeholder="כתבו שאלה… למשל: מה פנוי מחר?"
            aria-label="שאלה לעוזרת"
            enterKeyHint="send"
          />
          <button type="submit" className="assist-send" disabled={busy || !text.trim()} aria-label="שליחה">
            <SendIcon />
          </button>
        </form>
      </section>
    </>
  );
}
