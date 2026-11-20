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

  "pay/links": () => import("./_routes/pay/links.js"),
  "pay/login": () => import("./_routes/pay/login.js"),
  "pay/logout": () => import("./_routes/pay/logout.js"),
  "pay/paid": () => import("./_routes/pay/paid.js"),
  "pay/session": () => import("./_routes/pay/session.js"),

  "contracts/files": () => import("./_routes/contracts/files.js"),
  "contracts/forms": () => import("./_routes/contracts/forms.js"),
  "contracts/notice": () => import("./_routes/contracts/notice.js"),
  "contracts/pdf": () => import("./_routes/contracts/pdf.js"),
  "contracts/signature-urls": () => import("./_routes/contracts/signature-urls.js"),
  "contracts/submissions": () => import("./_routes/contracts/submissions.js"),
  "contracts/submit": () => import("./_routes/contracts/submit.js"),
};

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const path = (url.searchParams.get("__route") || url.pathname.replace(/^\/api\//, "")).replace(/^\/+|\/+$/g, "");
  const load = Object.hasOwn(ROUTES, path) ? ROUTES[path] : null;
  if (!load) return json(res, 404, { error: "not_found" });
  const mod = await load();
  return mod.default(req, res);
}
