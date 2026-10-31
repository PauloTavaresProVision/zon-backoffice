import {
  BookCheck, CircleCheck, CircleSlash, FileText, FileX, KeyRound, Landmark, Link2, Lock, LockOpen, LogIn, LogOut, MessageSquare, MessageSquareX, Power,
  PowerOff, Send, TriangleAlert, Tv, Unlink, UserCog, UserPlus, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { dateTime } from "@/lib/format";

const KINDS: Record<string, { Icon: LucideIcon; tone?: "good" | "gold" | "crit" }> = {
  "payment.paid": { Icon: CircleCheck, tone: "good" },
  "payment.reference": { Icon: Landmark, tone: "gold" },
  "payment.cancelled": { Icon: CircleSlash },
  "payment.mismatch": { Icon: TriangleAlert, tone: "crit" },
  "payment.duplicate": { Icon: TriangleAlert, tone: "crit" },
  "ixc.settled": { Icon: BookCheck, tone: "good" },
  "ixc.already_settled": { Icon: TriangleAlert, tone: "crit" },
  "sms.sent": { Icon: MessageSquare, tone: "gold" },
  "sms.failed": { Icon: MessageSquareX, tone: "crit" },
  "invoice.issued": { Icon: FileText },
  "invoice.cancelled": { Icon: FileX, tone: "crit" },
  "invoice.link": { Icon: Send },
  "officegest.link": { Icon: Link2 },
  "ixc.import": { Icon: UserPlus },
  "customer.activated": { Icon: Power, tone: "good" },
  "customer.deactivated": { Icon: PowerOff, tone: "crit" },
  "box.approved": { Icon: Tv, tone: "good" },
  "box.rejected": { Icon: CircleSlash },
  "box.blocked": { Icon: Lock, tone: "crit" },
  "box.unblocked": { Icon: LockOpen, tone: "good" },
  "box.removed": { Icon: Unlink },
  "user.created": { Icon: UserPlus },
  "user.updated": { Icon: UserCog },
  login: { Icon: LogIn },
  logout: { Icon: LogOut },
};

/** Mensagens guardadas com **negrito**; o texto nunca é tratado como HTML. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

export type FeedEntry = {
  id: number; at: Date; kind: string; message: string;
  customerId: number | null; customerName: string | null; userName: string | null;
};

export function Feed({ items, showCustomer = false, empty = "Sem atividade." }: { items: FeedEntry[]; showCustomer?: boolean; empty?: string }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div className="feed">
      {items.map((a) => {
        const k = KINDS[a.kind] ?? { Icon: KeyRound };
        return (
          <div className="feed-item" key={a.id}>
            <span className={`feed-ico ${k.tone ?? ""}`}><k.Icon className="ico" aria-hidden /></span>
            <div>
              <p>
                {showCustomer && a.customerId && a.customerName
                  ? <><Link href={`/clientes/${a.customerId}`}><b>{a.customerName}</b></Link> · </>
                  : null}
                <Rich text={a.message} />
              </p>
              <time dateTime={a.at.toISOString()}>{dateTime(a.at)}{a.userName && !a.message.includes(a.userName) ? ` · ${a.userName}` : ""}</time>
            </div>
          </div>
        );
      })}
    </div>
  );
}
