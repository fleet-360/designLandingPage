// Grow (Meshulam) payment widget in the page, as on /pay (pay/assets/payment.js).
// Payments go through Toro: createPaymentLink for one-off payments (the spec request), and the
// site's card actions (Toro /proAlgoSales/card/createProcess) for saving a card.
const SDK = "https://cdn.meshulam.co.il/sdk/gs.min.js";
// same request and answer as grow/proAlgorithm/createPaymentLink, plus Bit, Apple Pay and Google Pay in the wallet
const TORO_PAYMENT = "https://api.fleet360.co.il/proAlgoSales/payment/createLink";

let loading = null;
let handlers = {};
let initialised = false;

function loadSdk() {
  if (window.growPayment?.renderPaymentOptions) return Promise.resolve(true);
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = SDK;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }
  return loading.then(async (ok) => {
    if (!ok) return false;
    for (let i = 0; i < 100 && !window.growPayment?.renderPaymentOptions; i++) await new Promise((r) => setTimeout(r, 100));
    return Boolean(window.growPayment?.renderPaymentOptions);
  });
}

// events: { onSuccess, onFailure, onClose }
export async function openWidget(authCode, events) {
  handlers = events || {};
  const ok = await loadSdk();
  if (!ok) return false;
  if (!initialised) {
    window.growPayment.init({
      environment: "PRODUCTION",
      version: 1,
      events: {
        onSuccess: (r) => handlers.onSuccess?.(r),
        onFailure: (r) => handlers.onFailure?.(r),
        onError: (r) => handlers.onFailure?.(r),
        onTimeout: () => handlers.onFailure?.({ timeout: true }),
        onWalletChange: (state) => { if (state === "close") handlers.onClose?.(); },
      },
    });
    initialised = true;
  }
  window.growPayment.renderPaymentOptions(authCode);
  return true;
}

export const warmUp = () => { loadSdk(); };

// A one-off payment through Toro (same endpoint as /pay). p: { fullName, email, phone, sum, description, taxId, linkId }
export async function createPayment(p) {
  const r = await fetch(TORO_PAYMENT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: p.fullName, email: p.email, phone: String(p.phone || "").replace(/[^\d+]/g, "").replace(/^\+?972/, "0"),
      sum: Number(p.sum), description: p.description, paymentNumber: 1, businessTaxId: p.taxId || "", linkId: p.linkId,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success || !data.paymentUrl) throw new Error(data.error || "payment_failed");
  const pu = typeof data.paymentUrl === "string" ? { url: data.paymentUrl } : data.paymentUrl;
  return { authCode: pu.authCode || null, url: pu.url || null };
}
