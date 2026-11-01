import { checkServiceability } from '@servicepro/api-client';
import { cn, formatINR } from '@servicepro/ui';
import { ArrowUp, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { CHAT_ANSWERS, type ChatAnswer } from '../content/assistant-answers';
import { saveServiceLocation } from '../location/service-location';
import { SITE, whatsappLink } from '../site';
import { useActiveCategories, useBookAppliance } from './appliance-search';

/*
 * The help chat: a guided conversation with no AI and no running cost. It answers from what the site
 * already knows (appliances and visiting charges, the areas we serve, our FAQs) and hands anything
 * else to a person on WhatsApp with the customer's question already typed. Typed questions are
 * matched by keywords; a PIN code is checked live.
 */

type Topic = NonNullable<ChatAnswer['topic']>;

type Action =
  | { kind: 'menu' }
  | { kind: 'book'; code?: string }
  | { kind: 'area' }
  | { kind: 'track' }
  | { kind: 'prices' }
  | { kind: 'topics' }
  | { kind: 'topic'; topic: Topic }
  | { kind: 'answer'; index: number }
  | { kind: 'human' };

interface Choice {
  label: string;
  action?: Action;
  /** A page on the site instead of a reply. */
  to?: string;
}

interface Message {
  id: number;
  from: 'bot' | 'me';
  text: string;
  choices?: Choice[];
  /** Show the WhatsApp and call buttons under it. */
  contact?: boolean;
}

const TOPICS: { topic: Topic; label: string }[] = [
  { topic: 'payments', label: 'Payments & bills' },
  { topic: 'visit', label: 'The visit' },
  { topic: 'warranty', label: 'Warranty & problems' },
  { topic: 'account', label: 'Account & privacy' },
];

const MENU: Choice[] = [
  { label: 'Book a repair', action: { kind: 'book' } },
  { label: 'Do you serve my area?', action: { kind: 'area' } },
  { label: 'Track my booking', action: { kind: 'track' } },
  { label: 'Prices & charges', action: { kind: 'prices' } },
  { label: 'Payments, warranty & more', action: { kind: 'topics' } },
  { label: 'Talk to a person', action: { kind: 'human' } },
];

const GREETING: Message = {
  id: 0,
  from: 'bot',
  text: `Hi! I'm the ${SITE.name} help assistant. I can help you book a repair, check your area, track a booking or answer a question. Pick one, or type your question.`,
  choices: MENU,
};

// The conversation survives moving between pages (the launcher remounts with each page).
const conversation: { messages: Message[]; nextId: number; lastQuestion?: string } = { messages: [GREETING], nextId: 1 };

function append(added: Omit<Message, 'id'>[]): Message[] {
  conversation.messages = [...conversation.messages, ...added.map((m) => ({ ...m, id: conversation.nextId++ }))];
  return conversation.messages;
}

function rememberQuestion(text: string) {
  conversation.lastQuestion = text;
}

/* ── Understanding typed questions ───────────────────────────────────── */

const STOP = new Set(
  'a an the i me my we our you your is are am was be do does did can could will would to of in on at for and or it this that how what when where which who why with from by if please pls hi hello hey sir madam need want get have has there'.split(' '),
);

const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, '');
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

/** Each answer's words, weighted: the question counts most, then the keywords, then the answer. */
const INDEX = CHAT_ANSWERS.map((a) => {
  const weights = new Map<string, number>();
  const add = (text: string | undefined, weight: number) => words(text ?? '').forEach((w) => weights.set(w, Math.max(weights.get(w) ?? 0, weight)));
  add(a.answer, 1);
  add(a.keywords, 2);
  add(a.question, 3);
  return weights;
});

