// The collections screens' calls to /api/collections/* (api/_routes/collections). Same names as the actions the
// screens were written with, each taking one object.
import { ApiError, api } from "@/sales/lib";

export const getBoard = () => api("collections/board");

export const saveCustomer = (data) => api("collections/customers", { method: "POST", body: data });
export const deleteCustomer = ({ id }) => api(`collections/customers?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export const savePayment = (data) => api("collections/payments", { method: "POST", body: data });
export const setPaymentStatus = ({ id, status }) => api(`collections/payments?id=${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
export const deletePayment = ({ id }) => api(`collections/payments?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export const saveCollection = (data) => api("collections/pickups", { method: "POST", body: data });
export const setCollectionStatus = ({ id, status }) => api(`collections/pickups?id=${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
export const deleteCollection = ({ id }) => api(`collections/pickups?id=${encodeURIComponent(id)}`, { method: "DELETE" });

export const listActivity = () => api("collections/activity").then((r) => r.activity);
export const restoreActivity = ({ id }) => api("collections/activity", { method: "POST", body: { id } });

export const syncKaspitNow = () => api("collections/kaspit-sync", { method: "POST" });
export const importLegacy = (data) => api("collections/import", { method: "POST", body: data });

export const listKaspitDocs = () => api("collections/kaspit-docs").then((r) => r.docs);

// a payment's document (invoice) as Kaspit prints it -> { blob, name } (the PDF and its file name)
export async function fetchPaymentDocument(id) {
  let r;
  try {
    r = await fetch(`/api/collections/invoice?id=${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/pdf" },
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) window.location.href = `${import.meta.env.BASE_URL}login`;
    throw new ApiError(r.status, data.error || "server_error", data);
  }
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "")?.[1] || "document.pdf";
  return { blob: await r.blob(), name };
}
