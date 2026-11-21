// /api/sales/deal-public?token=   the client's deal page (no sign-in; the token is the key)
//   GET  -> everything the three steps show; the first visit marks the order viewed
//   POST { action: "approve", client, approverName, accept }          step 1: work order and payments
//   POST { action: "sign", name, role, signature (PNG data URL), accept }  step 2: the agreement
//   POST { action: "card" }  step 3: opens Grow's card page (through Toro) -> { authCode, url }
// Each step stands on its own: signing does not need the card, and the signed agreement is kept
// even if the client stops before step 3.
import { clientIp, HttpError, json, origin, readJson, route } from "../../_lib/http.js";
import { query } from "../../_lib/db.js";
import { getSettings, isEmail, logEvent, mobileIL, sendMail, str, taxIdIL } from "../../_lib/sales.js";
import { buildAgreement, buildOrder, cleanClient, snapshotHash } from "../../_lib/deal.js";
import { dealAccountingMail, dealSignedMail } from "../../_lib/sales-mail.js";
import { parseDataUrl } from "../../_lib/sign.js";
import { generateDealPdf } from "../../_lib/deal-pdf.js";
import { createSubscription, firstCharge, scheduleFromService, subscriptionRow } from "../../_lib/billing.js";
import { israelDate } from "../../_lib/sales-calc.js";
import { callToro } from "../../_lib/toro.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);

async function load(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) throw new HttpError(404, "not_found");
  const { rows } = await query("SELECT * FROM sales.deals WHERE token = $1", [token]);
  const d = rows[0];
  if (!d || (d.canceled_at && !d.signed_at)) throw new HttpError(404, "not_found");
  return d;
}

async function view(d, settings, base) {
  const order = d.snapshot?.order || buildOrder(d, settings);
  const agreement = d.snapshot?.agreement || buildAgreement(d, settings);
  let subscription = null;
  if (d.subscription_id) {
    const s = (await query("SELECT * FROM billing.subscriptions WHERE id = $1", [d.subscription_id])).rows[0];
    if (s) subscription = { status: s.status, card: s.card, firstCharge: firstCharge(s), startKnown: Boolean(s.start_date), description: s.description };
  }
  return {
    number: d.number,
    order,
    agreement,
    client: d.client,
    status: { order: d.order_status, agreement: d.agreement_status, deposit: d.deposit_status, card: d.card_status },
    approvedAt: iso(d.approved_at),
    approval: d.approval ? { name: d.approval.name, at: d.approval.at } : null,
    signedAt: iso(d.signed_at),
    signature: d.signature ? { name: d.signature.name, role: d.signature.role, at: d.signature.at } : null,
    subscription,
    links: {
      spec: d.data.project?.specFileId ? `${base}/api/sales/deal-file?token=${d.token}&kind=spec` : null,
      signedPdf: d.signed_pdf_file_id ? `${base}/api/sales/deal-file?token=${d.token}&kind=signed` : null,
    },
    company: { name: settings.company.name, phone: settings.company.phone, email: settings.officeEmail },
    officeEmail: settings.officeEmail,
  };
}

const who = (req, extra) => ({ ...extra, ip: clientIp(req), userAgent: String(req.headers["user-agent"] || "").slice(0, 400), at: new Date().toISOString() });

