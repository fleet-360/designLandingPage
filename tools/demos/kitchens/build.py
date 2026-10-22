"""Public demo build of the kitchen design app ("סטודיו מטבחים") for buildalgo.co.il/catalog/kitchens/.

    python -I tools/demos/kitchens/build.py [--repo PATH] [--rev REV] [--work PATH] [--skip-install]
    python -I tools/demos/kitchens/build.py --base DIR       # the patch base only (see "Updating the patch")

The site is public and never names a client. The kitchen app is planned on a manufacturer's catalogue for one of its
showrooms, so the manufacturer and its product lines are client names, like the project, its developer and its
architects. None of them is stored in this folder or in catalog/kitchens/. They are derived from the private source
at build time and kept in memory only (private_terms):
  - manufacturer: the catalogue folder of the kitchens repo (data/<Name><year>/). Its Hebrew spellings are matched by
    a pattern generated from the Latin letters (HE_LETTERS); its product lines are the short codes ("x9") that follow
    the name in the app source;
  - project: public/projects/*/project.json (folder, project name, source file, architects).

1. EXPORT: the last committed app (`git archive <rev> app`, default HEAD) goes into a work folder outside both repos
   (default %TEMP%/kitchens-demo-build/app). The kitchens checkout (working tree, index, node_modules) is only read
   through git, so uncommitted work there never reaches the demo. index.json, the meshes and project.json go to
   %TEMP%/kitchens-demo-build/app-data; plan images, renders, prices.json and the dev tools are never extracted.
2. DELETE: project dashboard, shape review screen, alternatives bar, kitchen dossier (the showroom's title block and
   file names with designer / project names), portfolio drafting rules, plan underlay helpers, AI render modules.
3. NEUTRALIZE: every occurrence of a derived term in the exported source becomes a token (@brand@ / @Brand@ / @BRAND@,
   @brand-he@, @line@ / @LINE@, @project@). demo.patch is written against this tokenized tree, so neither its context
   nor its removed lines contain a name, and the patch replaces every token that would reach the bundle. A file whose
   upstream text is the manufacturer's own copy (the presentation) is replaced whole from overlay/ (REPLACES), so not
   even a removed line of that copy is stored here; the build warns when such a file changed upstream.
4. SEED: neutral texts for the built-in demo kitchen (src/seed.ts, by field, whatever the old value was).
5. demo.patch + overlay/: Vite base /catalog/kitchens/ without the dev-server API (overlay/vite.config.ts), data URLs
   from import.meta.env.BASE_URL, editor opens on the demo kitchen in 3D, no prices anywhere, no /api calls, snapshot
   panel instead of the render panel, reset button, three.js in a lazy chunk, generic studio branding, site strip +
   first-visit hint + GA events (overlay/src/demo/), phone layout.
6. RECODE: the manufacturer's article codes identify it, so every code becomes a generic one, made in memory from
   the catalogue (generic_codes): type letter + width in cm + running number + the original L/R hand suffix, e.g.
   T060-01R. In the source, quoted codes are swapped, each code-family regex (/^<digits>.../) becomes the exact list
   of generic codes it matched, and the "code shown with spaces" display rewrite is dropped. The hand suffix keeps
   /R$/ working. Mesh part names (the manufacturer's CAD part names; the app never reads them) become p1, p2, ...
7. DATA: catalog/index.json without unused fields, catalog/desc.json empty (no price-list text at all), meshes
   renamed to their generic code.
8. BUILD: npm ci (when package-lock.json changed) + npm run build (tsc -b + vite), then the site <head> (title,
   description, canonical, favicon, fonts, <!--tracking-->) in index.html.
9. PUBLISH + CHECK: replaces catalog/kitchens/, writes thumb.svg (plan + elevation A of the demo kitchen) and fails
   when a derived term or a token is found in any output file (meshes included) or in this folder, when another file
   of the site names the manufacturer, on prices, /api or /projects URLs in the output, or on an original article
   code or mesh part name anywhere in the output or in this folder. Hits are reported as file + pattern number +
   offset, never as the matched text, so the build log never shows a name either.

The patch is written against a given app commit; when it no longer applies to HEAD, build that commit with --rev
(or update the patch, below).

Updating the patch after the app changed:
    python -I tools/demos/kitchens/build.py --base %TEMP%/kitchens-patch       (steps 1-4, then git init + commit)
    cd %TEMP%/kitchens-patch && git apply --3way <site>/tools/demos/kitchens/demo.patch
    ... fix, edit (npm ci there to type-check with `npx tsc -b`) ...
    git diff > <site>/tools/demos/kitchens/demo.patch       (modified files only; new files go to overlay/)
Tokens stand where names were: keep them in context lines, and where a token sits in text the demo shows, write
generic wording. Never type a real name into this folder; the check fails on it.
"""
import argparse
import hashlib
import html
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2]
OUT = SITE / "catalog" / "kitchens"
PATCH = HERE / "demo.patch"          # edits to app files (against the tokenized tree)
OVERLAY = HERE / "overlay"            # files added to the app or replacing one as a whole, same relative paths

SLUG = "kitchens"
TITLE = "סטודיו מטבחים | דמו אינטראקטיבי · Pro Algorithm"
DESCRIPTION = ("דמו אינטראקטיבי של סטודיו לתכנון מטבחים על קטלוג יצרן אמיתי: אלפי יחידות עם חיפוש וסינון, "
               "גרירה על התוכנית, תלת־ממד עם דלתות ומגירות נפתחות, חזיתות, מניפת חומרים ומצגת ללקוח להדפסה כ־PDF.")

