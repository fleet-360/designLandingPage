// /api/collections/payments   admin
//   POST   { id?, customer_id, amount, vat_included, method, status, ... }   create / update
//   PATCH  ?id= { status }    pending | paid | blocked | cancelled
//   DELETE ?id=
// A document number another payment already has: 409 doc_number_taken.
import { json, readJson, route } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/auth.js";
import { deletePayment, savePayment, setPaymentStatus } from "../../_lib/collections.js";
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
  bodyId(b);
  json(res, 200, { payment: await savePayment(b, user) });
});