function bestAnswer(text: string): number | null {
  const query = [...new Set(words(text))];
  let best = -1;
  let bestScore = 0;
  INDEX.forEach((weights, i) => {
    const score = query.reduce((sum, w) => sum + (weights.get(w) ?? 0), 0);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  // At least one word from an answer's question (or two of its keywords).
  return bestScore >= 3 ? best : null;
}

const APPLIANCE_WORDS: [RegExp, string][] = [
  [/\b(ac|a\.c|air ?con\w*|split|window ac)\b/, 'AC'],
  [/\b(fridge|refrigerator|freezer)\b/, 'FRIDGE'],
  [/\b(washing|washer|washing machine)\b/, 'WASHER'],
  [/\b(tv|television|led|lcd|smart tv)\b/, 'TV'],
  [/\b(microwave|oven|otg)\b/, 'MICROWAVE'],
];

const applianceIn = (text: string) => APPLIANCE_WORDS.find(([re]) => re.test(text.toLowerCase()))?.[1];

/** Things people ask about that we don't repair (yet). */
const NOT_REPAIRED = /\b(laptop|computer|pc|mobile|phone|iphone|tablet|fan|geyser|water heater|cooler|chimney|dishwasher|ro|purifier|inverter battery|ups|car|bike|cctv|printer)s?\b/;

/** A problem being described ("my AC is not cooling"), not a question about how things work. */
const PROBLEM = /\b(not|no|isn't|doesn't|won't|stopped|broken|dead|leak\w*|nois\w*|smell\w*|spark\w*|error|issue|problem|repair|fix|service|install\w*|cooling|heating|spinning|draining|working)\b/;
const QUESTION_START = /^(do|does|can|could|is|are|what|why|how|should|will|which|when)\b/;

const hasContact = Boolean(SITE.whatsapp || SITE.phone);

/* ── The chat ─────────────────────────────────────────────────────────── */

export function HelpChat({ onLeave }: { onLeave: () => void }) {
  const { categories } = useActiveCategories();
  const book = useBookAppliance();
  const [messages, setMessages] = useState<Message[]>(() => conversation.messages);
  const [draft, setDraft] = useState('');
  const [awaitingPin, setAwaitingPin] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const name = (code: string) => categories.find((c) => c.code === code)?.name ?? code;
  const charge = (code: string) => categories.find((c) => c.code === code)?.baseVisitCharge;

  function push(...added: Omit<Message, 'id'>[]) {
    setMessages(append(added));
  }

  const whatsapp = (question?: string) => whatsappLink(`Hi ${SITE.name}, ${question ?? conversation.lastQuestion ?? 'I need help with an appliance repair.'}`);
  const more: Choice[] = [
    { label: 'Something else', action: { kind: 'menu' } },
    { label: 'Talk to a person', action: { kind: 'human' } },
  ];

  /** The bot's reply to a menu choice. */
  function reply(action: Action) {
    switch (action.kind) {
      case 'menu':
        setAwaitingPin(false);
        return push({ from: 'bot', text: 'What can I help with?', choices: MENU });
      case 'book': {
        if (!action.code) {
          const choices = categories.length
            ? categories.map((c) => ({ label: `${c.name} · ${formatINR(c.baseVisitCharge)}`, action: { kind: 'book', code: c.code } as Action }))
            : [{ label: 'Choose on the booking page', to: '/book' }];
          return push({ from: 'bot', text: 'Which appliance needs repair? The visiting charge is shown with each.', choices });
        }
        const visit = charge(action.code);
        push({
          from: 'bot',
          text: `Opening the booking for your ${name(action.code)}.${visit !== undefined ? ` The visiting charge is ${formatINR(visit)}; it's part of your final bill.` : ''} You confirm your number with a one-time code, then our team calls you to agree the visit time.`,
        });
        onLeave();
        return book(action.code);
      }
      case 'area':
        setAwaitingPin(true);
        return push({ from: 'bot', text: 'Type your 6-digit PIN code and I will check it.' });
      case 'track':
        return push({
          from: 'bot',
          text: 'My bookings shows every booking with its live status (sign in with your mobile number). The tracking link we send on WhatsApp works too, without signing in.',
          choices: [{ label: 'Open My bookings', to: '/account' }, ...more],
        });
      case 'prices': {
        const list = categories.map((c) => `• ${c.name}: ${formatINR(c.baseVisitCharge)}`).join('\n');
        return push({
          from: 'bot',
          text: `${list ? `Visiting charges:\n${list}\n\n` : ''}The visiting charge is part of your final bill. Any repair work or parts are priced by the technician and done only after you approve the estimate.`,
          choices: [{ label: 'Book a repair', action: { kind: 'book' } }, ...more],
        });
      }
      case 'topics':
        return push({ from: 'bot', text: 'Choose a topic.', choices: TOPICS.map((t) => ({ label: t.label, action: { kind: 'topic', topic: t.topic } })) });
      case 'topic':
        return push({
          from: 'bot',
          text: 'Common questions:',
          choices: CHAT_ANSWERS.flatMap((a, index) => (a.topic === action.topic ? [{ label: a.question, action: { kind: 'answer', index } as Action }] : [])),
        });
      case 'answer': {
        const a = CHAT_ANSWERS[action.index];
        if (!a) return reply({ kind: 'menu' });
        return push({ from: 'bot', text: a.answer, choices: [...(a.link ? [{ label: a.link.label, to: a.link.to }] : []), ...more] });
      }
      case 'human':
        setAwaitingPin(false);
        return push({
          from: 'bot',
          text: hasContact
            ? `Our team is happy to help. ${SITE.whatsapp ? 'Chat with us on WhatsApp (your question is already typed)' : 'Call us'}${SITE.whatsapp && SITE.phone ? ' or call us' : ''}.`
            : 'Our team is happy to help: send us a help request from the Help centre.',
          contact: true,
          choices: hasContact ? [] : [{ label: 'Help centre', to: '/help' }],
        });
    }
  }

  async function checkPin(pin: string) {
    setAwaitingPin(false);
    try {
      const result = await checkServiceability(pin);
      if (result.isServiceable) {
        const places = result.localities.slice(0, 3).join(', ');
        saveServiceLocation({ pincode: pin, areas: [...result.areas], locality: result.localities[0] });
        push({
          from: 'bot',
          text: `Yes, we serve ${pin}${places ? ` (${places})` : ''}. I've saved it as your location.`,
          choices: [{ label: 'Book a repair', action: { kind: 'book' } }, ...more],
        });
      } else {
        push({
          from: 'bot',
          text: `Sorry, we don't serve ${pin} yet. Our team can tell you if we can still help.`,
          contact: true,
          choices: [{ label: 'Try another PIN code', action: { kind: 'area' } }, { label: 'Talk to a person', action: { kind: 'human' } }],
        });
      }
    } catch {
      push({ from: 'bot', text: "I couldn't check that right now. Please try again in a moment.", choices: [{ label: 'Try again', action: { kind: 'area' } }, ...more] });
    }
  }

  /** The bot's reply to something typed. */
  function understand(text: string) {
    const lower = text.toLowerCase();
    const pin = /\b([1-9]\d{5})\b/.exec(text)?.[1];
    if (pin) return void checkPin(pin);
    if (awaitingPin) return push({ from: 'bot', text: 'A PIN code has 6 digits, like 500081. Please type yours.' });

    if (/\b(human|person|agent|executive|call me|talk|speak|complain\w*|manager|customer care)\b/.test(lower)) return reply({ kind: 'human' });
    if (/\b(track\w*|status|where is|my booking|my order|request number|sr-?\d)/.test(lower)) return reply({ kind: 'track' });

    const appliance = applianceIn(text);
    if (appliance && /\b(price|cost|charge\w*|how much|fee|rate)\b/.test(lower)) {
      const visit = charge(appliance);
      return push({
        from: 'bot',
        text: `${visit !== undefined ? `The visiting charge for ${name(appliance)} is ${formatINR(visit)}; it's part of your final bill. ` : ''}Repair work and parts are priced by the technician after checking it, and done only once you approve.`,
        choices: [{ label: `Book ${name(appliance)} repair`, action: { kind: 'book', code: appliance } }, ...more],
      });
    }
    if (/\b(price|prices|cost|charge\w*|how much|fee|rate\w*)\b/.test(lower)) return reply({ kind: 'prices' });

    // "My AC is not cooling": a repair to book, not a question to look up.
    if (appliance && PROBLEM.test(lower) && !QUESTION_START.test(lower.trim())) {
      return push({
        from: 'bot',
        text: `Sorry about your ${name(appliance)}. A technician can check it at home; you see the price before any work starts.`,
        choices: [{ label: `Book ${name(appliance)} repair`, action: { kind: 'book', code: appliance } }, ...more],
      });
    }
    if (!appliance && NOT_REPAIRED.test(lower)) {
      const list = categories.map((c) => c.name).join(', ');
      return push({
        from: 'bot',
        text: `Sorry, we don't repair that yet.${list ? ` We repair: ${list}.` : ''}${hasContact ? ' Our team can tell you if we can still help.' : ''}`,
        contact: hasContact,
        choices: [{ label: 'Something else', action: { kind: 'menu' } }],
      });
    }

    const index = bestAnswer(text);
    if (index !== null) return reply({ kind: 'answer', index });
    if (appliance) {
      return push({
        from: 'bot',
        text: `Sorry about your ${name(appliance)}. A technician can check it at home; you see the price before any work starts.`,
        choices: [{ label: `Book ${name(appliance)} repair`, action: { kind: 'book', code: appliance } }, ...more],
      });
    }
    if (/\b(book|repair|fix|service|technician|mechanic)\b/.test(lower)) return reply({ kind: 'book' });

    return push({
      from: 'bot',
      text: hasContact
        ? `I don't have an answer to that yet. Our team can help: ${SITE.whatsapp ? 'chat with us on WhatsApp (your question is already typed)' : 'call us'}, or pick something below.`
        : "I don't have an answer to that yet. Ask our team from the Help centre, or pick something below.",
      contact: hasContact,
      choices: [...(hasContact ? [] : [{ label: 'Help centre', to: '/help' }]), { label: 'Something else', action: { kind: 'menu' } }],
    });
  }

  function choose(choice: Choice) {
    if (!choice.action) return;
    push({ from: 'me', text: choice.label });
    reply(choice.action);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    rememberQuestion(text);
    push({ from: 'me', text });
    understand(text);
  }

  const last = messages.at(-1);
  const showContact = last?.contact === true;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={log} role="log" aria-live="polite" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex flex-col gap-2', m.from === 'me' ? 'items-end' : 'items-start')}>
            <p
              className={cn(
                'max-w-[85%] rounded-card px-3 py-2 text-caption whitespace-pre-line',
                m.from === 'me' ? 'rounded-tr-none bg-primary text-primary-foreground' : 'rounded-tl-none bg-surface-sunken text-foreground',
              )}
            >
              <span className="sr-only">{m.from === 'me' ? 'You: ' : `${SITE.name}: `}</span>
              {m.text}
            </p>
            {/* Choices only on the latest message, so the conversation reads in order. */}
            {m.choices?.length && m === last ? (
              <ul className="flex flex-wrap gap-2" aria-label="Choices">
                {m.choices.map((c) => (
                  <li key={c.label}>
                    {c.to ? (
                      <Link to={c.to} onClick={onLeave} className={CHIP}>
                        {c.label}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => choose(c)} className={CHIP}>
                        {c.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {showContact ? (
          <div className="flex flex-wrap gap-2">
            {SITE.whatsapp ? (
              <a href={whatsapp()} target="_blank" rel="noreferrer" className={cn(ACTION, 'bg-[#128c4a] text-[#fff] hover:bg-[#0f7a40]')}>
                <MessageCircle aria-hidden /> WhatsApp us
              </a>
            ) : null}
            {SITE.phone ? (
              <a href={`tel:${SITE.phone}`} className={cn(ACTION, 'border border-border bg-surface text-foreground hover:border-border-strong')}>
                <Phone aria-hidden /> Call {SITE.phone}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border pt-2">
        <label className="sr-only" htmlFor="help-chat-input">
          {awaitingPin ? 'PIN code' : 'Type your question'}
        </label>
        <input
          id="help-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode={awaitingPin ? 'numeric' : 'text'}
          maxLength={awaitingPin ? 6 : 300}
          autoComplete={awaitingPin ? 'postal-code' : 'off'}
          placeholder={awaitingPin ? '6-digit PIN code' : 'Type your question…'}
          className="h-10 min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim()}
          className="transition-interactive flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 [&_svg]:size-4"
        >
          <ArrowUp aria-hidden />
        </button>
      </form>
    </div>
  );
}

const CHIP =
  'transition-interactive inline-flex min-h-8 items-center rounded-pill border border-primary-border bg-primary-subtle px-3 py-1 text-left text-caption font-semibold text-primary-subtle-foreground hover:border-primary';
const ACTION = 'transition-interactive inline-flex h-9 items-center gap-2 rounded-pill px-3 text-caption font-semibold [&_svg]:size-4';
