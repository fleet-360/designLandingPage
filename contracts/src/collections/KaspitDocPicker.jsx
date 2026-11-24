// The payment dialog's "link to Kaspit": the payment's Kaspit document (view / replace / unlink), or a list of
// Kaspit documents to pick from, this customer's first. Picking fills the document fields from Kaspit.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Loader2, Search, Unlink, X } from "lucide-react";
import { documentUrl, listKaspitDocs } from "@/collections/api";
import { formatDate, formatMoney } from "@/collections/format";
import { errorText } from "@/sales/lib";
import { cn } from "@/lib/utils";

// a business name as people write it ("בע״מ", quotes, spaces aside), for matching a document to the customer
const nameKey = (s) =>
  String(s || "")
    .replace(/בע["״'׳]?מ|בעמ|\(.*?\)/g, "")
    .replace(/["״'׳.,\-\s]/g, "")
    .toLowerCase();

function matchesCustomer(doc, customer) {
  if (!customer) return false;
  const tax = String(customer.tax_id || "").replace(/\D/g, "");
  if (tax && doc.tax_id && doc.tax_id.replace(/^0+/, "") === tax.replace(/^0+/, "")) return true;
  const a = nameKey(doc.customer);
  const b = nameKey(customer.name);
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

function OpenTag({ open }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        open ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
      )}
    >
      {open ? "פתוח בכספית" : "סגור בכספית"}
    </span>
  );
}

/**
 * linked: { number, type_label, total, date, open } of the document the form is tied to, or null.
 * payment: the saved payment (for viewing its document), or null for a new one.
 */
export default function KaspitDocPicker({ customer, payment, linked, onPick, onUnlink }) {
  const [picking, setPicking] = useState(false);
  const savedLink = linked && payment?.kaspit_document_id && linked.id === payment.kaspit_document_id;

  if (linked && !picking) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm">
        <Link2 className="h-4 w-4 shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">
            {linked.type_label} {linked.number}
            {linked.total != null && <span className="amount"> · {formatMoney(linked.total)}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {linked.date && <span>{formatDate(linked.date)}</span>}
            {linked.open != null && <OpenTag open={linked.open} />}
            {!savedLink && <span>יקושר בשמירה</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {savedLink && (
            <a
              href={documentUrl(payment.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              <FileText className="h-3.5 w-3.5" />
              צפייה
            </a>
          )}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="h-8 rounded-md px-2 text-xs font-semibold text-foreground hover:bg-sky-100"
          >
            החלפה
          </button>
          <button
            type="button"
            onClick={onUnlink}
            title="ניתוק מכספית"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-red-50 hover:text-red-600"
          >
            <Unlink className="h-3.5 w-3.5" />
            ניתוק
          </button>
        </div>
      </div>
    );
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-sky-300 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-50"
      >
        <Link2 className="h-4 w-4" />
        קישור למסמך מכספית
      </button>
    );
  }

  return (
    <DocList
      customer={customer}
      payment={payment}
      onClose={() => setPicking(false)}
      onPick={(doc) => {
        onPick(doc);
        setPicking(false);
      }}
    />
  );
}

function DocList({ customer, payment, onPick, onClose }) {
  const [search, setSearch] = useState("");
  const docsQuery = useQuery({
    queryKey: ["collections", "kaspit-docs"],
    queryFn: listKaspitDocs,
    staleTime: 60_000,
    retry: (n, e) => e?.status >= 500 && e?.status !== 503 && n < 1,
  });

  const docs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = (docsQuery.data || []).map((doc) => ({ ...doc, mine: matchesCustomer(doc, customer) }));
    const filtered = q
      ? all.filter((doc) =>
          [doc.number, doc.customer, doc.details, String(Math.round(doc.total))].some((v) =>
            String(v || "").toLowerCase().includes(q),
          ),
        )
      : all;
    // this customer's documents first, then open before closed (the server's order inside each group)
    return [...filtered].sort((a, b) => Number(b.mine) - Number(a.mine));
  }, [docsQuery.data, search, customer]);

  return (
    <div className="space-y-2 rounded-md border border-sky-200 bg-white p-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="מספר מסמך, לקוח או סכום"
            className="h-9 w-full rounded-md border border-input bg-white pe-2 ps-8 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {docsQuery.isLoading ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען מסמכים מכספית…
        </p>
      ) : docsQuery.isError ? (
        <p className="py-6 text-center text-sm text-red-700">{errorText(docsQuery.error)}</p>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו מסמכים</p>
      ) : (
        <ul className="max-h-72 divide-y divide-border/70 overflow-y-auto rounded-md border border-border">
          {docs.map((doc) => {
            const elsewhere = doc.linked && doc.linked.payment_id !== payment?.id;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  disabled={elsewhere}
                  onClick={() => onPick(doc)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-right transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium text-foreground" dir="ltr">
                        {doc.number}
                      </span>
                      <span className="text-muted-foreground">{doc.type_label}</span>
                      <OpenTag open={doc.open} />
                      {doc.mine && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          הלקוח הזה
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {doc.customer} · {formatDate(doc.date)}
                      {doc.details ? ` · ${doc.details}` : ""}
                    </div>
                    {elsewhere && (
                      <div className="mt-0.5 text-xs text-muted-foreground">מקושר כבר לתשלום של {doc.linked.customer_name}</div>
                    )}
                  </div>
                  <span className="amount shrink-0 text-sm font-semibold text-foreground">{formatMoney(doc.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
