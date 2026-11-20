"""Writes the browser config for the payment pages (/pay, /pay-link) from the environment.

Reads PAY_ADMIN_USER / PAY_ADMIN_PASSWORD / PAY_LINK_SECRET / PAY_ALLOW_PLAIN_PARAMS / PAY_GROW_ENVIRONMENT
from the process environment (Vercel: Project Settings -> Environment Variables) or from a local .env / .env.local,
and writes window.PAY_CONFIG to the given file. tools/build.py calls it for dist/pay-assets/pay-config.js.

The admin password is never written out, only a PBKDF2-SHA256 hash. The link secret IS written out: the
customer's browser has to decrypt the ?d= token. See pay/README.md.

Must stay in step with pay/assets/pay-crypto.js (hashUser / hashPassword).
"""
import base64
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PBKDF2_ITERATIONS = 210000


def load_dotenv():
    """Fill missing variables from .env.local, then .env. The process environment always wins."""
    for name in (".env.local", ".env"):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$", line)
                if not m:
                    continue
                key, value = m.groups()
                if re.match(r"^(\".*\"|'.*')$", value):
                    value = value[1:-1]
                os.environ.setdefault(key, value)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def config():
    load_dotenv()
    user = os.environ.get("PAY_ADMIN_USER", "").strip()
    password = os.environ.get("PAY_ADMIN_PASSWORD", "")
    secret = os.environ.get("PAY_LINK_SECRET", "")
    allow_plain = os.environ.get("PAY_ALLOW_PLAIN_PARAMS") == "1"
    # must match CREDIT_CARD_ENVIRONMENT on cars-server, or the Grow widget talks to the wrong environment
    grow_env = "DEV" if os.environ.get("PAY_GROW_ENVIRONMENT") == "DEV" else "PRODUCTION"

    missing = [k for k, v in (("PAY_ADMIN_USER", user), ("PAY_ADMIN_PASSWORD", password), ("PAY_LINK_SECRET", secret)) if not v]
    if missing:
        # never fail the build over this: the site must still deploy, and the pages say they are not configured
        print(f"[pay-config] missing {', '.join(missing)}: /pay and /pay-link are disabled in this build")
        return {"configured": False, "allowPlainParams": allow_plain, "growEnvironment": grow_env, "version": 1}

    salt = os.urandom(16)  # per build; the login hash is recomputed on every deploy anyway
    print("[pay-config] payment pages configured" + (" (readable /pay params ENABLED)" if allow_plain else ""))
    return {
        "configured": True,
        "version": 1,
        "salt": b64(salt),
        "iterations": PBKDF2_ITERATIONS,
        "userHash": b64(hashlib.sha256(salt + user.lower().encode("utf-8")).digest()),
        "passHash": b64(hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS, 32)),
        "linkSecret": secret,
        "allowPlainParams": allow_plain,
        "growEnvironment": grow_env,
    }


def write(path):
    banner = ("/* ============================================\n"
              "   GENERATED FILE - DO NOT EDIT, DO NOT COMMIT.\n"
              "   Produced by tools/pay_config.py from the environment.\n"
              "   ============================================ */\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(banner + "window.PAY_CONFIG = " + json.dumps(config(), indent=4) + ";\n")