# what is extracted from `git archive <rev> app` (paths relative to app/)
APP_FILES = re.compile(r"^(src/(?!assets/).+|index\.html|package\.json|package-lock\.json|tsconfig[\w.]*\.json|vite\.config\.ts)$")
DATA_FILES = re.compile(r"^public/(catalog/index\.json|catalog/mesh/[^/]+\.json|projects/[^/]+/project\.json)$")

# app modules that only serve the real-estate portfolio, the showroom's dossier or the Gemini renders
DELETE = [
    "src/components/Dashboard.tsx",
    "src/components/ShapeReview.tsx",
    "src/components/AltBar.tsx",
    "src/components/RenderPanel.tsx",
    "src/dossier/Dossier.tsx",
    "src/dossier/dossier.css",
    "src/dossier/exportPdf.ts",
    "src/dossier/spec.ts",
    "src/model/portfolio.ts",
    "src/model/shapeFix.ts",
    "src/model/wallScan.ts",
    "src/model/renderPrompt.ts",
]
# upstream files replaced whole by overlay/ (their text is the manufacturer's copy): sha256[:16] of the tokenized
# upstream file the overlay was written against, so a later upstream change is noticed
REPLACES = {
    "src/presentation/Presentation.tsx": "d75d2a0262bff04f",
}
# texts of the built-in demo kitchen (src/seed.ts)
SEED = {"name": "Kitchen presentation", "client": "Sample Residence", "designer": "Kitchen Studio", "showroom": "Pro Algorithm"}
# index.json fields the app reads (folder/file/variant/roles/faces are export metadata)
INDEX_KEYS = ["code", "cat", "w", "d", "h", "slots", "doors", "drawers", "flaps", "appliance", "sink", "plan", "front"]
TEXT_EXT = {".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".json", ".md", ".svg", ".txt", ".patch", ".py"}
TOKEN = re.compile(r"@(?:brand|line|project)", re.I)

# Latin letter -> Hebrew letters of a transliteration (vowels optional), to find the manufacturer's name in Hebrew
HE_LETTERS = {
    "a": "[אעה]?", "e": "[אעי]?", "i": "[יא]?", "o": "[וא]?", "u": "[וא]?", "y": "[יא]?",
    "b": "ב", "c": "[קכסצ]", "d": "ד", "f": "[פף]", "g": "ג", "h": "[הח]?", "j": "[גזי]'?", "k": "[קכך]",
    "l": "ל", "m": "[מם]", "n": "[נן]", "p": "[פף]", "q": "ק", "r": "ר", "s": "[סשז]", "t": "[טת]",
    "v": "[וב]", "w": "ו", "x": "(?:קס|כס)", "z": "[זצ]",
}
HEB = "א-ת"


def log(msg):
    print(f"[kitchens] {msg}", flush=True)


def run(cmd, cwd):
    log(f"$ {cmd}")
    r = subprocess.run(cmd, cwd=cwd, shell=True)
    if r.returncode:
        sys.exit(f"command failed ({r.returncode}): {cmd}")


def git(repo: Path, *args) -> bytes:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if r.returncode:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


# ---------------------------------------------------------------------------------------------- 1. export
def export_source(repo: Path, rev: str, work: Path, private: Path):
    """App source of `rev` -> work (node_modules kept), its data -> private. Reads git objects only."""
    commit = git(repo, "log", "-1", "--format=%h %ci", rev).decode().strip()
    log(f"source: {repo.name} @ {commit}")
    for d in (work, private):
        d.mkdir(parents=True, exist_ok=True)
        for p in d.iterdir():
            if p.name == "node_modules":
                continue
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    tar = tarfile.open(fileobj=io.BytesIO(git(repo, "archive", "--format=tar", rev, "app")))
    n_app = n_data = 0
    for m in tar:
        if not m.isfile() or not m.name.startswith("app/"):
            continue
        rel = m.name[4:]
        if APP_FILES.match(rel):
            dst, n_app = work / rel, n_app + 1
        elif DATA_FILES.match(rel):
            dst, n_data = private / rel[len("public/"):], n_data + 1
        else:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        b = tar.extractfile(m).read()
        if dst.suffix in TEXT_EXT:
            b = b.replace(b"\r\n", b"\n")
        dst.write_bytes(b)
    log(f"exported {n_app} app files, {n_data} data files")
    return commit


# ---------------------------------------------------------------------------------------------- terms
def hebrew_pattern(word: str) -> str:
    w = re.sub(r"(.)\1+", r"\1", word.lower())
    return "".join(HE_LETTERS.get(c, "") for c in w)


def project_terms(private: Path):
    """Names of the real-estate project, its developer and its architects, read from the source project files."""
    stop = {"תכניות", "תוכניות", "מטבחים", "מטבח", "לחברת", "חברת", "pptx", "opt"}
    terms = set()
    for pj in (private / "projects").glob("*/project.json"):
        p = json.loads(pj.read_text(encoding="utf-8"))
        terms.add(pj.parent.name)
        terms.update(w for w in re.split(r"[-_]", pj.parent.name) if len(w) >= 3)
        for v in (p.get("name", ""), p.get("source", "")):
            terms.update(w for w in re.findall(r"[\w'\"׳״]+", v) if len(w) >= 3 and w.lower() not in stop and not w.isdigit()
                         and not re.fullmatch(r"\d+[\w]*", w))
        for t in p.get("types", []):
            if t.get("architect"):
                terms.add(t["architect"])
                terms.update(w for w in t["architect"].split() if len(w) >= 3)
    return sorted(terms)


def private_terms(repo: Path, rev: str, work: Path, private: Path):
    """Client names as regexes, derived from the private source (never written anywhere).
    'check': patterns that must not occur in the output or in this folder; 'tokens': (pattern, replacement) pairs
    for the tokenized source; 'site': manufacturer patterns checked across the whole site repo."""
    names = git(repo, "ls-tree", "--name-only", f"{rev}:data").decode().split()
    brands = sorted({m.group(1) for n in names if (m := re.fullmatch(r"([A-Za-z]{3,})[-_ ]?(?:19|20)\d\d", n))}, key=len, reverse=True)
    if not brands:
        sys.exit("cannot derive the manufacturer: no data/<Name><year>/ catalogue folder in the kitchens repo (update private_terms)")
    source = "\n".join(p.read_text(encoding="utf-8") for p in work.rglob("*")
                       if p.is_file() and p.suffix in TEXT_EXT and "node_modules" not in p.parts)
    he = [hebrew_pattern(b) for b in brands]
    lines = sorted({m.group(1).lower() for b in brands
                    for m in re.finditer(rf"(?i)(?<![a-z]){re.escape(b)}[ -]+([a-z]\d{{1,2}})(?!\w)", source)})
    if not any(re.search(re.escape(b), source, re.I) for b in brands):
        log("warning: the manufacturer's name does not occur in the app source any more")
    proj = project_terms(private)
    latin = [t for t in proj if re.search(r"[A-Za-z]", t)]
    hebrew = [t for t in proj if t not in latin]

    def case_token(m):   # keeps the casing of the name: @brand@ / @Brand@ / @BRAND@
        return f"@{'BRAND' if m.group(1).isupper() else 'Brand' if m.group(1)[0].isupper() else 'brand'}@"

    place = r"(?:[ -](?:tel[- ]?aviv|tlv|ta|israel)(?![a-z])(?:'s)?)?"   # the showroom: "<name> <city>"
    tokens = [(re.compile(rf"({re.escape(b)}){place}", re.I), case_token) for b in brands]
    tokens += [(re.compile(rf"{p}(?: ישראל(?: בע\"מ)?)?"), "@brand-he@") for p in he]
    tokens += [(re.compile(rf"(?<![\w#.])({re.escape(l)})(?!\w)", re.I), lambda m: "@LINE@" if m.group(1).isupper() else "@line@") for l in lines]
    tokens += [(re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])", re.I), "@project@") for t in sorted(latin, key=len, reverse=True)]
    tokens += [(re.compile(rf"(?<![{HEB}])([ובלהמשכ]?){re.escape(t)}(?![{HEB}])"), r"\1@project@") for t in sorted(hebrew, key=len, reverse=True)]

    site = [re.compile(re.escape(b), re.I) for b in brands] + [re.compile(p) for p in he]
    site += [re.compile(rf"(?<![\w#.]){re.escape(l)}(?!\w)", re.I) for l in lines]
    site += [re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])", re.I) for t in latin]
    check = site + [re.compile(re.escape(t)) for t in hebrew]
    log(f"private terms: {len(brands)} manufacturer, {len(he)} Hebrew pattern, {len(lines)} product line, {len(proj)} project/architect (not shown)")
    return {"check": check, "tokens": tokens, "site": site}


