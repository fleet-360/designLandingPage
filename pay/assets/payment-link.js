/* ============================================
   PRO ALGORITHM - Payment links admin (/pay-link)
   Sign-in, link creation and the lists all go through /api/pay/*
   (api/pay/*.js). The server checks the password, stores every link and
   builds its encrypted /pay?d=... address; Toro reports each payment to
   /api/pay/paid, which is how the Payments tab and "paid" statuses fill in.
   ============================================ */

(function () {
    const Pay = window.ProAlgoPay;
    const API = '/api/pay';

    const TEXTS = {
        copied: { he: 'הועתק!', en: 'Copied!' },
        copy: { he: 'העתק', en: 'Copy' },
        copyLink: { he: 'העתקת הקישור', en: 'Copy link' },
        copyFailed: { he: 'ההעתקה נכשלה, סמנו והעתיקו ידנית', en: 'Copy failed, select the text and copy manually' },
        readyLink: { he: 'הקישור מוכן', en: 'Your link is ready' },
        whatsappMessage: {
            he: 'שלום {name}, מצורף קישור לתשלום על סך {amount} ש"ח עבור {desc}:\n{url}',
            en: 'Hi {name}, here is your payment link for {amount} ILS for {desc}:\n{url}'
        },
        emailSubject: { he: 'קישור לתשלום - Pro Algorithm', en: 'Payment link - Pro Algorithm' },
        defaultCustomer: { he: 'שלום', en: 'there' },
        badCredentials: { he: 'שם משתמש או סיסמה שגויים', en: 'Wrong username or password' },
        tooManyAttempts: { he: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.', en: 'Too many attempts. Try again in 15 minutes.' },
        signedOut: { he: 'פג תוקף ההתחברות. היכנסו שוב.', en: 'Your session ended. Please sign in again.' },
        signingIn: { he: 'מתחבר...', en: 'Signing in...' },
        creating: { he: 'יוצר קישור...', en: 'Creating link...' },
        network: { he: 'אין חיבור לשרת. בדקו את החיבור ונסו שוב.', en: 'Could not reach the server. Check your connection and try again.' },
        server: { he: 'משהו השתבש בשרת. נסו שוב בעוד רגע.', en: 'Something went wrong on the server. Try again in a moment.' },
        metaExpires: { he: 'בתוקף עד {date}', en: 'Valid until {date}' },
        metaNoExpiry: { he: 'ללא תאריך תפוגה', en: 'No expiry date' },
        metaLocked: { he: 'הסכום נעול', en: 'amount locked' },
        metaUnlocked: { he: 'הלקוח יכול לשנות את הסכום', en: 'the customer can change the amount' },
        statusOpen: { he: 'ממתין לתשלום', en: 'Awaiting payment' },
        statusPaid: { he: 'שולם', en: 'Paid' },
        statusPaidTimes: { he: 'שולם {n} פעמים', en: 'Paid {n} times' },
        statusExpired: { he: 'פג תוקף', en: 'Expired' },
        until: { he: 'עד {date}', en: 'until {date}' },
        noExpiry: { he: 'ללא תפוגה', en: 'no expiry' },
        installments: { he: '{n} תשלומים', en: '{n} installments' },
        upTo: { he: 'עד {n} תשלומים', en: 'up to {n} installments' },
        noCustomer: { he: 'לא צוין', en: 'Not set' },
        noLink: { he: 'קישור ישן', en: 'Older link' },
        noLinkTitle: {
            he: 'שולם דרך קישור שנוצר לפני שהקישורים נשמרו במערכת',
            en: 'Paid through a link created before links were stored'
        },
        pending: { he: 'בהפקה', en: 'Pending' },
        emptyLinks: { he: 'עוד לא נוצרו קישורים.', en: 'No links yet.' },
        emptyFiltered: { he: 'אין קישורים שמתאימים לחיפוש.', en: 'No links match the search.' },
        emptyPaid: { he: 'עוד לא התקבלו תשלומים.', en: 'No payments yet.' },
        paidTotal: { he: '{count} תשלומים · סה"כ {sum} ₪', en: '{count} payments · {sum} ILS in total' },
        paidTotalOne: { he: 'תשלום אחד · סה"כ {sum} ₪', en: '1 payment · {sum} ILS in total' },
        notConfigured: {
            he: 'מערכת הקישורים לא מוגדרת בשרת הזה (חסרים משתני PAY_* או חיבור לדאטהבייס).',
            en: 'Payment links are not configured on this server (PAY_* variables or the database are missing).'
        },
        errors: {
            bad_amount: { he: 'יש להזין סכום תקין (בין 1 ל-500,000 ש"ח)', en: 'Enter a valid amount (1 to 500,000 ILS)' },
            bad_description: { he: 'יש להזין תיאור לתשלום', en: 'Enter a payment description' },
            bad_phone: { he: 'מספר הטלפון לא תקין', en: 'The phone number is not valid' },
            bad_email: { he: 'כתובת האימייל לא תקינה', en: 'The email address is not valid' },
            bad_payments: { he: 'מספר תשלומים לא תקין', en: 'Invalid number of installments' },
            bad_expiry: { he: 'תוקף לא תקין', en: 'Invalid validity' }
        }
    };

    const els = {};
    const state = { user: '', links: [], payments: [], loaded: false, lastLink: null };

    function t(key, vars) {
        const lang = Pay.getLang();
        const entry = TEXTS[key];
        let text = entry ? entry[lang] : key;
        if (vars) Object.keys(vars).forEach(k => { text = text.split('{' + k + '}').join(vars[k]); });
        return text;
    }

    function errorText(code) {
        if (TEXTS.errors[code]) return TEXTS.errors[code][Pay.getLang()];
        if (code === 'bad_credentials') return t('badCredentials');
        if (code === 'too_many_attempts') return t('tooManyAttempts');
        if (code === 'signed_out') return t('signedOut');
        if (code === 'network') return t('network');
        return t('server');
    }

    /* ---------- API ---------- */

    async function api(path, { method = 'GET', body } = {}) {
        let res;
        try {
            res = await fetch(API + path, {
                method,
                credentials: 'same-origin',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (err) {
            const e = new Error('network');
            e.code = 'network';
            throw e;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const e = new Error(data.error || 'server_error');
            e.code = data.error || 'server_error';
            e.status = res.status;
            throw e;
        }
        return data;
    }

    /* A request that finds the session gone sends the user back to the gate. */
    function handleApiError(err, show) {
        if (err.code === 'signed_out') {
            showGate(t('signedOut'));
            return;
        }
        if (err.code === 'not_configured') {
            showNotConfigured();
            return;
        }
        show(errorText(err.code));
    }

    /* ---------- Screens ---------- */

    function showOnly(which) {
        els.loading.hidden = which !== 'loading';
        els.gate.hidden = which !== 'gate';
        els.content.hidden = which !== 'content';
        els.notConfigured.hidden = which !== 'notConfigured';
        els.container.classList.toggle('payment-container-dash', which === 'content');
        els.container.classList.toggle('payment-container-wide', which !== 'content');
    }

    function showGate(message) {
        showOnly('gate');
        els.gateError.hidden = !message;
        els.gateError.textContent = message || '';
        els.gateUser.focus();
    }

    function showNotConfigured() {
        els.notConfiguredText.textContent = t('notConfigured');
        showOnly('notConfigured');
    }

    function showDashboard(user) {
        state.user = user;
        els.sessionUser.textContent = user;
        showOnly('content');
        loadLists();
    }

    /* ---------- Sign-in ---------- */

    async function handleGateSubmit(e) {
        e.preventDefault();
        els.gateError.hidden = true;
        const btn = els.gateSubmit;
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = t('signingIn');
        try {
            const data = await api('/login', {
                method: 'POST',
                body: { user: els.gateUser.value, password: els.gatePassword.value }
            });
            els.gatePassword.value = '';
            showDashboard(data.user);
        } catch (err) {
            els.gatePassword.value = '';
            if (err.code === 'not_configured') return showNotConfigured();
            els.gateError.textContent = errorText(err.code);
            els.gateError.hidden = false;
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    async function handleLogout() {
        try {
            await api('/logout', { method: 'POST' });
        } catch (err) {
            /* the cookie expires on its own */
        }
        state.links = [];
        state.payments = [];
        state.lastLink = null;
        els.result.hidden = true;
        els.gateUser.value = '';
        showGate();
    }

    /* ---------- Tabs ---------- */

    function selectTab(tab) {
        els.tabs.forEach(btn => {
            const active = btn === tab;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            document.getElementById(btn.dataset.panel).hidden = !active;
        });
        if (tab !== els.tabNew && !state.loaded) loadLists();
    }

    /* ---------- New link ---------- */

    function showFormError(message) {
        els.error.textContent = message;
        els.error.hidden = false;
    }

    function readForm() {
        return {
            amount: Pay.parseAmount(els.amount.value),
            maxPayments: Number(els.payments.value) || 1,
            expiryDays: Number(els.expiry.value) || 0,
            description: els.description.value.trim(),
            customerName: els.name.value.trim(),
            customerPhone: els.phone.value.trim(),
            customerEmail: els.email.value.trim(),
            customerTaxId: els.taxId.value.trim(),
            lock: els.lock.checked,
            lang: els.english.checked ? 'en' : 'he'
        };
    }

    function validate(form) {
        if (!Pay.isValidAmount(form.amount)) return Pay.t('errAmount');
        if (!form.description) return Pay.t('errDescription');
        if (form.customerPhone && !Pay.isValidPhone(form.customerPhone)) return Pay.t('errPhone');
        if (form.customerEmail && !Pay.isValidEmail(form.customerEmail)) return Pay.t('errEmail');
        return null;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        els.error.hidden = true;

        const form = readForm();
        const problem = validate(form);
        if (problem) return showFormError(problem);

        els.amount.value = Pay.formatAmount(form.amount);
        const btn = els.submit;
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = t('creating');
        try {
            const { link } = await api('/links', { method: 'POST', body: form });
            state.links.unshift(link);
            renderResult(link);
            renderLinks();
            renderCounts();
        } catch (err) {
            handleApiError(err, showFormError);
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    function shareMessage(link) {
        return t('whatsappMessage', {
            name: link.customerName || t('defaultCustomer'),
            amount: Pay.formatAmount(link.amount),
            desc: link.description,
            url: link.url
        });
    }

    function whatsappHref(link) {
        const phone = link.customerPhone ? Pay.normalizePhone(link.customerPhone).replace(/^0/, '972') : '';
        return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(shareMessage(link));
    }

    function renderResult(link) {
        state.lastLink = link;
        els.output.value = link.url;
        els.resultTitle.textContent = t('readyLink');
        els.meta.textContent = (link.expiresAt
            ? t('metaExpires', { date: fmtDate(link.expiresAt) })
            : t('metaNoExpiry')) + ' · ' + (link.amountLocked ? t('metaLocked') : t('metaUnlocked'));
        els.shareWhatsapp.href = whatsappHref(link);
        els.shareEmail.href = 'mailto:' + (link.customerEmail || '') +
            '?subject=' + encodeURIComponent(t('emailSubject')) +
            '&body=' + encodeURIComponent(shareMessage(link));
        els.openLink.href = link.url;
        els.result.hidden = false;
        els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function copyText(text, button, resetLabel) {
        try {
            await navigator.clipboard.writeText(text);
            const before = button.innerHTML;
            button.textContent = t('copied');
            setTimeout(() => { button.innerHTML = resetLabel || before; }, 1600);
        } catch (err) {
            showFormError(t('copyFailed'));
        }
    }

    /* ---------- Lists ---------- */

    async function loadLists() {
        els.listError.hidden = true;
        els.refreshLinks.disabled = els.refreshPaid.disabled = true;
        try {
            const data = await api('/links');
            state.links = data.links;
            state.payments = data.payments;
            state.loaded = true;
            renderLinks();
            renderPayments();
            renderCounts();
        } catch (err) {
            handleApiError(err, message => {
                els.listError.textContent = message;
                els.listError.hidden = false;
            });
        } finally {
            els.refreshLinks.disabled = els.refreshPaid.disabled = false;
        }
    }

    function locale() {
        return Pay.getLang() === 'he' ? 'he-IL' : 'en-GB';
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    function fmtDateTime(iso) {
        return new Date(iso).toLocaleString(locale(), {
            day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    }

    function linkStatus(link) {
        if (link.paidCount > 0) return 'paid';
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) return 'expired';
        return 'open';
    }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (v === null || v === undefined || v === false) return;
            if (k === 'text') node.textContent = v;
            else if (k === 'cls') node.className = v;
            else node.setAttribute(k, v);
        });
        (children || []).forEach(c => c && node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return node;
    }

    /* Plain text goes in a span too, so the phone layout can grid every value */
    function cell(label, children, cls) {
        const kids = (children || []).map(c => (typeof c === 'string' ? el('span', { text: c }) : c));
        return el('td', { 'data-label': label, cls }, kids);
    }

    function money(sum) {
        return el('span', { dir: 'ltr', text: Pay.formatAmount(sum) + ' ₪' });
    }

    function header(table, i) {
        return els[table].querySelectorAll('th')[i].textContent.trim();
    }

    function renderLinks() {
        const q = els.search.value.trim().toLowerCase();
        const filter = els.filter.value;
        const rows = state.links.filter(link => {
            if (filter !== 'all' && linkStatus(link) !== filter) return false;
            if (!q) return true;
            return [link.description, link.customerName, link.customerPhone, link.customerEmail, link.customerTaxId]
                .some(v => v && String(v).toLowerCase().includes(q));
        });

        els.linksBody.replaceChildren(...rows.map(link => {
            const status = linkStatus(link);
            const statusLabel = status === 'paid'
                ? (link.paidCount > 1 ? t('statusPaidTimes', { n: link.paidCount }) : t('statusPaid'))
                : t(status === 'expired' ? 'statusExpired' : 'statusOpen');
            const copyBtn = el('button', { type: 'button', cls: 'pay-icon-btn', title: t('copyLink'), 'aria-label': t('copyLink') },
                [el('i', { cls: 'fas fa-copy' })]);
            copyBtn.addEventListener('click', () => copyText(link.url, copyBtn));
            const wa = el('a', {
                cls: 'pay-icon-btn', href: whatsappHref(link), target: '_blank', rel: 'noopener noreferrer',
                title: 'WhatsApp', 'aria-label': 'WhatsApp'
            }, [el('i', { cls: 'fab fa-whatsapp' })]);

            const terms = [link.maxPayments > 1 ? t('upTo', { n: link.maxPayments }) : null,
                link.expiresAt ? t('until', { date: fmtDate(link.expiresAt) }) : t('noExpiry')].filter(Boolean).join(' · ');

            return el('tr', {}, [
                cell(header('linksTable', 0), [fmtDate(link.createdAt)], 'nowrap'),
                cell(header('linksTable', 1), [
                    el('span', { cls: 'pay-cell-main', text: link.description }),
                    el('span', { cls: 'pay-cell-sub', text: terms })
                ]),
                cell(header('linksTable', 2), [
                    el('span', { cls: 'pay-cell-main', text: link.customerName || t('noCustomer') }),
                    link.customerPhone ? el('span', { cls: 'pay-cell-sub', dir: 'ltr', text: link.customerPhone }) : null
                ]),
                cell(header('linksTable', 3), [money(link.amount)], 'num'),
                cell(header('linksTable', 4), [
                    el('span', { cls: 'pay-badge is-' + status, text: statusLabel }),
                    status === 'paid' && link.lastPaidAt
                        ? el('span', { cls: 'pay-cell-sub', text: fmtDateTime(link.lastPaidAt) }) : null
                ]),
                cell('', [el('span', { cls: 'pay-actions' }, [copyBtn, wa])], 'actions')
            ]);
        }));

        els.linksTable.hidden = rows.length === 0;
        els.linksEmpty.hidden = rows.length > 0;
        els.linksEmpty.textContent = state.links.length ? t('emptyFiltered') : t('emptyLinks');
    }

    function renderPayments() {
        const rows = state.payments;
        els.paidBody.replaceChildren(...rows.map(p => el('tr', {}, [
            cell(header('paidTable', 0), [fmtDateTime(p.receivedAt)], 'nowrap'),
            cell(header('paidTable', 1), [
                el('span', { cls: 'pay-cell-main', text: p.payerName || '-' }),
                p.payerEmail ? el('span', { cls: 'pay-cell-sub', dir: 'ltr', text: p.payerEmail }) : null
            ]),
            cell(header('paidTable', 2), [
                el('span', { cls: 'pay-cell-main', text: p.linkDescription || p.description || '-' }),
                p.linkId ? null : el('span', { cls: 'pay-cell-sub', title: t('noLinkTitle'), text: t('noLink') })
            ]),
            cell(header('paidTable', 3), [money(p.sum)], 'num'),
            cell(header('paidTable', 4), [p.paymentsNum > 1 ? t('installments', { n: p.paymentsNum }) : '1']),
            cell(header('paidTable', 5), [p.invoiceNumber
                ? el('span', { dir: 'ltr', text: p.invoiceNumber })
                : el('span', { cls: 'pay-cell-sub', text: t('pending') })])
        ])));

        const sum = rows.reduce((acc, p) => acc + (Number(p.sum) || 0), 0);
        els.paidTotal.textContent = rows.length
            ? t(rows.length === 1 ? 'paidTotalOne' : 'paidTotal', { count: rows.length, sum: Pay.formatAmount(sum) })
            : '';
        els.paidTable.hidden = rows.length === 0;
        els.paidEmpty.hidden = rows.length > 0;
        els.paidEmpty.textContent = t('emptyPaid');
    }

    function renderCounts() {
        els.countLinks.textContent = state.loaded || state.links.length ? String(state.links.length) : '';
        els.countPaid.textContent = state.loaded ? String(state.payments.length) : '';
    }

    /* ---------- Boot ---------- */

    function cacheEls() {
        const ids = {
            container: 'linkContainer', loading: 'linkLoading',
            gate: 'linkGate', gateUser: 'gateUser', gatePassword: 'gatePassword',
            gateError: 'gateError', gateSubmit: 'gateSubmit',
            content: 'linkContent', sessionUser: 'sessionUser', logout: 'logoutBtn',
            tabNew: 'tabNew', tabLinks: 'tabLinks', tabPaid: 'tabPaid',
            form: 'linkForm', amount: 'linkAmount', payments: 'linkPayments', expiry: 'linkExpiry',
            description: 'linkDescription', name: 'linkName', phone: 'linkPhone', email: 'linkEmail',
            taxId: 'linkTaxId', lock: 'linkLock', english: 'linkEnglish', error: 'linkError', submit: 'linkSubmit',
            result: 'linkResult', resultTitle: 'linkResultTitle', meta: 'linkMeta', output: 'linkOutput',
            copy: 'copyLink', shareWhatsapp: 'shareWhatsapp', shareEmail: 'shareEmail', openLink: 'openLink',
            search: 'linksSearch', filter: 'linksFilter', refreshLinks: 'refreshLinks', listError: 'listError',
            linksTable: 'linksTable', linksBody: 'linksBody', linksEmpty: 'linksEmpty', countLinks: 'countLinks',
            refreshPaid: 'refreshPaid', paidTotal: 'paidTotal', paidTable: 'paidTable', paidBody: 'paidBody',
            paidEmpty: 'paidEmpty', countPaid: 'countPaid',
            notConfigured: 'linkNotConfigured', notConfiguredText: 'linkNotConfiguredText'
        };
        Object.keys(ids).forEach(key => { els[key] = document.getElementById(ids[key]); });
        els.tabs = [els.tabNew, els.tabLinks, els.tabPaid];
    }

    document.addEventListener('DOMContentLoaded', async () => {
        cacheEls();

        Pay.initChrome(() => {
            Pay.fillPaymentsSelect(els.payments, els.payments.value, { upTo: true });
            if (state.lastLink) renderResult(state.lastLink);
            if (state.loaded) {
                renderLinks();
                renderPayments();
            }
            if (!els.notConfigured.hidden) els.notConfiguredText.textContent = t('notConfigured');
        });

        Pay.fillPaymentsSelect(els.payments, 1, { upTo: true });
        els.description.value = Pay.t('defaultDescription');

        els.gate.addEventListener('submit', handleGateSubmit);
        els.logout.addEventListener('click', handleLogout);
        els.form.addEventListener('submit', handleSubmit);
        els.form.addEventListener('input', () => { els.error.hidden = true; });
        els.copy.addEventListener('click', () => copyText(els.output.value, els.copy, t('copy')));
        els.tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)));
        els.search.addEventListener('input', renderLinks);
        els.filter.addEventListener('change', renderLinks);
        els.refreshLinks.addEventListener('click', loadLists);
        els.refreshPaid.addEventListener('click', loadLists);

        try {
            const data = await api('/session');
            showDashboard(data.user);
        } catch (err) {
            if (err.code === 'not_configured') showNotConfigured();
            else if (err.code === 'signed_out') showGate();
            else showGate(errorText(err.code));
        }
    });
})();
