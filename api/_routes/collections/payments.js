// /api/collections/payments   admin
//   POST   { id?, customer_id, amount, vat_included, method, status, ..., kaspit_document_id? }   create / update
//          kaspit_document_id: a Kaspit document to link (its number, type and date come from Kaspit),
//          "" to unlink, left out or unchanged to keep the link as it is.
//   PATCH  ?id= { status }    pending | paid | blocked | cancelled
//   DELETE ?id=
// A document number another payment already has: 409 doc_number_taken; a Kaspit document another payment is
// linked to: 409 kaspit_doc_linked.
import { json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { query } from "../../_lib/db.js";
import { deletePayment, savePayment, setPaymentStatus } from "../../_lib/collections.js";
import { kaspitLinkFields } from "../../_lib/collections-kaspit.js";
import { bodyId, idParam } from "../../_lib/collections-ids.js";

export default route(["POST", "PATCH", "DELETE"], async (req, res) => {
  const user = requireAdmin(req);
  if (req.method === "DELETE") {
    await deletePayment(idParam(req), user);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PATCH") {
    const b = await readJson(req);
    await setPaymentStatus(idParam(req), b.status, user);
    return json(res, 200, { ok: true });
  }
  const b = await readJson(req, 64 * 1024);
  const id = bodyId(b);
  let link = null;
  if (b.kaspit_document_id) {
    const current = id
      ? (await query("SELECT kaspit_document_id FROM collections.payments WHERE id = $1", [id])).rows[0]?.kaspit_document_id
      : null;
    if (String(b.kaspit_document_id) !== current) link = await kaspitLinkFields(b.kaspit_document_id);
  }
  json(res, 200, { payment: await savePayment(b, user, link) });
});