# ---------------------------------------------------------------------------------------------- 2-5. source
def neutralize(work: Path, terms):
    files = [p for p in work.rglob("*") if p.is_file() and "node_modules" not in p.parts and p.suffix in TEXT_EXT]
    n = 0
    for p in files:
        t = p.read_text(encoding="utf-8")
        u = t
        for rx, rep in terms["tokens"]:
            u = rx.sub(rep, u)
        if u != t:
            n += 1
            p.write_text(u, encoding="utf-8", newline="\n")
    left = [f"{p.relative_to(work)}" for p in files for rx in terms["check"] if rx.search(p.read_text(encoding="utf-8"))]
    if left:
        sys.exit(f"neutralize: names left in {sorted(set(left))} (update private_terms)")
    log(f"neutralized {n} files")


def prepare_source(work: Path, terms):
    for rel in DELETE:
        f = work / rel
        if f.exists():
            f.unlink()
        else:
            log(f"warning: {rel} not found (app changed?)")
    for d in sorted({(work / rel).parent for rel in DELETE}, reverse=True):
        if d.exists() and not any(d.iterdir()):
            d.rmdir()
    neutralize(work, terms)
    seed = work / "src" / "seed.ts"
    s = seed.read_text(encoding="utf-8")
    for key, val in SEED.items():
        s, n = re.subn(rf"^(\s*{key}: )'[^']*',", lambda m: f"{m.group(1)}'{val}',", s, count=1, flags=re.M)
        if not n:
            sys.exit(f"seed.ts: field '{key}' not found")
    seed.write_text(s, encoding="utf-8", newline="\n")


