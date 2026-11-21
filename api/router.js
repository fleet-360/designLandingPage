// The whole /api in one Vercel function (the Hobby plan allows 12 functions per deployment; one
// function also stays warm for every endpoint). vercel.json rewrites /api/<route> here with
// ?__route=<route>. Each endpoint is a module under api/_routes/, listed in ROUTES with a literal
// import so Vercel's bundler includes it: /api/pay/links -> api/_routes/pay/links.js.
// tools/check-api-routes.mjs fails the build when a file in api/_routes is missing here.
import { json } from "./_lib/http.js";

export const ROUTES = {
  "auth/login": () => import("./_routes/auth/login.js"),
  "auth/logout": () => import("./_routes/auth/logout.js"),
  "auth/session": () => import("./_routes/auth/session.js"),

  "billing/card": () => import("./_routes/billing/card.js"),
  "billing/card-link": () => import("./_routes/billing/card-link.js"),
  "billing/card-request": () => import("./_routes/billing/card-request.js"),
  "billing/due": () => import("./_routes/billing/due.js"),
  "billing/invoice": () => import("./_routes/billing/invoice.js"),
  "billing/result": () => import("./_routes/billing/result.js"),
  "billing/subscriptions": () => import("./_routes/billing/subscriptions.js"),

  "contracts/files": () => import("./_routes/contracts/files.js"),
  "contracts/forms": () => import("./_routes/contracts/forms.js"),
  "contracts/notice": () => import("./_routes/contracts/notice.js"),
  "contracts/pdf": () => import("./_routes/contracts/pdf.js"),
  "contracts/signature-urls": () => import("./_routes/contracts/signature-urls.js"),
  "contracts/submissions": () => import("./_routes/contracts/submissions.js"),
  "contracts/submit": () => import("./_routes/contracts/submit.js"),


  "outbox/item": () => import("./_routes/outbox/item.js"),
  "outbox/result": () => import("./_routes/outbox/result.js"),

  "pay/links": () => import("./_routes/pay/links.js"),
  "pay/login": () => import("./_routes/pay/login.js"),
  "pay/logout": () => import("./_routes/pay/logout.js"),
  "pay/paid": () => import("./_routes/pay/paid.js"),
  "pay/session": () => import("./_routes/pay/session.js"),

  "sales/booking": () => import("./_routes/sales/booking.js"),
  "sales/booking-result": () => import("./_routes/sales/booking-result.js"),
  "sales/deal-file": () => import("./_routes/sales/deal-file.js"),
  "sales/deal-film": () => import("./_routes/sales/deal-film.js"),
  "sales/deal-public": () => import("./_routes/sales/deal-public.js"),
  "sales/deals": () => import("./_routes/sales/deals.js"),
  "sales/discovery": () => import("./_routes/sales/discovery.js"),
  "sales/discovery-public": () => import("./_routes/sales/discovery-public.js"),
  "sales/pitch": () => import("./_routes/sales/pitch.js"),
  "sales/settings": () => import("./_routes/sales/settings.js"),
  "sales/spec-pages": () => import("./_routes/sales/spec-pages.js"),
  "sales/upload": () => import("./_routes/sales/upload.js"),
};

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const path = (url.searchParams.get("__route") || url.pathname.replace(/^\/api\//, "")).replace(/^\/+|\/+$/g, "");
  const load = Object.hasOwn(ROUTES, path) ? ROUTES[path] : null;
  if (!load) return json(res, 404, { error: "not_found" });
  const mod = await load();
  return mod.default(req, res);
}
