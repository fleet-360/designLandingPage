"""Writes the browser config for the payment page /pay from the environment.

Reads PAY_LINK_SECRET / PAY_ALLOW_PLAIN_PARAMS / PAY_GROW_ENVIRONMENT from the process environment
(Vercel: Project Settings -> Environment Variables) or from a local .env / .env.local, and writes
window.PAY_CONFIG to the given file. tools/build.py calls it for dist/pay-assets/pay-config.js.

The link secret IS written out: the customer's browser has to decrypt the ?d= token. The admin
credentials are not: /pay-link signs in through /api/pay/login. See pay/README.md.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def config():
    load_dotenv()
    secret = os.environ.get("PAY_LINK_SECRET", "")
    allow_plain = os.environ.get("PAY_ALLOW_PLAIN_PARAMS") == "1"
    # must match CREDIT_CARD_ENVIRONMENT on cars-server, or the Grow widget talks to the wrong environment
    grow_env = "DEV" if os.environ.get("PAY_GROW_ENVIRONMENT") == "DEV" else "PRODUCTION"
    if not secret:
        # never fail the build over this: the site must still deploy, and /pay says it is not configured
        print("[pay-config] missing PAY_LINK_SECRET: /pay is disabled in this build")
        return {"configured": False, "allowPlainParams": allow_plain, "growEnvironment": grow_env, "version": 2}
    print("[pay-config] payment page configured" + (" (readable /pay params ENABLED)" if allow_plain else ""))
    return {"configured": True, "version": 2, "linkSecret": secret, "allowPlainParams": allow_plain, "growEnvironment": grow_env}


def write(path):
    banner = ("/* ============================================\n"
              "   GENERATED FILE - DO NOT EDIT, DO NOT COMMIT.\n"
              "   Produced by tools/pay_config.py from the environment.\n"
              "   ============================================ */\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(banner + "window.PAY_CONFIG = " + json.dumps(config(), indent=4) + ";\n")
