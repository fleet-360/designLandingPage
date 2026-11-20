/* ============================================
   PRO ALGORITHM - Payment link generator
   Protected by the credentials baked in at build time
   (PAY_ADMIN_USER / PAY_ADMIN_PASSWORD, see tools/pay_config.py).

   Produces /pay?d=<encrypted token> so the amount and the
   customer details never appear in readable form in the link,
   plus an optional expiry date.
   ============================================ */

(function () {
    const Pay = window.ProAlgoPay;
    const Crypto = window.ProAlgoPayCrypto;
    const PAYMENT_PAGE_PATH = '/pay';
    const SESSION_KEY = 'proalgo_pay_session';
    const MAX_ATTEMPTS = 8;
    const LOCKOUT_MS = 60000;

    const TEXTS = {
        copied: { he: 'הועתק!', en: 'Copied!' },
        copy: { he: 'העתק', en: 'Copy' },
        copyFailed: { he: 'ההעתקה נכשלה - סמנו והעתיקו ידנית', en: 'Copy failed - select the text and copy manually' },
        readyLink: { he: 'הקישור מוכן', en: 'Your link is ready' },
        whatsappMessage: {
            he: 'שלום {name}, מצורף קישור לתשלום על סך {amount} ש"ח עבור {desc}:\n{url}',
            en: 'Hi {name}, here is your payment link for {amount} ILS for {desc}:\n{url}'
        },
        emailSubject: { he: 'קישור לתשלום - Pro Algorithm', en: 'Payment link - Pro Algorithm' },
        defaultCustomer: { he: 'שלום', en: 'there' },
        badCredentials: { he: 'שם משתמש או סיסמה שגויים', en: 'Wrong username or password' },
        tooManyAttempts: { he: 'יותר מדי ניסיונות. נסו שוב בעוד דקה.', en: 'Too many attempts. Try again in a minute.' },
        signingIn: { he: 'מזדהה...', en: 'Signing in...' },
        insecureContext: {
            he: 'העמוד חייב לרוץ ב-HTTPS כדי ליצור קישורים מוצפנים',
            en: 'This page must run over HTTPS to create encrypted links'
        },
        metaExpires: { he: 'בתוקף עד {date}', en: 'Valid until {date}' },
        metaNoExpiry: { he: 'ללא תאריך תפוגה', en: 'No expiry date' },
        metaLocked: { he: 'הסכום נעול', en: 'amount locked' },
        metaUnlocked: { he: 'הלקוח יכול לשנות את הסכום', en: 'the customer can change the amount' },
    };

    const els = {};
    let lastForm = null;
    let lastResult = null;
    let attempts = 0;
    let lockedUntil = 0;

    function t(key, vars) {
        const lang = Pay.getLang();
        let text = TEXTS[key] ? TEXTS[key][lang] : key;
        if (vars) Object.keys(vars).forEach(k => { text = text.split('{' + k + '}').join(vars[k]); });
        return text;
    }

    /* ---------- Login gate ---------- */

    function showGate() {
        els.gate.hidden = false;
        els.content.hidden = true;
        els.gate.querySelector('#gateUser').focus();
    }

    function showGenerator(user) {
        els.gate.hidden = true;
        els.content.hidden = false;
        els.sessionUser.textContent = user || '';
    }

    function gateError(message) {
        els.gateError.textContent = message;
        els.gateError.hidden = false;
    }

    async function handleGateSubmit(e) {
        e.preventDefault();
        els.gateError.hidden = true;

        if (Date.now() < lockedUntil) {
            gateError(t('tooManyAttempts'));
            return;
        }

        const config = Pay.getConfig();
        const user = els.gateUser.value;
        const password = els.gatePassword.value;
        const btn = els.gateSubmit;
        const originalHtml = btn.innerHTML;

        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.textContent = t('signingIn');

        try {
            const [userHash, passHash] = await Promise.all([
                Crypto.hashUser(user, config.salt),
                Crypto.hashPassword(password, config.salt, config.iterations)
            ]);

            if (userHash !== config.userHash || passHash !== config.passHash) {
                attempts++;
                if (attempts >= MAX_ATTEMPTS) {
                    lockedUntil = Date.now() + LOCKOUT_MS;
                    attempts = 0;
                    gateError(t('tooManyAttempts'));
                } else {
                    /* Slow repeated guesses down a little */
                    await new Promise(r => setTimeout(r, attempts * 300));
                    gateError(t('badCredentials'));
                }
                els.gatePassword.value = '';
                return;
            }

            attempts = 0;
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ u: user.trim(), h: passHash }));
            } catch (err) {
                /* private mode - the session just won't survive a reload */
            }
            els.gatePassword.value = '';
            showGenerator(user.trim());
        } catch (err) {
            gateError(err.message || t('badCredentials'));
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    function handleLogout() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch (err) {
            /* nothing to clean up */
        }
        lastForm = null;
        lastResult = null;
        els.result.hidden = true;
        els.gateUser.value = '';
        els.gatePassword.value = '';
        showGate();
    }

    /* ---------- Form ---------- */

    function showError(message) {
        els.error.textContent = message;
        els.error.hidden = false;
    }

    function clearError() {
        els.error.hidden = true;
        els.error.textContent = '';
    }

    function readForm() {
        return {
            amount: Pay.parseAmount(els.amount.value),
            payments: Number(els.payments.value) || 1,
            expiryDays: Number(els.expiry.value) || 0,
            description: els.description.value.trim(),
            fullName: els.name.value.trim(),
            phone: els.phone.value.trim(),
            email: els.email.value.trim(),
            taxId: els.taxId.value.trim(),
            lock: els.lock.checked,
            english: els.english.checked
        };
    }

    function validate(form) {
        if (!Pay.isValidAmount(form.amount)) return Pay.t('errAmount');
        if (!form.description) return Pay.t('errDescription');
        if (form.phone && !Pay.isValidPhone(form.phone)) return Pay.t('errPhone');
        if (form.email && !Pay.isValidEmail(form.email)) return Pay.t('errEmail');
        return null;
    }

    /* Short keys keep the encrypted token reasonably compact. */
    async function buildLink(form) {
        const payload = { a: form.amount, d: form.description };

        if (form.payments > 1) payload.i = form.payments;
        if (form.fullName) payload.n = form.fullName;
        if (form.phone) payload.p = Pay.normalizePhone(form.phone);
        if (form.email) payload.e = form.email;
        if (form.taxId) payload.t = form.taxId;
        if (form.english) payload.l = 'en';
        if (!form.lock) payload.f = 1;
        if (form.expiryDays > 0) payload.x = Date.now() + form.expiryDays * 86400000;

        const token = await Crypto.encodeToken(payload, Pay.getConfig().linkSecret);
        return window.location.origin + PAYMENT_PAGE_PATH + '?d=' + token;
    }

    function metaLine(form) {
        const validity = form.expiryDays > 0
            ? t('metaExpires', {
                date: new Date(Date.now() + form.expiryDays * 86400000)
                    .toLocaleDateString(Pay.getLang() === 'he' ? 'he-IL' : 'en-GB')
            })
            : t('metaNoExpiry');

        return validity + ' · ' + (form.lock ? t('metaLocked') : t('metaUnlocked'));
    }

    function renderResult(url, form) {
        lastResult = { url, form };

        els.output.value = url;
        els.resultTitle.textContent = t('readyLink');
        els.meta.textContent = metaLine(form);
        els.result.hidden = false;

        const message = t('whatsappMessage', {
            name: form.fullName || t('defaultCustomer'),
            amount: Pay.formatAmount(form.amount),
            desc: form.description,
            url: url
        });

        const waPhone = form.phone ? Pay.normalizePhone(form.phone).replace(/^0/, '972') : '';
        els.shareWhatsapp.href = 'https://wa.me/' + waPhone + '?text=' + encodeURIComponent(message);
        els.shareEmail.href = 'mailto:' + (form.email || '') +
            '?subject=' + encodeURIComponent(t('emailSubject')) +
            '&body=' + encodeURIComponent(message);
        els.openLink.href = url;

        els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        clearError();

        const form = readForm();
        const problem = validate(form);
        if (problem) {
            showError(problem);
            return;
        }

        lastForm = form;
        els.amount.value = Pay.formatAmount(form.amount);

        try {
            renderResult(await buildLink(form), form);
        } catch (err) {
            showError(err.message || t('insecureContext'));
        }
    }

    async function handleCopy() {
        const url = els.output.value;
        if (!url) return;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                els.output.select();
                document.execCommand('copy');
            }
            els.copy.textContent = t('copied');
            setTimeout(() => { els.copy.textContent = t('copy'); }, 1800);
        } catch (err) {
            showError(t('copyFailed'));
        }
    }

    /* ---------- Boot ---------- */

    function cacheEls() {
        const ids = {
            gate: 'linkGate', gateUser: 'gateUser', gatePassword: 'gatePassword',
            gateError: 'gateError', gateSubmit: 'gateSubmit',
            content: 'linkContent', sessionUser: 'sessionUser', logout: 'logoutBtn',
            form: 'linkForm', amount: 'linkAmount', payments: 'linkPayments', expiry: 'linkExpiry',
            description: 'linkDescription', name: 'linkName', phone: 'linkPhone', email: 'linkEmail',
            taxId: 'linkTaxId', lock: 'linkLock', english: 'linkEnglish', error: 'linkError',
            result: 'linkResult', resultTitle: 'linkResultTitle', meta: 'linkMeta', output: 'linkOutput',
            copy: 'copyLink', shareWhatsapp: 'shareWhatsapp', shareEmail: 'shareEmail',
            openLink: 'openLink',
            notConfigured: 'linkNotConfigured', notConfiguredText: 'linkNotConfiguredText'
        };
        Object.keys(ids).forEach(key => { els[key] = document.getElementById(ids[key]); });
    }

    document.addEventListener('DOMContentLoaded', () => {
        cacheEls();

        const config = Pay.getConfig();

        Pay.initChrome(() => {
            Pay.fillPaymentsSelect(els.payments, els.payments.value, { upTo: true });
            if (lastResult) renderResult(lastResult.url, lastResult.form);
            if (!els.notConfigured.hidden) els.notConfiguredText.textContent = Pay.t('errNotConfigured');
        });

        if (!config.configured) {
            els.notConfiguredText.textContent = Pay.t('errNotConfigured');
            els.notConfigured.hidden = false;
            return;
        }

        Pay.fillPaymentsSelect(els.payments, 1, { upTo: true });
        els.description.value = Pay.t('defaultDescription');

        els.gate.addEventListener('submit', handleGateSubmit);
        els.logout.addEventListener('click', handleLogout);
        els.form.addEventListener('submit', handleSubmit);
        els.form.addEventListener('input', clearError);
        els.copy.addEventListener('click', handleCopy);

        let session = null;
        try {
            session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        } catch (err) {
            /* storage blocked or corrupted - just ask for the password again */
        }

        if (session && session.h === config.passHash) {
            showGenerator(session.u);
        } else {
            showGate();
        }
    });
})();