def apply_demo(work: Path):
    for rel, digest in REPLACES.items():
        f = work / rel
        h = hashlib.sha256(f.read_bytes()).hexdigest()[:16] if f.exists() else "missing"
        if h != digest:
            log(f"warning: {rel} changed upstream (sha {h}, overlay written against {digest}): review overlay/{rel}")
    run(f'git apply --whitespace=nowarn "{PATCH}"', cwd=work)
    for f in OVERLAY.rglob("*"):
        if f.is_file():
            dst = work / f.relative_to(OVERLAY)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dst)


# ---------------------------------------------------------------------------------------------- 6. recode
CAT_LETTER = {"base": "B", "wall": "W", "tall": "T", "housing": "H", "accessory": "A", "worktop": "K", "plinth": "P", "counter": "C"}
CODE_LIT = re.compile(r"""(['"`])(\d{2,3}[A-Z][A-Z0-9]*)\1""")                          # '<digits><LETTER>...'
REGEX_LIT = re.compile(r"(?<![\w)\]])/((?:\\.|\[[^\]\n]*\]|[^/\n\\\[])+)/([gimsuy]*)")
SPACED = re.compile(r"(\b[\w.]+\.code)\.replace\(/\^\d\d[A-Z]+/, '[^']*'\)\.replace\(/[A-Z]\$/, '[^']*'\)")


def generic_codes(private: Path):
    """Original article code -> generic code, in memory only. Same type, width and stem -> same number, so the
    left and right hand of an article stay a pair (T060-01L / T060-01R)."""
    articles = json.loads((private / "catalog" / "index.json").read_text(encoding="utf-8"))
    groups = {}
    for a in articles:
        code = a["code"]
        hand = code[-1] if code[-1] in "LR" and len(code) > 1 else ""
        key = (CAT_LETTER.get(a["cat"], "X"), round(a["w"] / 10))
        groups.setdefault(key, {}).setdefault(code[:len(code) - len(hand)], []).append((code, hand, a["h"], a["d"]))
    cmap = {}
    for (letter, wcm), stems in groups.items():
        order = sorted(stems, key=lambda s: (min(x[2] for x in stems[s]), min(x[3] for x in stems[s]), s))
        digits = max(2, len(str(len(order))))
        for n, stem in enumerate(order, 1):
            for code, hand, _, _ in stems[stem]:
                cmap[code] = f"{letter}{wcm:03d}-{n:0{digits}d}{hand}"
    if len(set(cmap.values())) != len(cmap):
        sys.exit("generic_codes: duplicate generic code")
    return cmap


def recode_source(work: Path, cmap: dict):
    """Swap every original code in the app source for its generic code (see 6. RECODE above)."""
    extra = {}   # quoted codes that are not catalogue articles (e.g. a part ordered with the island back)

    def lit(m):
        code = m.group(2)
        if code not in cmap:
            code = extra.setdefault(code, f"X000-{len(extra) + 1:02d}")
        return f"{m.group(1)}{cmap.get(m.group(2), code)}{m.group(1)}"

    def family(m):
        if not re.match(r"\^\d", m.group(1)):
            return m.group(0)
        rx = re.compile(m.group(1))
        hits = sorted(g for c, g in cmap.items() if rx.search(c))
        return f"/^(?:{'|'.join(hits)})$/" if hits else "/(?!)/"

    n_files = n_rules = 0
    for p in (work / "src").rglob("*"):
        if not p.is_file() or p.suffix not in (".ts", ".tsx"):
            continue
        t = p.read_text(encoding="utf-8")
        u = SPACED.sub(r"\1", t)
        u = CODE_LIT.sub(lit, u)
        u, k = REGEX_LIT.subn(family, u)
        n_rules += sum(1 for m in REGEX_LIT.finditer(t) if re.match(r"\^\d", m.group(1)))
        if CODE_LIT.search(u) or any(re.match(r"\^\d", m.group(1)) for m in REGEX_LIT.finditer(u)):
            sys.exit(f"recode: original code left in {p.relative_to(work)}")
        if u != t:
            n_files += 1
            p.write_text(u, encoding="utf-8", newline="\n")
    log(f"recode: {len(cmap)} article codes, {n_rules} code-family rules, {len(extra)} other codes, {n_files} files")


def recode_mesh(m: dict, cmap: dict):
    m["code"] = cmap[m["code"]]
    for i, part in enumerate(m.get("parts", []), 1):
        part["name"] = f"p{i}"
    return m


# ---------------------------------------------------------------------------------------------- 7. data
def prepare_data(private: Path, work: Path, cmap: dict):
    dst = work / "public" / "catalog"
    dst.mkdir(parents=True, exist_ok=True)
    articles = json.loads((private / "catalog" / "index.json").read_text(encoding="utf-8"))
    for a in articles:
        a["code"] = cmap[a["code"]]
    slim = [{k: a[k] for k in INDEX_KEYS if k in a} for a in articles]
    (dst / "index.json").write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # no price-list text in the public demo (owner's decision, 2026-10-17): desc.json stays empty,
    # so the app names articles from their geometry ("Base unit, 2 pull-outs")
    (dst / "desc.json").write_text("{}", encoding="utf-8")
    log(f"data: {len(slim)} articles, no descriptions")
    return {a["code"]: a for a in articles}


