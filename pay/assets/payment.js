/* ============================================
   PRO ALGORITHM - Quick payment page
   Creates a Grow payment process and redirects to checkout.

   The amount and customer details arrive inside an encrypted token
   produced by /pay-link:   /pay?d=8Kj3...
   A tampered, truncated or expired token is refused, and so is a bare
   /pay with no token - the page is only reachable through a link we sent.

   Readable params (?amount=&desc=&name=&email=&phone=&payments=&taxid=&lang=&edit=1)
   are an escape hatch for debugging, honoured only when
   PAY_ALLOW_PLAIN_PARAMS=1 at build time.
   ============================================ */

(function () {
    const Pay = window.ProAlgoPay;
    const Crypto = window.ProAlgoPayCrypto;

    /* How long to wait for cdn.meshulam.co.il - same budget the CRM allows
       in src/grow/hooks/useGrowPayment.ts */
    const GROW_SDK_TIMEOUT_MS = 10000;

    const els = {};
    let lockedAmount = null;
    let lockedDescription = null;
    let maxPayments = 1;
    let growInitialised = false;
    let submitOriginalHtml = '';

    /* ---------- Grow checkout SDK (embedded) ---------- */

    function setSubmitBusy(busy, label) {
        /* Captured on the way in, so it survives a language switch */
        if (busy && !els.submit.dataset.busy) {
            submitOriginalHtml = els.submit.innerHTML;
            els.submit.dataset.busy = '1';
        }

        els.submit.disabled = busy;
        els.submit.style.opacity = busy ? '0.7' : '1';

        if (busy) {
            els.submit.textContent = label;
        } else {
            if (submitOriginalHtml) els.submit.innerHTML = submitOriginalHtml;
            delete els.submit.dataset.busy;
        }
    }

    /* Resolves false when the SDK never showed up - the caller then falls
       back to the hosted checkout page. */
    function whenGrowReady() {
        return new Promise(resolve => {
            const startedAt = Date.now();

            const check = () => {
                if (window.growPayment && window.growPayment.renderPaymentOptions) {
                    if (!growInitialised) {
                        window.growPayment.init({
                            environment: Pay.getConfig().growEnvironment === 'DEV' ? 'DEV' : 'PRODUCTION',
                            version: 1,
                            events: {
                                onPaymentStart: () => { },
                                onSuccess: () => showSuccess(),
                                onFailure: (response) => {
                                    console.error('Grow payment failed:', response);
                                    setSubmitBusy(false);
                                    showError(Pay.t('errPaymentFailed'));
                                },
                                onError: () => {
                                    setSubmitBusy(false);
                                    showError(Pay.t('errPaymentSystem'));
                                },
                                onTimeout: () => {
                                    setSubmitBusy(false);
                                    showError(Pay.t('errCheckoutExpired'));
                                },
                                /* The SDK has no onClose: closing the widget arrives
                                   as onWalletChange('close'). Without this the submit
                                   button stays disabled and the page looks frozen. */
                                onWalletChange: (state) => {
                                    if (state === 'close') setSubmitBusy(false);
                                }
                            }
                        });
                        growInitialised = true;
                    }
                    resolve(true);
                } else if (Date.now() - startedAt > GROW_SDK_TIMEOUT_MS) {
                    resolve(false);
                } else {
                    setTimeout(check, 100);
                }
            };

            check();
        });
    }

    /* ---------- Link parameters ---------- */

    /* Token payload keys are kept short so the link stays manageable. */
    function fromTokenPayload(payload) {
        return {
            amount: payload.a,
            description: payload.d,
            fullName: payload.n,
            email: payload.e,
            phone: payload.p,
            payments: payload.i,
            taxId: payload.t,
            lang: payload.l,
            expiresAt: payload.x,
            editable: payload.f === 1
        };
    }

    function readPlainParams(q) {
        const get = (...keys) => {
            for (const key of keys) {
                const value = q.get(key);
                if (value !== null && value !== '') return value;
            }
            return null;
        };

        return {
            amount: get('amount', 'sum'),
            description: get('desc', 'description'),
            fullName: get('name', 'fullName'),
            email: get('email'),
            phone: get('phone'),
            payments: get('payments', 'paymentNumber'),
            taxId: get('taxid', 'businessTaxId'),
            lang: get('lang'),
            editable: get('edit') === '1'
        };
    }

    /* ---------- Page states ---------- */

    function showInvalid(messageKey) {
        els.loading.hidden = true;
        els.content.hidden = true;
        els.invalid.dataset.reason = messageKey;
        els.invalidText.textContent = Pay.t(messageKey);
        els.invalid.hidden = false;
    }

    function showSuccess() {
        const amount = currentAmount();
        els.content.hidden = true;
        /* "Confirm your details and complete the payment" - not after it is paid */
        els.subtitle.hidden = true;
        els.successAmount.textContent = Pay.formatAmount(amount) + ' ₪';
        els.success.hidden = false;
        trackPurchase(amount);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showError(message) {
        els.error.textContent = message;
        els.error.hidden = false;
        els.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function clearError() {
        els.error.hidden = true;
        els.error.textContent = '';
    }

    function renderLockedAmount() {
        els.amountEditable.hidden = true;
        els.amountStatic.hidden = false;
        els.amountStaticValue.textContent = Pay.formatAmount(lockedAmount);
    }

    /* ---------- Values ---------- */

    function currentAmount() {
        return lockedAmount !== null ? lockedAmount : Pay.parseAmount(els.amount.value);
    }

    function currentDescription() {
        const value = els.description.value.trim();
        return value || Pay.t('defaultDescription');
    }

    /* Keeps the default description in sync with the page language,
       unless the visitor (or the link) already set one. */
    function syncDefaultDescription() {
        if (lockedDescription !== null) {
            els.description.value = lockedDescription;
            return;
        }
        if (!els.description.value.trim() || els.description.dataset.isDefault === '1') {
            els.description.value = Pay.t('defaultDescription');
            els.description.dataset.isDefault = '1';
        }
    }

    function validate() {
        if (!Pay.isValidAmount(currentAmount())) return Pay.t('errAmount');
        if (!currentDescription()) return Pay.t('errDescription');
        if (els.fullName.value.trim().length < 2) return Pay.t('errName');
        if (!Pay.isValidPhone(els.phone.value)) return Pay.t('errPhone');
        if (!Pay.isValidEmail(els.email.value)) return Pay.t('errEmail');
        if (!Pay.isValidTaxId(els.businessTaxId.value)) return Pay.t('errTaxId');
        return null;
    }

    function trackCheckoutStart(amount) {
        try {
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'begin_checkout', { currency: 'ILS', value: amount });
            }
            if (typeof window.fbq === 'function') {
                window.fbq('track', 'InitiateCheckout', { currency: 'ILS', value: amount });
            }
        } catch (err) {
            /* analytics must never block a payment */
        }
    }

    function trackPurchase(amount) {
        try {
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'purchase', { currency: 'ILS', value: amount });
            }
            if (typeof window.fbq === 'function') {
                window.fbq('track', 'Purchase', { currency: 'ILS', value: amount });
            }
        } catch (err) {
            /* analytics must never block a payment */
        }
    }

    /* ---------- Submit ---------- */

    async function handleSubmit(e) {
        e.preventDefault();
        clearError();

        const problem = validate();
        if (problem) {
            showError(problem);
            return;
        }

        const amount = currentAmount();
        setSubmitBusy(true, Pay.t('opening'));

        try {
            const [sdkReady, process] = await Promise.all([
                whenGrowReady(),
                Pay.createPaymentLink({
                    fullName: els.fullName.value,
                    email: els.email.value,
                    phone: els.phone.value,
                    sum: amount,
                    description: currentDescription(),
                    paymentNumber: els.paymentsCount.value,
                    businessTaxId: els.businessTaxId.value
                })
            ]);

            trackCheckoutStart(amount);

            if (sdkReady && process.authCode) {
                /* Stays busy until the widget reports success, failure or close. */
                window.growPayment.renderPaymentOptions(process.authCode);
                return;
            }

            /* Our endpoint goes through Meshulam's createPaymentProcess, which
               returns no hosted-page url - so this only fires if that ever changes. */
            if (process.url) {
                setSubmitBusy(true, Pay.t('redirecting'));
                window.location.href = process.url;
                return;
            }

            setSubmitBusy(false);
            showError(Pay.t('errCheckoutUnavailable'));
        } catch (err) {
            setSubmitBusy(false);
            showError(err.message || Pay.t('errServer'));
        }
    }

    function applyParams(params) {
        if (params.lang === 'en' || params.lang === 'he') {
            Pay.setLang(params.lang);
        }

        /* A description set by the link is never the customer's to change,
           even when the amount is left editable. */
        if (params.description) {
            lockedDescription = params.description;
            els.description.value = params.description;
            els.description.dataset.isDefault = '0';
            els.description.readOnly = true;
            els.description.classList.add('is-locked');
        }

        if (params.fullName) els.fullName.value = params.fullName;
        if (params.email) els.email.value = params.email;
        if (params.phone) els.phone.value = params.phone;
        if (params.taxId) els.businessTaxId.value = params.taxId;

        const amount = Pay.parseAmount(params.amount);
        if (Pay.isValidAmount(amount)) {
            els.amount.value = Pay.formatAmount(amount);
            if (!params.editable) {
                lockedAmount = amount;
                renderLockedAmount();
            }
        }

        maxPayments = Number(params.payments) || 1;
        renderPayments(1);
    }

    /* The link sets a ceiling, the customer picks anything up to it and
       starts on a single payment. No ceiling, no choice, no field. */
    function renderPayments(selected) {
        /* Filled even when hidden, so the submit always reads a real value */
        Pay.fillPaymentsSelect(els.paymentsCount, selected, { max: maxPayments });
        els.paymentsField.hidden = maxPayments <= 1;
    }

    /* Only reachable when the link left the amount editable. */
    function initAmountField() {
        els.amount.addEventListener('input', clearError);

        /* Normalize the typed amount when the field loses focus */
        els.amount.addEventListener('blur', () => {
            const amount = Pay.parseAmount(els.amount.value);
            if (isFinite(amount) && amount > 0) els.amount.value = Pay.formatAmount(amount);
        });
    }

    /* ---------- Boot ---------- */

    async function resolveParams() {
        const q = new URLSearchParams(window.location.search);
        const token = q.get('d');

        if (!token) {
            /* The page is only meant to be opened through a link we generated. */
            const plain = Pay.getConfig().allowPlainParams ? readPlainParams(q) : null;
            if (!plain || !Pay.isValidAmount(Pay.parseAmount(plain.amount))) {
                showInvalid('errNoLink');
                return undefined;
            }
            return plain;
        }

        els.content.hidden = true;
        els.loading.hidden = false;

        const secret = Pay.getConfig().linkSecret;
        if (!secret) {
            showInvalid('errNotConfigured');
            return undefined;
        }

        let params;
        try {
            params = fromTokenPayload(await Crypto.decodeToken(token, secret));
        } catch (err) {
            showInvalid('errInvalidLink');
            return undefined;
        }

        if (params.expiresAt && Date.now() > Number(params.expiresAt)) {
            /* Language first, so the message matches the link's language */
            if (params.lang === 'en' || params.lang === 'he') Pay.setLang(params.lang);
            showInvalid('errExpiredLink');
            return undefined;
        }

        els.loading.hidden = true;
        els.content.hidden = false;
        return params;
    }

    async function boot() {
        els.amount = document.getElementById('amount');
        els.amountEditable = document.getElementById('amountEditable');
        els.amountStatic = document.getElementById('amountStatic');
        els.amountStaticValue = document.getElementById('amountStaticValue');
        els.description = document.getElementById('description');
        els.fullName = document.getElementById('fullName');
        els.phone = document.getElementById('phone');
        els.email = document.getElementById('email');
        els.businessTaxId = document.getElementById('businessTaxId');
        els.paymentsCount = document.getElementById('paymentsCount');
        els.paymentsField = document.getElementById('paymentsField');
        els.error = document.getElementById('payError');
        els.submit = document.getElementById('paySubmit');
        els.form = document.getElementById('paymentForm');
        els.content = document.getElementById('payContent');
        els.loading = document.getElementById('payLoading');
        els.invalid = document.getElementById('payInvalid');
        els.invalidText = document.getElementById('payInvalidText');
        els.subtitle = document.querySelector('.pay-subtitle');
        els.success = document.getElementById('paySuccess');
        els.successAmount = document.getElementById('paySuccessAmount');

        Pay.initChrome(() => {
            renderPayments(els.paymentsCount.value);
            syncDefaultDescription();
            if (!els.invalid.hidden) els.invalidText.textContent = Pay.t(els.invalid.dataset.reason || 'errInvalidLink');
        });

        syncDefaultDescription();

        const params = await resolveParams();
        if (params === undefined) return; /* an error state is already on screen */
        applyParams(params);

        syncDefaultDescription();
        initAmountField();

        /* Once the visitor edits the description it is no longer the default */
        els.description.addEventListener('input', () => {
            els.description.dataset.isDefault = '0';
            clearError();
        });

        els.form.addEventListener('submit', handleSubmit);

        /* Warm the SDK up now so the widget opens instantly on submit */
        whenGrowReady();
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
