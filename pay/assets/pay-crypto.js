/* ============================================
   PRO ALGORITHM - Payment link obfuscation
   Wraps the payment parameters in an AES-GCM token so a link reads
   /pay?d=8Kj3... instead of /pay?amount=1200, and so a recipient
   cannot edit the amount without the token failing to decrypt.

   The key is derived from PAY_LINK_SECRET (see tools/pay_config.py).
   Note that this is obfuscation, not secrecy: the payment page has to
   decrypt in the visitor's browser, so the secret ships with the page.
   ============================================ */

window.ProAlgoPayCrypto = (function () {

    /* Fixed salt: the link key must stay stable across deploys,
       otherwise links already sent out would stop opening. */
    const LINK_KEY_SALT = 'proalgo-pay-link-v1';
    const LINK_KEY_ITERATIONS = 100000;
    const IV_BYTES = 12;

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    /* PBKDF2 is deliberately slow - derive each key once per page. */
    const linkKeys = new Map();

    function subtle() {
        const cryptoObj = window.crypto;
        if (!cryptoObj || !cryptoObj.subtle) {
            throw new Error('Web Crypto is unavailable (the page must be served over HTTPS)');
        }
        return cryptoObj.subtle;
    }

    /* ---------- base64 / base64url ---------- */

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        const binary = atob(String(base64).replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function toBase64Url(bytes) {
        return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /* ---------- Key derivation ---------- */

    async function importPassword(password) {
        return subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
    }

    async function getLinkKey(secret) {
        if (!secret) throw new Error('Missing link secret');
        if (!linkKeys.has(secret)) {
            linkKeys.set(secret, (async () => {
                const material = await importPassword(secret);
                return subtle().deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: enc.encode(LINK_KEY_SALT),
                        iterations: LINK_KEY_ITERATIONS,
                        hash: 'SHA-256'
                    },
                    material,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
            })());
        }
        return linkKeys.get(secret);
    }

    /* ---------- Token encode / decode ---------- */

    async function encodeToken(payload, secret) {
        const key = await getLinkKey(secret);
        const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const ciphertext = new Uint8Array(
            await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)))
        );

        const token = new Uint8Array(iv.length + ciphertext.length);
        token.set(iv, 0);
        token.set(ciphertext, iv.length);
        return toBase64Url(token);
    }

    /* Throws when the token was tampered with, truncated,
       or produced with a different secret. */
    async function decodeToken(token, secret) {
        const key = await getLinkKey(secret);
        const bytes = base64ToBytes(token);
        if (bytes.length <= IV_BYTES) throw new Error('Malformed token');

        const plain = await subtle().decrypt(
            { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
            key,
            bytes.slice(IV_BYTES)
        );
        return JSON.parse(dec.decode(plain));
    }

    /* ---------- Login hashes (must match tools/pay_config.py) ---------- */

    async function hashUser(user, saltBase64) {
        const salt = base64ToBytes(saltBase64);
        const name = enc.encode(String(user || '').trim().toLowerCase());
        const input = new Uint8Array(salt.length + name.length);
        input.set(salt, 0);
        input.set(name, salt.length);
        return bytesToBase64(new Uint8Array(await subtle().digest('SHA-256', input)));
    }

    async function hashPassword(password, saltBase64, iterations) {
        const material = await importPassword(password);
        const bits = await subtle().deriveBits(
            {
                name: 'PBKDF2',
                salt: base64ToBytes(saltBase64),
                iterations: Number(iterations) || 210000,
                hash: 'SHA-256'
            },
            material,
            256
        );
        return bytesToBase64(new Uint8Array(bits));
    }

    return { encodeToken, decodeToken, hashUser, hashPassword };
})();
