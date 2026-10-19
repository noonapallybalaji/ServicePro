import { Button, Dialog, DialogBody, DialogContent, DialogHeader, Text } from '@servicepro/ui';
import { ChevronRight, CircleHelp, Info, LayoutGrid, LifeBuoy, ListChecks, MessageCircle, Phone, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { SITE, whatsappLink } from '../site';

/** The bottom bar's App and More sheets (loaded on first open). */
export default function ActionSheet({ kind, onClose, onRequest }: { kind: 'app' | 'more'; onClose: () => void; onRequest: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {kind === 'app' ? (
        <AppSheet
          onRequest={() => {
            onClose();
            onRequest();
          }}
        />
      ) : (
        <MoreSheet onClose={onClose} />
      )}
    </Dialog>
  );
}

function AppSheet({ onRequest }: { onRequest: () => void }) {
  return (
    <DialogContent aria-describedby={undefined}>
      <DialogHeader title="Our app is coming soon" />
      <DialogBody className="flex flex-col gap-4 pb-6">
        <Text tone="secondary">
          We're building a {SITE.name} app. Until then, everything works right here: request a repair, track your technician and pay your bill.
        </Text>
        <Button size="lg" onClick={onRequest} className="w-full">
          <Wrench aria-hidden /> Request a repair
        </Button>
      </DialogBody>
    </DialogContent>
  );
}

/** Everything that isn't a bottom-bar button: help, bookings, chat, and the pages the phone footer leaves out. */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const whatsapp = whatsappLink('Hi, I have a question.');
  return (
    <DialogContent aria-describedby={undefined}>
      <DialogHeader title="More" />
      <DialogBody className="pb-6">
        <ul className="flex flex-col divide-y divide-border">
          <MoreItem to="/account" icon={<ListChecks aria-hidden />} title="Track my booking" text="Your bookings, technician and bills" onClose={onClose} />
          <MoreItem to="/help" icon={<LifeBuoy aria-hidden />} title="Help centre" text="Answers about visits, payments and warranty" onClose={onClose} />
          {whatsapp ? <MoreItem href={whatsapp} icon={<MessageCircle aria-hidden />} title="Chat on WhatsApp" text="Book, check a booking or ask a question" onClose={onClose} /> : null}
          {SITE.phone ? <MoreItem href={`tel:${SITE.phone}`} icon={<Phone aria-hidden />} title="Call us" text={SITE.phone} onClose={onClose} /> : null}
          <MoreItem to="/services" icon={<LayoutGrid aria-hidden />} title="All services" onClose={onClose} />
          <MoreItem to="/faq" icon={<CircleHelp aria-hidden />} title="FAQ" onClose={onClose} />
          <MoreItem to="/about" icon={<Info aria-hidden />} title="About us" onClose={onClose} />
          <MoreItem to="/contact" icon={<Phone aria-hidden />} title="Contact" onClose={onClose} />
        </ul>
      </DialogBody>
    </DialogContent>
  );
}

function MoreItem({ href, to, icon, title, text, onClose }: { href?: string; to?: string; icon: ReactNode; title: string; text?: string; onClose: () => void }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary [&_svg]:size-5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-foreground">{title}</span>
        {text ? <span className="truncate text-sm text-foreground-secondary">{text}</span> : null}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-muted" />
    </>
  );
  const className = 'transition-interactive flex min-h-14 items-center gap-3 rounded-control px-1 py-2 hover:bg-surface-sunken';
  return (
    <li>
      {href ? (
        <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className={className} onClick={onClose}>
          {body}
        </a>
      ) : (
        <Link to={to ?? '/'} className={className} onClick={onClose}>
          {body}
        </Link>
      )}
    </li>
  );
}