# ---------------------------------------------------------------------------------------------- 8. build
def install_and_build(work: Path, skip_install: bool):
    lock = (work / "package-lock.json").read_bytes()
    stamp = work / "node_modules" / ".demo-lock.sha256"
    h = hashlib.sha256(lock).hexdigest()
    if not skip_install and (not stamp.exists() or stamp.read_text() != h):
        run("npm ci --no-audit --no-fund", cwd=work)
        stamp.write_text(h)
    dist = work / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    run("npm run build", cwd=work)
    return dist


def site_head(index: Path):
    t = index.read_text(encoding="utf-8")
    fonts = ("https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700"
             "&family=IBM+Plex+Sans+Hebrew:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap")
    head = f"""<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{html.escape(TITLE)}</title>
    <meta name="description" content="{html.escape(DESCRIPTION)}" />
    <link rel="canonical" href="https://www.buildalgo.co.il/catalog/{SLUG}/" />
    <meta property="og:title" content="סטודיו מטבחים | Pro Algorithm" />
    <meta property="og:description" content="{html.escape(DESCRIPTION)}" />
    <meta property="og:image" content="https://www.buildalgo.co.il/assets/img/brand/og.jpg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/brand/icon-32.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="{fonts}" />
    <!--tracking-->"""
    t, n = re.subn(r"<meta charset=\"UTF-8\" />.*?<link href=\"https://fonts\.googleapis\.com/[^\"]*\" rel=\"stylesheet\" />",
                   lambda _: head, t, count=1, flags=re.S)
    if not n:
        sys.exit("index.html: unexpected <head>, update site_head()")
    t = t.replace('<div id="root"></div>', '<div id="root"></div>\n    <noscript>הדמו דורש JavaScript.</noscript>')
    index.write_text(t, encoding="utf-8", newline="\n")


def publish(dist: Path, private: Path, cmap: dict):
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(dist, OUT)
    dst = OUT / "catalog" / "mesh"
    dst.mkdir(parents=True, exist_ok=True)
    for f in (private / "catalog" / "mesh").glob("*.json"):
        m = recode_mesh(json.loads(f.read_text(encoding="utf-8")), cmap)
        (dst / f"{m['code']}.json").write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ---------------------------------------------------------------------------------------------- thumb.svg
def parse_seed(seed_ts: str):
    room = dict((k, int(v)) for k, v in re.findall(r"(width|depth|height): (\d+)", re.search(r"room: \{[^}]*\}", seed_ts).group(0)))
    runs = []
    for m in re.finditer(r"\{\s*id: '[^']+', name: '[^']*', kind: '(\w+)', wall: '(\w)', level: '(\w+)', start: (\d+), bottom: (\d+),(.*?)units: \[(.*?)\]", seed_ts, re.S):
        kind, wall, level, start, bottom, extra, units = m.groups()
        isl = re.search(r"island: \{ x: (-?\d+), y: (-?\d+), rot: (-?\d+) \}", extra)
        runs.append({
            "kind": kind, "wall": wall, "level": level, "start": int(start), "bottom": int(bottom),
            "island": tuple(int(v) for v in isl.groups()) if isl else None,
            "units": re.findall(r"code: '([^']+)'(?:, func: '(\w+)')?", units),
        })
    return room, runs


def layout(room, runs, index):
    """Same placement rules as src/model/layout.ts (runTransform)."""
    W, D = room["width"], room["depth"]
    out = []
    for r in runs:
        s = r["start"]
        for code, func in r["units"]:
            a = index.get(code)
            if not a:
                continue
            depth = 0 if r["kind"] == "island" else a["d"]
            if r["kind"] == "island":
                x, y, rot = r["island"]
                origin, rot = (x + math.cos(math.radians(rot)) * s, y + math.sin(math.radians(rot)) * s), rot
            else:
                origin, rot = {"A": ((s, D - depth), 0), "B": ((depth, s), 90),
                               "C": ((W - depth, D - s), -90), "D": ((W - s, depth), 180)}[r["wall"]]
            out.append({"a": a, "run": r, "func": func, "s": s, "origin": origin, "rot": rot,
                        "z": r["bottom"] if r["level"] == "upper" else 0})
            s += a["w"]
    return out


