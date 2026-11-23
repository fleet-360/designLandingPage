// Record ids for the collections routes: uuids only, from ?id= or the body's id
import { HttpError } from "./http.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idParam(req) {
  const id = new URL(req.url, "http://x").searchParams.get("id") || "";
  if (!UUID.test(id)) throw new HttpError(400, "bad_id");
  return id;
}

// a body's id, when it has one (an update); none means create
export function bodyId(b) {
  if (b.id == null || b.id === "") { delete b.id; return null; }
  if (!UUID.test(String(b.id))) throw new HttpError(400, "bad_id");
  return b.id;
}
