"""Local preview of dist/ that behaves like Netlify: extensionless .html, _redirects, 404.

Run: python tools/serve.py  (http://localhost:5173)
"""
import http.server
import os
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")


def load_rules():
    rules = []
    with open(os.path.join(DIST, "_redirects"), encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if not parts or parts[0].startswith("#"):
                continue
            if len(parts) == 4 and "=" in parts[1]:
                k, v = parts[1].split("=", 1)
                rules.append((parts[0], (k, urllib.parse.unquote(v)), parts[2], parts[3]))
            elif len(parts) == 3:
                rules.append((parts[0], None, parts[1], parts[2]))
    return rules


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        query = dict(urllib.parse.parse_qsl(url.query))
        for src, cond, target, status in load_rules():
            if src != path:
                continue
            if cond and query.get(cond[0]) != cond[1]:
                continue
            if status.startswith("30"):
                self.send_response(int(status))
                self.send_header("Location", target)
                self.end_headers()
                return
            path = target
            break
        fs = os.path.join(DIST, path.lstrip("/"))
        if path.endswith("/") and os.path.exists(os.path.join(fs, "index.html")):
            path += "index.html"
        elif not os.path.splitext(path)[1] and os.path.exists(fs + ".html"):
            path += ".html"
        elif not os.path.exists(fs):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(os.path.join(DIST, "404.html"), "rb") as f:
                self.wfile.write(f.read())
            return
        self.path = urllib.parse.quote(path)
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", 5173), Handler).serve_forever()
