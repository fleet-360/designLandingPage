// Stands in for the Base44 SDK client the app was written against, so its pages keep calling
// base44.entities / base44.functions / base44.integrations / base44.auth unchanged. Everything goes
// to this site's API (api/contracts/*.js, api/auth/*.js) and the Postgres schema `sign`.
//
// Only the calls the app makes are implemented. Errors carry `.status` and `.data` like the SDK's,
// so existing `e.response?.data?.error || e.data?.error` checks keep working.

const API = "/api";

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("network");
    err.data = { error: "network" };
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
  return s ? `?${s}` : "";
};

// Base44's `filter(query, sort, limit)`: the server already scopes to the signed-in admin,
// so only form_id is passed on; sort is always newest first.
const entity = (path) => ({
  get: (id) => request(`/contracts/${path}${qs({ id })}`).then((r) => r.item),
  filter: (query = {}, _sort, limit) => request(`/contracts/${path}${qs({ form_id: query.form_id, limit })}`).then((r) => r.items),
  list: (_sort, limit) => request(`/contracts/${path}${qs({ limit })}`).then((r) => r.items),
  create: (data) => request(`/contracts/${path}`, { method: "POST", body: data }).then((r) => r.item),
  update: (id, data) => request(`/contracts/${path}${qs({ id })}`, { method: "PATCH", body: data }).then((r) => r.item),
  delete: (id) => request(`/contracts/${path}${qs({ id })}`, { method: "DELETE" }),
});

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Base44 functions the app invokes, mapped to endpoints. Answers come back as { data } like the SDK.
const FUNCTIONS = {
  submitSignature: (body) => request("/contracts/submit", { method: "POST", body }),
  getSignatureUrl: ({ submission_id }) => request(`/contracts/signature-urls${qs({ submission_id })}`),
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // "/contracts"

export const base44 = {
  entities: {
    Form: entity("forms"),
    Submission: entity("submissions"),
  },

  functions: {
    invoke: async (name, body = {}) => {
      const fn = FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown function ${name}`);
      return { data: await fn(body) };
    },
  },

  integrations: {
    Core: {
      // Images placed in a form (logos etc.): stored in the database, served publicly.
      UploadPublicFile: async ({ file }) => {
        const r = await request("/contracts/files", {
          method: "POST",
          body: { name: file.name, data_url: await fileToDataUrl(file) },
        });
        return { file_url: r.file_url };
      },
      // Signature images on the public sign page: nothing is uploaded yet. The data URL is
      // returned as the "file_uri" and travels with submitSignature, which stores it with the
      // submission, so an anonymous visitor never gets an upload endpoint of their own.
      UploadPrivateFile: async ({ file }) => ({ file_uri: await fileToDataUrl(file) }),
    },
  },

  auth: {
    me: () => request("/auth/session").then((r) => ({ id: r.user, email: r.user, full_name: r.user, role: "admin" })),
    loginViaEmailPassword: (user, password) => request("/auth/login", { method: "POST", body: { user, password } }),
    logout: async (redirectTo) => {
      await request("/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = redirectTo || `${BASE}/login`;
    },
    redirectToLogin: (returnTo) => {
      const path = returnTo ? new URL(returnTo, window.location.origin).pathname.replace(BASE, "") || "/" : "/";
      window.location.href = `${BASE}/login${path !== "/" ? `?returnTo=${encodeURIComponent(path)}` : ""}`;
    },
  },
};