def thumb_svg(room, placements):
    BG, GRID, LINE, DIM, RED = "#111519", "#1d232a", "#c9d1d4", "#7E8C95", "#ff5b2e"
    FRONT, TOP, TALL = "#2a333b", "#1f2830", "#34404a"
    W, D, H = room["width"], room["depth"], room["height"]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="{BG}"/>']
    for x in range(40, 1200, 40):
        o.append(f'<line x1="{x}" y1="0" x2="{x}" y2="675" stroke="{GRID}" stroke-width="1"/>')
    for y in range(35, 675, 40):
        o.append(f'<line x1="0" y1="{y}" x2="1200" y2="{y}" stroke="{GRID}" stroke-width="1"/>')

    # ---- plan (left), y-up world mm -> screen
    k = 0.088
    wt = 150
    plan_h = (D + 2 * wt) * k
    px0, py0 = 70, (675 - plan_h) / 2 + plan_h + 14  # screen position of world (-wt, -wt); room centred, room for the top dims
    P = lambda x, y: (px0 + (x + wt) * k, py0 - (y + wt) * k)
    def poly(pts, **attrs):
        a = " ".join(f'{k_.replace("_", "-")}="{v}"' for k_, v in attrs.items())
        return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" {a}/>'
    x0, y0 = P(-wt, D + wt)
    x1, y1 = P(W + wt, -wt)
    o.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" height="{y1 - y0:.1f}" fill="#3a444d"/>')
    a0, b0 = P(0, D)
    a1, b1 = P(W, 0)
    o.append(f'<rect x="{a0:.1f}" y="{b0:.1f}" width="{a1 - a0:.1f}" height="{b1 - b0:.1f}" fill="{BG}"/>')
    # door opening in wall D, as in the app plan
    d0, _ = P(W * 0.3, 0)
    d1, _ = P(W * 0.7, 0)
    o.append(f'<rect x="{d0:.1f}" y="{b1 - 1:.1f}" width="{d1 - d0:.1f}" height="{wt * k + 2:.1f}" fill="{BG}"/>')
    o.append(f'<line x1="{d0:.1f}" y1="{b1 + wt * k / 2:.1f}" x2="{d1:.1f}" y2="{b1 + wt * k / 2:.1f}" stroke="{LINE}" stroke-width="1"/>')

    def world(p, lx, ly):
        r = math.radians(p["rot"])
        ox, oy = p["origin"]
        return ox + math.cos(r) * lx - math.sin(r) * ly, oy + math.sin(r) * lx + math.cos(r) * ly

    island = [p for p in placements if p["run"]["kind"] == "island"]
    for p in sorted(placements, key=lambda q: q["run"]["level"] == "upper"):
        a = p["a"]
        upper = p["run"]["level"] == "upper"
        corners = [P(*world(p, x, y)) for x, y in ((0, 0), (a["w"], 0), (a["w"], a["d"]), (0, a["d"]))]
        if upper:
            o.append(poly(corners, fill="none", stroke=DIM, stroke_width="1", stroke_dasharray="5 4"))
            continue
        fill = TALL if a["cat"] in ("tall", "housing") else TOP
        o.append(poly(corners, fill=fill, stroke=LINE, stroke_width="1.2"))
        for sg in a["plan"]:
            (xa, ya), (xb, yb) = P(*world(p, sg[0], sg[1])), P(*world(p, sg[2], sg[3]))
            o.append(f'<line x1="{xa:.1f}" y1="{ya:.1f}" x2="{xb:.1f}" y2="{yb:.1f}" stroke="{DIM}" stroke-width=".7"/>')
        for dr in a["doors"]:
            if dr["hinge"] not in ("left", "right"):
                continue
            hx = dr["x"] if dr["hinge"] == "left" else dr["x"] + dr["w"]
            ex = dr["x"] + dr["w"] if dr["hinge"] == "left" else dr["x"]
            (hx0, hy0), (hx1, hy1), (ex0, ey0) = P(*world(p, hx, 0)), P(*world(p, hx, -dr["w"])), P(*world(p, ex, 0))
            sweep = 1 if dr["hinge"] == "left" else 0
            rr = dr["w"] * k
            o.append(f'<path d="M{hx0:.1f},{hy0:.1f} L{hx1:.1f},{hy1:.1f} A{rr:.1f},{rr:.1f} 0 0 {sweep} {ex0:.1f},{ey0:.1f}" fill="none" stroke="{DIM}" stroke-width=".8" stroke-dasharray="4 3"/>')
        cx, cy = P(*world(p, a["w"] / 2, a["d"] / 2))
        if p["func"] == "sink":
            o.append(f'<rect x="{cx - 22:.1f}" y="{cy - 16:.1f}" width="44" height="32" rx="4" fill="none" stroke="{LINE}" stroke-width="1.2"/>')
        if p["func"] == "hob":
            o.append(f'<rect x="{cx - 33:.1f}" y="{cy - 20:.1f}" width="66" height="40" rx="2" fill="#0b0e11" stroke="{LINE}" stroke-width="1"/>')
            for dx, dy in ((-17, -10), (17, -10), (-17, 10), (17, 10)):
                o.append(f'<circle cx="{cx + dx:.1f}" cy="{cy + dy:.1f}" r="7.5" fill="none" stroke="{DIM}" stroke-width="1"/>')
    if island:
        xs, ys = [], []
        for p in island:
            for x, y in ((0, 0), (p["a"]["w"], 0), (p["a"]["w"], p["a"]["d"]), (0, p["a"]["d"])):
                sx, sy = P(*world(p, x, y))
                xs.append(sx)
                ys.append(sy)
        o.append(f'<rect x="{min(xs) - 7:.1f}" y="{min(ys) - 7:.1f}" width="{max(xs) - min(xs) + 14:.1f}" height="{max(ys) - min(ys) + 14:.1f}" '
                 f'fill="{RED}" fill-opacity=".08" stroke="{RED}" stroke-width="2" stroke-dasharray="8 5"/>')
    # dimension chain along wall A
    ticks = sorted({0, W} | {round(p["s"]) for p in placements if p["run"]["kind"] == "wall" and p["run"]["wall"] == "A" and p["run"]["level"] == "floor"}
                   | {round(p["s"] + p["a"]["w"]) for p in placements if p["run"]["kind"] == "wall" and p["run"]["wall"] == "A" and p["run"]["level"] == "floor"})
    _, ty = P(0, D + wt + 300)
    o.append(f'<line x1="{P(0, 0)[0]:.1f}" y1="{ty:.1f}" x2="{P(W, 0)[0]:.1f}" y2="{ty:.1f}" stroke="{DIM}" stroke-width="1"/>')
    for t in ticks:
        tx = P(t, 0)[0]
        o.append(f'<line x1="{tx - 4:.1f}" y1="{ty + 4:.1f}" x2="{tx + 4:.1f}" y2="{ty - 4:.1f}" stroke="{DIM}" stroke-width="1.2"/>')

    # ---- elevation A (right)
    ke = 0.092
    ex0, ez0 = 640, py0 - plan_h / 2 + H * ke / 2   # screen position of (s=0, z=0), centred on the plan
    E = lambda s, z: (ex0 + s * ke, ez0 - z * ke)
    (rx0, ry0), (rx1, ry1) = E(0, H), E(W, 0)
    o.append(f'<rect x="{rx0:.1f}" y="{ry0:.1f}" width="{rx1 - rx0:.1f}" height="{ry1 - ry0:.1f}" fill="none" stroke="#2c353d" stroke-width="1"/>')
    elev = [p for p in placements if p["run"]["kind"] == "wall" and p["run"]["wall"] == "A"]
    floor = [p for p in elev if p["run"]["level"] == "floor"]
    if floor:
        s0 = min(p["s"] for p in floor)
        s1 = max(p["s"] + p["a"]["w"] for p in floor)
        (wx0, wy0), (wx1, wy1) = E(s0, 2200), E(s1, 100)
        o.append(f'<rect x="{wx0:.1f}" y="{wy0:.1f}" width="{wx1 - wx0:.1f}" height="{wy1 - wy0:.1f}" fill="#161c21" stroke="#2c353d" stroke-width="1"/>')
        (fx0, fy0), (fx1, _) = E(s0, 1470), E(s1, 1430)
        o.append(f'<rect x="{fx0:.1f}" y="{fy0:.1f}" width="{fx1 - fx0:.1f}" height="{40 * ke:.1f}" fill="#3a444d"/>')
    for p in elev:
        a = p["a"]
        plinth = 0 if a["cat"] == "wall" or p["z"] > 0 else min(100, a["h"])
        (ux, uy), (vx, vy) = E(p["s"], p["z"] + a["h"]), E(p["s"] + a["w"], p["z"] + plinth)
        o.append(f'<rect x="{ux:.1f}" y="{uy:.1f}" width="{vx - ux:.1f}" height="{vy - uy:.1f}" fill="{FRONT}" stroke="{LINE}" stroke-width="1.1"/>')
        for f in a["doors"] + a["drawers"]:
            (fa, fb), (fc, fd) = E(p["s"] + f["x"], p["z"] + f["z"] + f["h"]), E(p["s"] + f["x"] + f["w"], p["z"] + f["z"])
            o.append(f'<rect x="{fa + .8:.1f}" y="{fb + .8:.1f}" width="{max(0, fc - fa - 1.6):.1f}" height="{max(0, fd - fb - 1.6):.1f}" fill="none" stroke="{DIM}" stroke-width=".8"/>')
        if "worktop" in a["slots"]:
            (wa, wb), (wc, _) = E(p["s"] - 4, p["z"] + a["h"]), E(p["s"] + a["w"] + 4, 0)
            o.append(f'<rect x="{wa:.1f}" y="{wb - 1:.1f}" width="{wc - wa:.1f}" height="2.2" fill="{LINE}"/>')
        if p["func"] == "oven" and a["appliance"]:
            (oa, ob), (oc, od) = E(p["s"] + a["w"] * .08, p["z"] + a["h"] * .42 + min(600, a["h"] * .28)), E(p["s"] + a["w"] * .92, p["z"] + a["h"] * .42)
            o.append(f'<rect x="{oa:.1f}" y="{ob:.1f}" width="{oc - oa:.1f}" height="{od - ob:.1f}" rx="2" fill="#0b0e11" stroke="{DIM}" stroke-width=".8"/>')
    o.append(f'<line x1="{rx0 - 12:.1f}" y1="{ry1:.1f}" x2="{rx1 + 12:.1f}" y2="{ry1:.1f}" stroke="{LINE}" stroke-width="2"/>')
    ticks = sorted({0, W} | {round(p["s"]) for p in floor} | {round(p["s"] + p["a"]["w"]) for p in floor})
    dy = ry1 + 26
    o.append(f'<line x1="{rx0:.1f}" y1="{dy:.1f}" x2="{rx1:.1f}" y2="{dy:.1f}" stroke="{DIM}" stroke-width="1"/>')
    for t in ticks:
        tx = E(t, 0)[0]
        o.append(f'<line x1="{tx - 4:.1f}" y1="{dy + 4:.1f}" x2="{tx + 4:.1f}" y2="{dy - 4:.1f}" stroke="{DIM}" stroke-width="1.2"/>')
    o.append("</svg>")
    return "\n".join(o)