export default route(["GET", "POST"], async (req, res) => {
  const base = origin(req);
  const token = new URL(req.url, "http://x").searchParams.get("token");
  let d = await load(token);
  const settings = await getSettings();

  if (req.method === "GET") {
    if (!d.viewed_at) {
      await query("UPDATE sales.deals SET viewed_at = now(), order_status = CASE WHEN order_status = 'sent' THEN 'viewed' ELSE order_status END WHERE id = $1", [d.id]);
      await logEvent("deal", d.id, "viewed", { ip: clientIp(req) });
      d = await load(token);
    }
    return json(res, 200, await view(d, settings, base));
  }

  const b = await readJson(req, 2 * 1024 * 1024);
  if (d.canceled_at) throw new HttpError(409, "canceled");

  if (b.action === "approve") {
    if (d.approved_at) throw new HttpError(409, "already_approved");
    if (b.accept !== true) throw new HttpError(400, "not_accepted");
    const client = cleanClient({ ...d.client, ...(b.client || {}) });
    if (!client.companyName && !client.signerName) throw new HttpError(400, "bad_company");
    if (!isEmail(client.accountingEmail)) throw new HttpError(400, "bad_accounting_email");
    // invoices and the card for the standing order go through Grow, which refuses invalid ones
    if (!taxIdIL(client.taxId)) throw new HttpError(400, "bad_tax_id");
    if (!mobileIL(client.phone)) throw new HttpError(400, "bad_phone");
    client.taxId = taxIdIL(client.taxId);
    client.phone = mobileIL(client.phone);
    const approverName = str(b.approverName, 120);
    if (approverName.length < 2) throw new HttpError(400, "bad_name");
    const approval = who(req, { name: approverName, email: client.email });
    const order = buildOrder({ ...d, client }, settings, israelDate());
    const u = await query(
      `UPDATE sales.deals SET client = $2, approved_at = now(), approval = $3, order_status = 'approved',
              snapshot = jsonb_build_object('order', $4::jsonb), updated_at = now()
        WHERE id = $1 AND approved_at IS NULL RETURNING *`,
      [d.id, JSON.stringify(client), JSON.stringify(approval), JSON.stringify(order)]);
    if (!u.rows[0]) throw new HttpError(409, "already_approved");
    d = u.rows[0];
    await logEvent("deal", d.id, "approved", { name: approverName, ip: approval.ip });
    const mail = await sendMail({ ...dealAccountingMail(d, d.snapshot, settings), entity: "deal", entityId: d.id, kind: "deal_accounting" });
    await logEvent("deal", d.id, "email_sent", { kind: "accounting", to: client.accountingEmail, sent: mail.sent });
    return json(res, 200, await view(d, settings, base));
  }

  if (b.action === "sign") {
    if (!d.approved_at) throw new HttpError(409, "not_approved");
    if (d.signed_at) throw new HttpError(409, "already_signed");
    if (b.accept !== true) throw new HttpError(400, "not_accepted");
    const name = str(b.name, 120);
    if (name.length < 2) throw new HttpError(400, "bad_name");
    const img = parseDataUrl(b.signature, { allowed: ["image/png"], maxBytes: 1024 * 1024 });
    const sigFile = await query(
      "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, 'deal-signature.png', 'image/png', $1, $2) RETURNING id",
      [img.bytes.length, img.bytes]);
    const signature = who(req, { name, role: str(b.role, 80), email: d.client.email, fileId: sigFile.rows[0].id });
    let companySignature = null;
    if (settings.signer.signatureFileId) {
      const f = await query("SELECT content_type, data FROM sign.files WHERE id = $1", [settings.signer.signatureFileId]);
      if (f.rows[0]) companySignature = `data:${f.rows[0].content_type};base64,${f.rows[0].data.toString("base64")}`;
    }
    const snapshot = {
      order: d.snapshot.order,
      agreement: buildAgreement(d, settings),
      client: d.client,
      approval: d.approval,
      signature,
      companySignature,
    };
    const hash = snapshotHash(snapshot);
    const pdf = await generateDealPdf({ ...snapshot, hash });
    const pdfName = `הסכם ${d.number} - ${(d.client.companyName || d.client.signerName || "").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
    const pf = await query(
      "INSERT INTO sign.files (is_public, name, content_type, size, data) VALUES (false, $1, 'application/pdf', $2, $3) RETURNING id",
      [pdfName, pdf.length, pdf]);
    const u = await query(
      `UPDATE sales.deals SET signed_at = now(), signature = $2, agreement_status = 'signed', snapshot = $3, snapshot_hash = $4,
              signed_pdf_file_id = $5, updated_at = now()
        WHERE id = $1 AND signed_at IS NULL RETURNING *`,
      [d.id, JSON.stringify(signature), JSON.stringify(snapshot), hash, pf.rows[0].id]);
    if (!u.rows[0]) throw new HttpError(409, "already_signed");
    d = u.rows[0];
    await logEvent("deal", d.id, "signed", { name, ip: signature.ip, hash });

    // the standing order for the monthly service, waiting for the card (step 3)
    if (d.data.standingOrder?.enabled && !d.subscription_id) {
      const so = d.data.standingOrder;
      const s = await createSubscription({
        dealId: d.id,
        createdBy: d.created_by,
        customer: {
          name: d.client.signerName, company: d.client.companyName, taxId: d.client.taxId, email: d.client.email,
          phone: d.client.phone, accountingEmail: d.client.accountingEmail,
        },
        description: `שירות חודשי · ${d.data.project.name}`,
        vatRate: d.data.price.vatRate,
        schedule: scheduleFromService(d.data.service),
        startDate: so.startDate || null,
        dayOfMonth: so.dayOfMonth || 1,
      });
      await query("UPDATE sales.deals SET subscription_id = $2, card_status = 'pending' WHERE id = $1", [d.id, s.id]);
      await logEvent("subscription", s.id, "created", { dealId: d.id });
      d = (await query("SELECT * FROM sales.deals WHERE id = $1", [d.id])).rows[0];
    }

    const mail = await sendMail({ ...dealSignedMail(d, settings, { fileId: pf.rows[0].id, name: pdfName }), entity: "deal", entityId: d.id, kind: "deal_signed" });
    await logEvent("deal", d.id, "email_sent", { kind: "signed", to: d.client.email, sent: mail.sent });
    return json(res, 200, await view(d, settings, base));
  }

  if (b.action === "card") {
    if (!d.signed_at || !d.subscription_id) throw new HttpError(409, "not_signed");
    const s = (await query("SELECT * FROM billing.subscriptions WHERE id = $1", [d.subscription_id])).rows[0];
    if (!s || s.status === "canceled") throw new HttpError(409, "no_subscription");
    const r = await callToro("/proAlgoSales/card/createProcess", { subscriptionId: s.id });
    if (!r.ok) {
      await logEvent("subscription", s.id, "card_page_failed", { error: r.error });
      throw new HttpError(502, "card_unavailable");
    }
    await logEvent("subscription", s.id, "card_page_opened");
    return json(res, 200, { authCode: r.authCode || null, url: r.url || null, subscription: subscriptionRow(s) });
  }

  throw new HttpError(400, "bad_action");
});