def write_thumb(work: Path, index):
    room, runs = parse_seed((work / "src" / "seed.ts").read_text(encoding="utf-8"))
    pl = layout(room, runs, index)
    if not pl:
        sys.exit("thumb: no units placed (seed.ts format changed?)")
    (OUT / "thumb.svg").write_text(thumb_svg(room, pl), encoding="utf-8", newline="\n")
    log(f"thumb.svg: {len(pl)} units")


# ---------------------------------------------------------------------------------------------- 8. checks
GENERIC = [re.compile(g, re.I) for g in (
    r"prices\.json", r"['\"`]/api/", r"['\"`]/projects/", r"/api/(render|status|save|shapes)", r"\bgemini\b", r"€", r"price group",
    r"list price", r"recommended retail", r"tel[- ]?aviv", r"\btlv\b", r"Family Cohen", r"לוח הפרויקט", r"תוכנית האדריכל", r"בדיקת צורות",
    r"תיק מטבח", r"\.pptx", r"since 19\d\d")]


def scan(files, patterns, root):
    hits = []
    for p in files:
        t = p.read_text(encoding="utf-8", errors="replace")
        for rx in patterns:
            m = rx.search(t)
            if m:   # print where, never the match itself
                hits.append(f"{p.relative_to(root)}: pattern #{patterns.index(rx)} at {m.start()}")
    return hits


def original_ids(private: Path):
    """The manufacturer's article codes and mesh part names (4+ letters/digits), to make sure none is published."""
    ids = {a["code"] for a in json.loads((private / "catalog" / "index.json").read_text(encoding="utf-8"))}
    for f in (private / "catalog" / "mesh").glob("*.json"):
        ids.update(p["name"] for p in json.loads(f.read_text(encoding="utf-8")).get("parts", []))
    return {i for i in ids if re.fullmatch(r"[0-9A-Z]{4,}", i) and not re.fullmatch(r"\d+", i)}


def scan_ids(files, ids, root):
    hits = []
    for p in files:
        t = p.read_text(encoding="utf-8", errors="replace")
        m = next((m for m in re.finditer(r"[0-9A-Z]{4,}", t) if m.group(0) in ids), None)
        if m:   # where, never the code itself
            hits.append(f"{p.relative_to(root)}: original article code or part name at {m.start()}")
    return hits


def check(terms, ids):
    out_files = [p for p in OUT.rglob("*") if p.is_file()]
    meshes = [p for p in out_files if "mesh" in p.parts]
    pages = [p for p in out_files if "mesh" not in p.parts]
    tools = [p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    names = terms["check"]
    hits = scan(pages, names + [TOKEN] + GENERIC, SITE) + scan(meshes, names + [TOKEN], SITE)
    hits += scan(tools, names, SITE)            # the tools carry tokens, never names
    hits += scan_ids(out_files + tools, ids, SITE)
    skip = {".git", "dist", "node_modules", "__pycache__"}
    others = [p for p in SITE.rglob("*") if p.is_file() and not skip & set(p.relative_to(SITE).parts)
              and OUT not in p.parents and HERE not in p.parents and p.suffix.lower() in TEXT_EXT | {".xml", ".txt", ".webmanifest"}]
    hits += scan(others, terms["site"], SITE)   # the rest of the site must not name the manufacturer either
    if (OUT / "catalog" / "prices.json").exists():
        hits.append("catalog/prices.json present")
    if hits:
        print("\n".join(hits))
        sys.exit(f"check failed: {len(hits)} hit(s)")
    log(f"check ok: {len(out_files)} output files ({len(meshes)} meshes), {len(tools)} tool files and {len(others)} other site files; "
        f"{len(names)} name patterns, tokens, {len(GENERIC)} price/API patterns and {len(ids)} original codes/part names not found")


def report():
    files = [p for p in OUT.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    mesh = [p for p in files if "mesh" in p.parts]
    log(f"output: {OUT} - {len(files)} files - {size / 1e6:.1f} MB (meshes: {len(mesh)} files, {sum(p.stat().st_size for p in mesh) / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=os.environ.get("KITCHENS_REPO", str(SITE.parent / "kitchens")), help="kitchens git repo (read only)")
    ap.add_argument("--rev", default="HEAD", help="commit to build (default: HEAD, the last committed state)")
    ap.add_argument("--work", default=str(Path(tempfile.gettempdir()) / "kitchens-demo-build" / "app"), help="build folder outside both repos")
    ap.add_argument("--skip-install", action="store_true", help="do not run npm ci")
    ap.add_argument("--base", metavar="DIR", help="only write the tokenized patch base (steps 1-4) to DIR, as a git repo")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    work = Path(args.base or args.work).resolve()
    private = work.with_name(work.name + "-data")
    if not (repo / "app" / "package.json").exists():
        sys.exit(f"kitchens repo not found: {repo}")
    if SITE in work.parents or repo in work.parents or work in (SITE, repo):
        sys.exit("the work folder must be outside both repos")
    if args.base and work.exists() and any(p.name != "node_modules" for p in work.iterdir()) and not (work / ".git").exists():
        sys.exit(f"{work} is not empty")
    export_source(repo, args.rev, work, private)
    terms = private_terms(repo, args.rev, work, private)
    prepare_source(work, terms)
    if args.base:
        run("git init -q && git config core.autocrlf false && git add -A && git -c user.name=demo -c user.email=demo@localhost commit -qm base", cwd=work)
        log(f"patch base ready: {work}")
        return
    apply_demo(work)
    cmap = generic_codes(private)
    recode_source(work, cmap)
    index = prepare_data(private, work, cmap)
    dist = install_and_build(work, args.skip_install)
    site_head(dist / "index.html")
    publish(dist, private, cmap)
    write_thumb(work, index)
    check(terms, original_ids(private))
    report()


if __name__ == "__main__":
    main()
