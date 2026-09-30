"""Static site generator for pro-algorithm.co.il.

Reads src/*.html fragments and data/*.json, writes a complete static site to dist/.
URLs mirror the previous Base44 site (/About, /Blog, /BlogPostPage?slug=...) so search
engines see the same addresses.

Run: python tools/build.py
"""
import html
import json
import os
import re
import shutil
import urllib.parse
from datetime import date, datetime

import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
DATA = os.path.join(ROOT, "data")
DIST = os.path.join(ROOT, "dist")
SITE = "https://www.pro-algorithm.co.il"
TODAY = date.today().isoformat()

ORG = {
    "name": "Pro Algorithm",
    "name_he": "פרו אלגוריתם",
    "email": "info@pro-algorithm.co.il",
    "phone": "053-946-2842",
    "phone_intl": "+972539462842",
    "office_phone_intl": "+972-72-393-5596",
    "whatsapp": "https://wa.me/972539462842",
    "youtube": "https://www.youtube.com/@ProAlgorithm-israel",
    "social": {
        "facebook": "https://www.facebook.com/people/%D7%A4%D7%A8%D7%95-%D7%90%D7%9C%D7%92%D7%95%D7%A8%D7%99%D7%AA%D7%9D/61579382173682/",
        "instagram": "https://www.instagram.com/pro.algorithm/",
        "linkedin": "https://www.linkedin.com/company/pro-algorithm",
        "tiktok": "https://www.tiktok.com/@pro.algorithm",
        "youtube": "https://www.youtube.com/@ProAlgorithm-israel",
    },
}

TRACKING = {
    "gtm": "GTM-M6R6J2RX",
    "ga4": "G-55V8GB74X0",
    "ads": "AW-17743261966",
    "fb_pixel": "2695574117489883",
    "hotjar": 6744701,
}

KEYWORDS = "בית תוכנה, פיתוח אפליקציות, פיתוח תוכנה, בית תוכנה ישראלי, פיתוח אפליקציות לעסקים, חברת פיתוח תוכנה, AI, אוטומציה, פיתוח מערכת SaaS, BIM, Revit, AutoCAD, בינה מלאכותית לבנייה"

CATS = {
    "ai": ("בינה מלאכותית ולמידת מכונה", "AI & Machine Learning"),
    "algorithms": ("אלגוריתמים", "Algorithms"),
    "web-development": ("פיתוח ווב", "Web Development"),
    "technology": ("טכנולוגיה", "Technology"),
}

HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]
EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

FAQ = [
    ("כמה עולה לפתח אפליקציה?",
     "מחיר פיתוח אפליקציה נע בין 50,000 ל-500,000 ש״ח, תלוי במורכבות, פלטפורמות (iOS/Android), עיצוב ותכונות נדרשות. אנו מציעים הצעת מחיר מותאמת אישית לכל פרויקט.",
     "How much does it cost to develop an app?",
     "App development costs range from $15,000 to $150,000, depending on complexity, platforms (iOS/Android), design and required features. We offer a tailored quote for every project."),
    ("כמה זמן לוקח לפתח אפליקציה?",
     "פיתוח אפליקציה בסיסית לוקח 2-3 חודשים, אפליקציה בינונית 3-6 חודשים, ואפליקציה מורכבת 6-12 חודשים. אנו עובדים בשיטת Agile עם עדכונים שוטפים.",
     "How long does it take to develop an app?",
     "A basic app takes 2-3 months, a medium app 3-6 months, and a complex app 6-12 months. We work in Agile with regular updates."),
    ("איך בוחרים בית תוכנה לפיתוח?",
     "חשוב לבדוק ניסיון קודם, פורטפוליו, תקשורת, מומחיות בתחום שלכם, ותמיכה לאחר השקה. אנו מציעים פגישת ייעוץ חינם להתאמת הפתרון המושלם עבורכם.",
     "How do you choose a software house?",
     "Check previous experience, portfolio, communication, expertise in your field and post-launch support. We offer a free consultation to find the right solution for you."),
    ("האם אתם מפתחים גם מערכות SaaS?",
     "כן. אנו מתמחים בפיתוח מערכות SaaS בהתאמה אישית לעסקים: מערכות ענן עם מודל מנויים, סקלביליות גבוהה ותמיכה מלאה.",
     "Do you also develop SaaS systems?",
     "Yes. We specialize in custom SaaS development: cloud systems with subscription models, high scalability and full support."),
    ("מה כולל שירות פיתוח התוכנה שלכם?",
     "השירות כולל איפיון מלא, עיצוב UX/UI, פיתוח Frontend ו-Backend, בדיקות QA, השקה, ותמיכה ותחזוקה שוטפת. הכל תחת קורת גג אחת.",
     "What does your software development service include?",
     "Full specification, UX/UI design, frontend and backend development, QA, launch, and ongoing support and maintenance. All under one roof."),
    ("האם אתם עובדים עם עסקים קטנים?",
     "בהחלט. אנו עובדים עם עסקים בכל גודל, מסטארטאפים ועד ארגונים גדולים, עם פתרונות מותאמים לכל תקציב.",
     "Do you work with small businesses?",
     "Absolutely. We work with businesses of every size, from startups to large enterprises, with solutions for every budget."),
    ("במה אתם שונים מבתי תוכנה אחרים?",
     "מעבר לפיתוח מערכות לארגונים, יש לנו מומחיות עומק בעולמות התכנון, השרטוט וה-BIM: מודלי GNN לתכנון פנים, אוטומציה ל-Revit ו-AutoCAD ומוצרים ייעודיים לענף הבנייה.",
     "What makes you different from other software houses?",
     "Beyond enterprise systems, we have deep expertise in planning, drafting and BIM: GNN models for interior planning, Revit and AutoCAD automation, and dedicated products for the construction industry."),
]


# ---------------------------------------------------------------- helpers

def esc(s):
    return html.escape(s or "", quote=True)


def load(name):
    with open(os.path.join(DATA, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def read_src(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def write(rel, content):
    path = os.path.join(DIST, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def img(rel):
    return f"/assets/img/{rel}" if rel else "/assets/img/brand/og.jpg"


def fmt_date(iso, lang="he"):
    if not iso:
        return ""
    d = datetime.fromisoformat(iso[:10])
    if lang == "he":
        return f"{d.day} ב{HE_MONTHS[d.month - 1]} {d.year}"
    return f"{EN_MONTHS[d.month - 1]} {d.day}, {d.year}"


def en(text):
    """data-en attribute: the English replacement swapped in by main.js."""
    return f' data-en="{esc(text)}"' if text else ""


def post_url(p, lang="he"):
    slug = p["slug_he"] if lang == "he" and p["slug_he"] else (p["slug_en"] or p["slug_he"])
    return f"/BlogPostPage?slug={urllib.parse.quote(slug)}"


def post_file(p):
    return f"/blog/{p['id']}"


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "</script>"


def md(text, drop_title=None):
    text = (text or "").replace("\r\n", "\n").strip()
    lines = text.split("\n")
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    out = markdown.markdown("\n".join(lines), extensions=["tables", "fenced_code", "sane_lists"])
    # headings: the page already has the H1
    out = re.sub(r"<h1>(.*?)</h1>", r"<h2>\1</h2>", out)
    out = re.sub(r'<a href="(https?://[^"]+)">', r'<a href="\1" target="_blank" rel="noopener">', out)
    out = out.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    return out


def meta_desc(p):
    """Search snippet: the excerpt, or the article's opening when the excerpt is too thin."""
    ex = (p.get("excerpt_he") or "").strip()
    if len(ex) >= 90:
        return ex
    body = re.sub(r"^#.*$", "", p.get("content_he") or "", flags=re.M)
    body = re.sub(r"[*_`>|]|\[([^\]]+)\]\([^)]+\)", r"\1", body)
    body = " ".join(body.split())
    text = (ex + " " + body).strip() if ex and not body.startswith(ex) else body
    if len(text) <= 158:
        return text
    cut = text[:155].rsplit(" ", 1)[0]
    return cut.rstrip(",.:;") + "…"


def read_minutes(text):
    words = len(re.findall(r"\S+", text or ""))
    return max(1, round(words / 200))


# ---------------------------------------------------------------- layout

NAV = [
    ("/Expertise", "nav.expertise", "מומחיות"),
    ("/#construction", "nav.construction", "בנייה ותכנון"),
    ("/Products", "nav.products", "מוצרים"),
    ("/Blog", "nav.blog", "בלוג"),
    ("/Podcast", "nav.podcast", "פודקאסט"),
    ("/About", "nav.about", "אודות"),
]


def tracking_head():
    t = TRACKING
    return f"""
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}})(window,document,'script','dataLayer','{t['gtm']}');</script>
  <!-- Google tag (GA4 + Ads) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={t['ga4']}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','{t['ga4']}');gtag('config','{t['ads']}');</script>
  <!-- Meta Pixel -->
  <script>!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','{t['fb_pixel']}');fbq('track','PageView');</script>
  <!-- Hotjar -->
  <script>(function(h,o,t,j,a,r){{h.hj=h.hj||function(){{(h.hj.q=h.hj.q||[]).push(arguments)}};h._hjSettings={{hjid:{t['hotjar']},hjsv:6}};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);}})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');</script>"""


def tracking_body():
    t = TRACKING
    return f"""<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={t['gtm']}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id={t['fb_pixel']}&amp;ev=PageView&amp;noscript=1"></noscript>"""


def org_schema():
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": f"{SITE}/#organization",
                "name": "Pro Algorithm - בית תוכנה",
                "alternateName": ["פרו אלגוריתם", "Pro Algorithm"],
                "url": SITE,
                "logo": f"{SITE}/assets/img/brand/icon-512.png",
                "image": f"{SITE}/assets/img/brand/og.jpg",
                "description": "בית תוכנה ישראלי לפיתוח תוכנה, אפליקציות ומערכות AI לארגונים, עם מומחיות עומק בתכנון, בנייה ואדריכלות.",
                "email": ORG["email"],
                "telephone": ORG["office_phone_intl"],
                "address": {"@type": "PostalAddress", "addressCountry": "IL"},
                "contactPoint": [{
                    "@type": "ContactPoint", "telephone": ORG["phone_intl"], "email": ORG["email"],
                    "contactType": "sales", "areaServed": "IL", "availableLanguage": ["Hebrew", "English"],
                }],
                "sameAs": list(ORG["social"].values()) + ["https://www.buildalgo.co.il/", "https://www.pro-algo.com/"],
                "founder": [{"@type": "Person", "name": "נועד ג'ורנו", "jobTitle": "CEO"},
                            {"@type": "Person", "name": "צח דבוש", "jobTitle": "CTO", "url": "https://tzach-dabush.com/"}],
            },
            {
                "@type": "ProfessionalService",
                "@id": f"{SITE}/#business",
                "name": "Pro Algorithm",
                "image": f"{SITE}/assets/img/brand/og.jpg",
                "url": SITE,
                "telephone": ORG["office_phone_intl"],
                "email": ORG["email"],
                "priceRange": "$$",
                "address": {"@type": "PostalAddress", "addressCountry": "IL"},
                "openingHoursSpecification": [{
                    "@type": "OpeningHoursSpecification",
                    "dayOfWeek": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
                    "opens": "09:00", "closes": "18:00",
                }],
                "parentOrganization": {"@id": f"{SITE}/#organization"},
            },
            {
                "@type": "WebSite",
                "@id": f"{SITE}/#website",
                "name": "Pro Algorithm",
                "url": SITE,
                "inLanguage": "he-IL",
                "publisher": {"@id": f"{SITE}/#organization"},
            },
        ],
    }


def breadcrumb(items):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": SITE + url}
            for i, (name, url) in enumerate(items)
        ],
    }


def header(current):
    links = []
    for href, key, label in NAV:
        cur = ' aria-current="page"' if href == current else ""
        links.append(f'<a href="{href}" data-i18n="{key}"{cur}>{label}</a>')
    return f"""<header class="header" id="top">
    <div class="wrap header__bar">
      <a class="logo" href="/" aria-label="Pro Algorithm, דף הבית">
        <img src="/assets/img/brand/logo-white-480.png" alt="Pro Algorithm" width="180" height="22">
      </a>
      <nav class="nav" id="nav" aria-label="ראשי" data-i18n-attr="aria-label:nav.label">
        {''.join(links)}
        <a class="nav__cta" href="/Contact" data-i18n="nav.contact">צור קשר</a>
      </nav>
      <div class="header__actions">
        <button class="lang" type="button" data-lang-toggle aria-label="Switch to English">EN</button>
        <a class="btn btn--primary btn--sm" href="/Contact" data-i18n="cta.talk">דברו איתנו</a>
        <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav" aria-label="תפריט" data-i18n-attr="aria-label:nav.menu"><i class="ph ph-list" aria-hidden="true"></i></button>
      </div>
    </div>
  </header>"""


QUICK_LINKS = [
    ("פיתוח תוכנה", "Software Development", "/Contact"),
    ("פיתוח אפליקציות", "App Development", "/Contact"),
    ("בינה מלאכותית", "Artificial Intelligence", "/BlogPostPage?slug=" + urllib.parse.quote("בינה-מלאכותית-לעסקים-2024")),
    ("אוטומציה לעסקים", "Business Automation", "/BlogPostPage?slug=" + urllib.parse.quote("אוטומציה-לעסקים-2025")),
    ("נדל\"ן", "Real Estate", "https://www.buildalgo.co.il/"),
    ("בנייה ואדריכלות", "Construction & Architecture", "https://www.buildalgo.co.il/"),
    ("SaaS", "SaaS", "/BlogPostPage?slug=" + urllib.parse.quote("פיתוח-saas-2025")),
    ("MVP", "MVP", "/BlogPostPage?slug=" + urllib.parse.quote("פיתוח-mvp-2025")),
    ("אבטחת מידע", "Information Security", "/BlogPostPage?slug=" + urllib.parse.quote("אבטחת-מידע-2025")),
    ("פיתוח אתרים", "Website Development", "/BlogPostPage?slug=" + urllib.parse.quote("פיתוח-אתרים-2025-מדריך-מקיף")),
    ("CRM", "CRM Systems", "/BlogPostPage?slug=" + urllib.parse.quote("מערכות-crm-2025")),
    ("pro-algo", "pro-algo", "https://www.pro-algo.com/"),
    ("CNN ורשתות נוירונים", "CNN & Neural Networks", "https://tzach-dabush.com/"),
    ("NLP", "NLP", "https://tzach-dabush.com/"),
    ("בית תוכנה", "Software House", "/About"),
    ("פודקאסט טכנולוגיה", "Tech Podcast", "/Podcast"),
]


def footer():
    ql = []
    for he, en_, href in QUICK_LINKS:
        ext = ' target="_blank" rel="noopener"' if href.startswith("http") else ""
        ql.append(f'<li><a href="{href}"{ext}{en(en_)}>{esc(he)}</a></li>')
    s = ORG["social"]
    social = "".join(
        f'<a href="{s[k]}" target="_blank" rel="noopener" aria-label="{label}"><i class="ph ph-{icon}" aria-hidden="true"></i></a>'
        for k, label, icon in [("linkedin", "LinkedIn", "linkedin-logo"), ("facebook", "Facebook", "facebook-logo"),
                               ("instagram", "Instagram", "instagram-logo"), ("youtube", "YouTube", "youtube-logo"),
                               ("tiktok", "TikTok", "tiktok-logo")]
    )
    return f"""<footer class="footer">
    <div class="wrap">
      <div class="footer__grid">
        <div class="footer__brand">
          <img src="/assets/img/brand/logo-white-480.png" alt="Pro Algorithm" width="160" height="20" loading="lazy" style="height:20px;width:auto">
          <p data-i18n="foot.about">קבוצת טכנולוגיה ישראלית לפיתוח תוכנה, AI ומוצרים לעולמות התכנון, הבנייה והארגונים.</p>
          <div class="footer__social">{social}</div>
        </div>
        <div>
          <h2 class="footer__h" data-i18n="foot.company">החברה</h2>
          <ul>
            <li><a href="/About" data-i18n="nav.about">אודות</a></li>
            <li><a href="/Expertise" data-i18n="nav.expertise">מומחיות</a></li>
            <li><a href="/Blog" data-i18n="nav.blog">בלוג</a></li>
            <li><a href="/Podcast" data-i18n="nav.podcast">פודקאסט</a></li>
            <li><a href="/Contact" data-i18n="nav.contact">צור קשר</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer__h" data-i18n="foot.products">מוצרים</h2>
          <ul>
            <li><a href="/Products#agent">Pro Agent</a></li>
            <li><a href="/Products#mcp">AutoCAD MCP</a></li>
            <li><a href="/Products#superposition">Superposition</a></li>
            <li><a href="/Products#boq">BOQ</a></li>
            <li><a href="/Products#sign">Pro Sign</a></li>
            <li><a href="/Products#time">Pro Time</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer__h" data-i18n="foot.contact">יצירת קשר</h2>
          <ul>
            <li><a class="ltr" href="mailto:{ORG['email']}">{ORG['email']}</a></li>
            <li><a class="ltr" href="tel:{ORG['phone_intl']}">{ORG['phone']}</a></li>
            <li><a href="{ORG['whatsapp']}" target="_blank" rel="noopener" data-i18n="contact.wa">שיחה בוואטסאפ</a></li>
          </ul>
          <h2 class="footer__h footer__h--gap" data-i18n="foot.sites">האתרים שלנו</h2>
          <ul>
            <li><a href="https://www.buildalgo.co.il/" target="_blank" rel="noopener">buildalgo.co.il</a></li>
            <li><a href="https://www.pro-algo.com/" target="_blank" rel="noopener">pro-algo.com</a></li>
            <li><a href="https://tzach-dabush.com/" target="_blank" rel="noopener">tzach-dabush.com</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__quick">
        <h2 class="footer__h" data-i18n="foot.quick">קישורים מהירים</h2>
        <ul>{''.join(ql)}</ul>
      </div>
      <div class="footer__bottom">
        <span data-i18n="foot.rights">© {date.today().year} Pro Algorithm. כל הזכויות שמורות.</span>
        <a href="/AccessibilityStatement" data-i18n="foot.a11y">הצהרת נגישות</a>
      </div>
    </div>
  </footer>"""


def floating():
    return f"""<a class="fab fab--wa" href="{ORG['whatsapp']}" target="_blank" rel="noopener" aria-label="וואטסאפ" data-track="whatsapp"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i></a>
  <button class="fab fab--a11y" type="button" data-a11y-toggle aria-expanded="false" aria-controls="a11y" aria-label="תפריט נגישות" data-i18n-attr="aria-label:a11y.title"><i class="ph ph-person-arms-spread" aria-hidden="true"></i></button>
  <div class="a11y" id="a11y" role="dialog" aria-label="תפריט נגישות" hidden>
    <div class="a11y__head"><strong data-i18n="a11y.title">תפריט נגישות</strong><button type="button" class="a11y__close" data-a11y-close aria-label="סגירה"><i class="ph ph-x" aria-hidden="true"></i></button></div>
    <div class="a11y__row"><span data-i18n="a11y.size">גודל טקסט</span><div class="a11y__steps"><button type="button" data-a11y="font-down" aria-label="הקטנת טקסט">A-</button><button type="button" data-a11y="font-up" aria-label="הגדלת טקסט">A+</button></div></div>
    <button type="button" class="a11y__opt" data-a11y="contrast" aria-pressed="false" data-i18n="a11y.contrast">ניגודיות גבוהה</button>
    <button type="button" class="a11y__opt" data-a11y="links" aria-pressed="false" data-i18n="a11y.links">הדגשת קישורים</button>
    <button type="button" class="a11y__opt" data-a11y="readable" aria-pressed="false" data-i18n="a11y.font">גופן קריא</button>
    <button type="button" class="a11y__opt" data-a11y="motion" aria-pressed="false" data-i18n="a11y.motion">עצירת אנימציות</button>
    <button type="button" class="a11y__reset" data-a11y="reset" data-i18n="a11y.reset">איפוס הגדרות</button>
    <a class="a11y__link" href="/AccessibilityStatement" data-i18n="foot.a11y">הצהרת נגישות</a>
  </div>"""


def page(path, *, title, desc, body, title_en, desc_en="", nav=None, og_image=None, og_type="website",
         schemas=(), canonical=None, keywords=KEYWORDS, extra_head="", robots="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"):
    canonical = canonical or (SITE + (path if path != "/" else ""))
    og_image = og_image or f"{SITE}/assets/img/brand/og.jpg"
    schema_tags = "\n  ".join(ld(s) for s in [org_schema(), *schemas])
    return f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="keywords" content="{esc(keywords)}">
  <meta name="robots" content="{robots}">
  <meta name="title-en" content="{esc(title_en)}">
  {f'<link rel="canonical" href="{esc(canonical)}">' if path != "/404" else ""}
  <meta name="theme-color" content="#0a0c0f">
  <meta name="geo.region" content="IL">
  <meta name="geo.placename" content="Israel">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Pro Algorithm">
  <meta property="og:type" content="{og_type}">
  <meta property="og:site_name" content="Pro Algorithm - בית תוכנה">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:image" content="{esc(og_image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="he_IL">
  <meta property="og:locale:alternate" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@proalgorithm">
  <meta name="twitter:creator" content="@proalgorithm">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(og_image)}">
  <meta name="twitter:url" content="{esc(canonical)}">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/brand/icon-32.png">
  <link rel="apple-touch-icon" href="/assets/img/brand/icon-180.png">
  <link rel="manifest" href="/manifest.json">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&amp;family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600&amp;family=IBM+Plex+Sans:wght@300;400;500;600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/regular/style.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  {extra_head}
  {schema_tags}
  {tracking_head()}
</head>
<body>
  {tracking_body()}
  <a class="skip" href="#main" data-i18n="skip">דלגו לתוכן</a>

  {header(nav)}

  <main id="main">
{body}
  </main>

  {footer()}

  {floating()}

  <script src="/assets/js/i18n.js" defer></script>
  <script src="/assets/js/main.js" defer></script>
</body>
</html>
"""


# ---------------------------------------------------------------- shared blocks

def contact_form(source):
    return f"""<form class="form reveal" name="contact" method="POST" action="/Contact?sent=1" data-netlify="true" netlify-honeypot="bot-field" data-form novalidate>
          <input type="hidden" name="form-name" value="contact">
          <input type="hidden" name="source" value="{source}">
          <p class="hp" aria-hidden="true"><label>Leave empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
          <div class="field">
            <label for="f-name-{source}" data-i18n="form.name">שם מלא</label>
            <input id="f-name-{source}" name="name" autocomplete="name" required>
            <span class="err" data-err="name"></span>
          </div>
          <div class="field">
            <label for="f-company-{source}" data-i18n="form.company">ארגון</label>
            <input id="f-company-{source}" name="company" autocomplete="organization">
          </div>
          <div class="field">
            <label for="f-email-{source}" data-i18n="form.email">אימייל</label>
            <input id="f-email-{source}" name="email" type="email" autocomplete="email" required dir="ltr">
            <span class="err" data-err="email"></span>
          </div>
          <div class="field">
            <label for="f-phone-{source}" data-i18n="form.phone">טלפון</label>
            <input id="f-phone-{source}" name="phone" type="tel" autocomplete="tel" dir="ltr">
          </div>
          <div class="field field--full">
            <label for="f-topic-{source}" data-i18n="form.topic">תחום הפנייה</label>
            <select id="f-topic-{source}" name="topic">
              <option data-i18n="form.t1">טכנולוגיה לבנייה ואדריכלות</option>
              <option data-i18n="form.t2">מוצרי Pro Algorithm</option>
              <option data-i18n="form.t3">פיתוח מערכת לארגון</option>
              <option data-i18n="form.t4">הטמעת AI</option>
              <option data-i18n="form.t5">צוותי פיתוח ומומחים</option>
            </select>
          </div>
          <div class="field field--full">
            <label for="f-msg-{source}" data-i18n="form.msg">על מה נדבר?</label>
            <textarea id="f-msg-{source}" name="message"></textarea>
          </div>
          <div class="form__foot">
            <button class="btn btn--primary" type="submit"><span data-i18n="form.send">שליחת פנייה</span><i class="ph ph-arrow-left" aria-hidden="true"></i></button>
            <span class="form__status" data-status role="status" aria-live="polite"></span>
            <span class="form__note" data-i18n="form.note">נחזור אליכם תוך יום עסקים אחד.</span>
          </div>
        </form>"""


def contact_info():
    return f"""<div class="contact__info">
            <a href="mailto:{ORG['email']}" data-track="email"><i class="ph ph-envelope-simple" aria-hidden="true"></i><span class="ltr">{ORG['email']}</span></a>
            <a href="tel:{ORG['phone_intl']}" data-track="phone"><i class="ph ph-phone" aria-hidden="true"></i><span class="ltr">{ORG['phone']}</span></a>
            <a href="{ORG['whatsapp']}" target="_blank" rel="noopener" data-track="whatsapp"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i><span data-i18n="contact.wa">שיחה בוואטסאפ</span></a>
          </div>"""


def client_wall(clients, heading=True):
    items = "".join(
        f'<li><img src="{img(c["image"])}" alt="{esc(c["name_he"])}" loading="lazy" decoding="async" width="180" height="80"></li>'
        for c in clients if c.get("image")
    )
    head = '<h2 class="clients__label" data-i18n="clients.title">ארגונים שבוחרים לעבוד איתנו</h2>' if heading else ""
    return f"""<section class="clients" aria-label="לקוחות" data-i18n-attr="aria-label:clients.label">
      <div class="wrap">
        {head}
        <ul class="logo-wall">{items}</ul>
      </div>
    </section>"""


def press_block(press):
    cards = "".join(f"""
          <li><a class="press-card" href="{esc(p['url'])}" target="_blank" rel="noopener">
            <span class="press-card__logo"><img src="{img(p['logo'])}" alt="{esc(p['outlet'])}" loading="lazy" width="120" height="40"></span>
            <span class="press-card__title">{esc(p['title'])}</span>
            <span class="press-card__body">{esc(p['body'])}</span>
            <span class="press-card__more"><span data-i18n="press.read">לכתבה המלאה</span><i class="ph ph-arrow-up-left" aria-hidden="true"></i></span>
          </a></li>""" for p in press)
    return f"""<section class="section section--tight" id="press">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="press.title">AI בעולם האדריכלות, <span class="thin">בכלי התקשורת המובילים.</span></h2>
          <p data-i18n="press.lead">{len(press)} כתבות בגלובס, כלכליסט, ynet, mako, וואלה ומרכז הנדל"ן על הטכנולוגיה שאנחנו מפתחים ועל עתיד הנדל"ן.</p>
        </div>
        <ul class="press-grid reveal">{cards}
        </ul>
      </div>
    </section>"""


def episode_card(p, big=False):
    t_en = p.get("title_en") or ""
    d_en = p.get("desc_en") or ""
    date_he = fmt_date(p.get("date"))
    meta = " · ".join(x for x in [date_he, p.get("duration") or ""] if x)
    kind = "short" if p.get("short") else "full"
    return f"""<article class="ep{' ep--big' if big else ''}" data-track-cat="{p['track']}">
            <button class="ep__media" type="button" data-yt="{p['id']}" data-short="{str(p.get('short')).lower()}" aria-label="ניגון: {esc(p['title_he'])}">
              <img src="{img(p.get('thumb'))}" alt="" loading="lazy" decoding="async" width="640" height="360">
              <span class="ep__play"><i class="ph ph-play" aria-hidden="true"></i></span>
              <span class="ep__kind" data-i18n="pod.{kind}">{'קצר' if kind == 'short' else 'פרק מלא'}</span>
            </button>
            <div class="ep__body">
              <h3{en(t_en)}>{esc(p['title_he'])}</h3>
              <p{en(d_en)}>{esc(p.get('desc_he'))}</p>
              <div class="ep__meta">{esc(meta)}</div>
            </div>
          </article>"""


def podcast_teaser(pods):
    full = [p for p in pods if not p.get("short")][:1]
    rest = [p for p in pods if p not in full][:3]
    return f"""<section class="section section--tight" id="podcast">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="pod.title">מדברים אלגוריתמים, <span class="thin">בטון ועסקים.</span></h2>
          <p data-i18n="pod.lead">שיחות עומק עם מנהלי הנדסה, אדריכלים, יועצים ומפתחי AI, על המקום שבו הטכנולוגיה פוגשת את העולם האמיתי.</p>
        </div>
        <div class="pod-feature reveal">
          {''.join(episode_card(p, big=True) for p in full)}
          <div class="pod-list">{''.join(episode_card(p) for p in rest)}</div>
        </div>
        <div class="section__more reveal"><a class="btn btn--ghost" href="/Podcast"><span data-i18n="pod.all">לכל הפרקים</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a></div>
      </div>
    </section>"""


def post_card(p):
    cat_he, cat_en = CATS.get(p["category"], CATS["technology"])
    return f"""<article class="post-card" data-cat="{p['category']}">
            <a href="{post_url(p)}" class="post-card__link">
              <span class="post-card__img"><img src="{img(p.get('image'))}" alt="{esc(p.get('image_alt_he') or p['title_he'])}" loading="lazy" decoding="async" width="1200" height="675"></span>
              <span class="post-card__meta"><span{en(cat_en)}>{esc(cat_he)}</span><time datetime="{(p['created'] or '')[:10]}"{en(fmt_date(p['created'], 'en'))}>{fmt_date(p['created'])}</time></span>
              <span class="post-card__title"{en(p['title_en'])}>{esc(p['title_he'])}</span>
              <span class="post-card__excerpt"{en(p['excerpt_en'])}>{esc(p['excerpt_he'])}</span>
            </a>
          </article>"""


def posts_teaser(posts):
    return f"""<section class="section section--tight" id="blog">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="blog.title">ידע שנבנה <span class="thin">בשטח.</span></h2>
          <p data-i18n="blog.lead">מדריכים, תובנות ומחקר על AI, אלגוריתמים, פיתוח מערכות וטכנולוגיה לענף הבנייה.</p>
        </div>
        <div class="post-grid reveal">{''.join(post_card(p) for p in posts[:3])}</div>
        <div class="section__more reveal"><a class="btn btn--ghost" href="/Blog"><span data-i18n="blog.all">לכל המאמרים</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a></div>
      </div>
    </section>"""





UNITS = [
    ("code", "unit.rnd", "מחקר ופיתוח", "Research & Development",
     "צוותי Full-Stack ו-Backend שבונים מערכות ענן, SaaS ואפליקציות Web בסטנדרט ארגוני.",
     "Full-stack and backend teams building cloud, SaaS and web systems to enterprise standards.",
     ["React", "Node.js", "Cloud", "DevOps"]),
    ("cpu", "unit.ai", "AI ומדעי הנתונים", "AI & Data Science",
     "חוקרים ומפתחים בתחומי רשתות נוירונים, GNN, NLP ולמידת מכונה, מהמחקר ועד מודל בייצור.",
     "Researchers and engineers in neural networks, GNN, NLP and machine learning, from research to production.",
     ["GNN", "NLP", "ML", "Automation"]),
    ("buildings", "unit.bim", "BIM וטכנולוגיה לבנייה", "BIM & Construction Tech",
     "מומחי Revit, AutoCAD, Dynamo ו-Grasshopper שמפתחים תוספים, אוטומציות ומוצרים לענף התכנון.",
     "Revit, AutoCAD, Dynamo and Grasshopper specialists building add-ins, automation and products for planning.",
     ["Revit", "AutoCAD", "Dynamo", "IFC"]),
    ("handshake", "unit.cs", "הצלחת לקוחות", "Customer Success",
     "ניהול קשרי לקוחות אסטרטגיים וליווי צמוד לאורך כל חיי הפרויקט, מהאפיון ועד התפעול השוטף.",
     "Strategic account management and close support across the project lifecycle, from specification to operations.",
     ["Account management", "Delivery"]),
    ("chart-line-up", "unit.sales", "מכירות ופיתוח עסקי", "Sales & Business Development",
     "בניית שותפויות עם ארגונים, רשויות וחברות בנייה, והתאמת הפתרון הנכון לכל לקוח.",
     "Building partnerships with enterprises, public bodies and construction firms, and matching the right solution to each.",
     ["Enterprise", "Public sector"]),
    ("gear-six", "unit.ops", "תפעול וכספים", "Operations & Finance",
     "תיאום מערכי עבודה, תהליכי תפעול וניהול כספי מקצה לקצה, שמאפשרים לקבוצה לגדול בביטחון.",
     "Workflow coordination, operations and end-to-end financial management that let the group scale with confidence.",
     ["Operations", "Finance"]),
]

LEADERS = ("noad", "tzach")


def leader_line(t, big=False):
    bio = f'<p{en(t["bio_en"])}>{esc(t["bio_he"])}</p>' if big else ""
    return f"""<article class="leader-t{' leader-t--big' if big else ''} reveal">
            <img class="leader-t__img" src="{img(t['image'])}" alt="{esc(t['name_he'])}, {esc(t['role'])}" width="720" height="720" loading="lazy" decoding="async">
            <div class="leader-t__body">
              <div class="leader-t__role">{esc(t['role'])}</div>
              <h3{en(t['name_en'])}>{esc(t['name_he'])}</h3>
              {bio}
            </div>
          </article>"""


def units_grid():
    cells = []
    for icon, key, he, en_, p_he, p_en, tags in UNITS:
        tg = "".join(f"<li>{esc(x)}</li>" for x in tags)
        cells.append(f"""<article class="unit reveal">
            <i class="ph ph-{icon}" aria-hidden="true"></i>
            <h3{en(en_)}>{esc(he)}</h3>
            <p{en(p_en)}>{esc(p_he)}</p>
            <ul class="unit__tags">{tg}</ul>
          </article>""")
    return f'<div class="units">{"".join(cells)}</div>'


def org_block(team):
    lead = [t for t in team if t["key"] in LEADERS]
    return f"""<section class="section" id="leadership">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="org.title">ארגון אחד. <span class="thin">שש דיסציפלינות.</span></h2>
          <p data-i18n="org.lead">מהנדסים, חוקרי AI, מומחי BIM ואנשי תפעול, שמנוהלים כמו ארגון ופועלים במהירות של צוות מיוחד.</p>
        </div>
        <div class="leaders-t">{''.join(leader_line(t) for t in lead)}</div>
        {units_grid()}
        <div class="section__more reveal"><a class="btn btn--ghost" href="/About"><span data-i18n="org.more">על החברה</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a></div>
      </div>
    </section>"""


def faq_block():
    items = "".join(f"""
          <details class="faq__item">
            <summary><span{en(q_en)}>{esc(q)}</span><i class="ph ph-plus" aria-hidden="true"></i></summary>
            <p{en(a_en)}>{esc(a)}</p>
          </details>""" for q, a, q_en, a_en in FAQ)
    return f"""<section class="section section--tight" id="faq">
      <div class="wrap faq">
        <h2 class="h2 reveal" data-i18n="faq.title">שאלות <span class="thin">נפוצות.</span></h2>
        <div class="faq__list reveal">{items}
        </div>
      </div>
    </section>"""


def faq_schema():
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a, *_ in FAQ],
    }


def video_schema(p):
    o = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": p["title_he"],
        "description": p.get("desc_he") or p["title_he"],
        "thumbnailUrl": f"https://i.ytimg.com/vi/{p['id']}/hqdefault.jpg",
        "embedUrl": f"https://www.youtube.com/embed/{p['id']}",
        "contentUrl": f"https://www.youtube.com/watch?v={p['id']}",
        "publisher": {"@id": f"{SITE}/#organization"},
    }
    if p.get("date"):
        o["uploadDate"] = p["date"]
    return o


def page_hero(title_html, lead, i18n_title, i18n_lead, crumbs=None):
    bc = ""
    if crumbs:
        parts = []
        for i, (label, href, key) in enumerate(crumbs):
            k = f' data-i18n="{key}"' if key else ""
            parts.append(f'<a href="{href}"{k}>{esc(label)}</a>' if href else f'<span aria-current="page"{k}>{esc(label)}</span>')
        sep = '<i class="ph ph-caret-left" aria-hidden="true"></i>'
        bc = f'<nav class="crumbs" aria-label="פירורי לחם">{sep.join(parts)}</nav>'
    return f"""<section class="phero">
      <div class="wrap">
        {bc}
        <h1 class="reveal" data-i18n="{i18n_title}">{title_html}</h1>
        <p class="reveal" data-i18n="{i18n_lead}">{lead}</p>
      </div>
    </section>"""


# ---------------------------------------------------------------- pages

def build_home(d):
    body = read_src("home.html")
    body = (body.replace("{{CLIENTS}}", client_wall(d["clients"]))
                .replace("{{PRESS}}", press_block(d["press"]))
                .replace("{{PODCASTS}}", podcast_teaser(d["podcasts"]))
                .replace("{{POSTS}}", posts_teaser(d["posts"]))
                .replace("{{ORG}}", org_block(d["team"]))
                .replace("{{FAQ}}", faq_block())
                .replace("{{CONTACT_FORM}}", contact_form("home")))
    body = body.replace('<div class="contact__info">', '<div class="contact__info" data-replace>', 1)
    body = re.sub(r'<div class="contact__info" data-replace>.*?</div>', contact_info(), body, count=1, flags=re.S)
    services = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "שירותי Pro Algorithm",
        "itemListElement": [
            {"@type": "Service", "position": i + 1, "name": n, "provider": {"@id": f"{SITE}/#organization"}}
            for i, n in enumerate(["פיתוח תוכנה ומערכות מותאמות אישית", "טכנולוגיה לבנייה ואדריכלות (AI, GNN, BIM)",
                                   "הטמעת AI לארגונים", "צוותי פיתוח מנוהלים והשמת מתכנתים", "ספרינט גילוי ואבחון טכנולוגי"])
        ],
    }
    write("index.html", page(
        "/", nav=None,
        title="בית תוכנה | פיתוח תוכנה, אפליקציות ומערכות לבנייה ואדריכלות - Pro Algorithm",
        title_en="Pro Algorithm | Enterprise software house for AI, construction and architecture",
        desc="בית תוכנה ישראלי מוביל לפיתוח תוכנה, אפליקציות ומערכות חכמות לעסקים, בנייה ואדריכלות. מומחים ב-AI, אוטומציה ומערכות SaaS. קבלו הצעת מחיר עוד היום!",
        body=body, schemas=[faq_schema(), services],
        extra_head='<link rel="preload" as="image" href="/assets/img/brand/logo-white-480.png">',
    ))


def build_products(d):
    body = read_src("products.html")
    items = [("Pro Agent", "agent"), ("AutoCAD MCP", "mcp"), ("Superposition", "superposition"),
             ("BOQ", "boq"), ("Pro Sign", "sign"), ("Pro Time", "time")]
    schema = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "מוצרי Pro Algorithm",
        "itemListElement": [
            {"@type": "SoftwareApplication", "position": i + 1, "name": n, "applicationCategory": "BusinessApplication",
             "operatingSystem": "Web, Windows", "url": f"{SITE}/Products#{k}", "publisher": {"@id": f"{SITE}/#organization"}}
            for i, (n, k) in enumerate(items)
        ],
    }
    write("Products.html", page(
        "/Products", nav="/Products",
        title="מוצרים | Pro Algorithm - סוכן AI ל-AutoCAD, השוואת שרטוטים וכתבי כמויות",
        title_en="Products | Pro Algorithm",
        desc="ששת המוצרים של Pro Algorithm: סוכן AI בתוך AutoCAD, MCP ל-AutoCAD ו-Claude, השוואת שרטוטים וסופרפוזיציה, פענוח כתבי כמויות, החתמה דיגיטלית וניהול שעות.",
        body=body, schemas=[schema, breadcrumb([("בית", "/"), ("מוצרים", "/Products")])],
    ))


def build_about(d):
    team = d["team"]
    lead = [t for t in team if t["key"] in LEADERS]
    leaders = "".join(leader_line(t, big=True) for t in lead)
    body = page_hero("בית תוכנה לפיתוח <span class=\"thin\">אפליקציות ומערכות.</span>",
                     "אנו חברת טכנולוגיה חדשנית המתמחה במערכות רשת מתקדמות, פתרונות אלגוריתמיים וטכנולוגיות בינה מלאכותית המניעות טרנספורמציה עסקית.",
                     "about.title", "about.lead", [("בית", "/", "crumb.home"), ("אודות", None, "nav.about")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap split">
        <div class="reveal">
          <h2 class="h3" data-i18n="about.mission.t">המשימה שלנו</h2>
          <p class="big" data-i18n="about.mission.p">להעצים עסקים עם פתרונות אלגוריתמיים מתקדמים וטכנולוגיות AI הפותרות אתגרים מורכבים, מייעלות תפעול ופותחות אפשרויות חדשות לצמיחה וחדשנות.</p>
        </div>
        <div class="reveal">
          <h2 class="h3" data-i18n="about.vision.t">החזון שלנו</h2>
          <p class="big" data-i18n="about.vision.p">להיות המובילה העולמית בחדשנות אלגוריתמית, וליצור מערכות חכמות המשנות תעשיות ומשפרות חיים באמצעות כוח החישוב המתקדם והבינה המלאכותית.</p>
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="wrap">
        <div class="stats reveal">
          <div class="stat"><div class="stat__n">50,000<sup>+</sup></div><div class="stat__l" data-i18n="scale.s1">מ"ר של קומות משרדים שתוכננו ומוטבו ב-AI</div></div>
          <div class="stat"><div class="stat__n">600<sup>+</sup></div><div class="stat__l" data-i18n="scale.s2">בניינים שלקחנו חלק בתכנונם</div></div>
          <div class="stat"><div class="stat__n">4,000<sup>+</sup></div><div class="stat__l" data-i18n="scale.s3">שרטוטים אדריכליים שעברו דרך המערכות שלנו</div></div>
          <div class="stat"><div class="stat__n">100%</div><div class="stat__l" data-i18n="about.uptime">זמינות למערכות בייצור</div></div>
        </div>
      </div>
    </section>

    <section class="section" id="leadership">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="about.lead.t">הנהלת <span class="thin">הקבוצה.</span></h2>
          <p data-i18n="about.lead.p">הנהלה שמחברת בין אסטרטגיה עסקית, עומק טכנולוגי ושירות ברמה של ארגון.</p>
        </div>
        <div class="leaders-t leaders-t--big">{leaders}</div>
      </div>
    </section>

    <section class="section section--tight" id="team">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="org.title">ארגון אחד. <span class="thin">שש דיסציפלינות.</span></h2>
          <p data-i18n="about.team.p">מהנדסים וחוקרים ברמה עולמית, המוקדשים לפריצת גבולות הטכנולוגיה.</p>
        </div>
        {units_grid()}
      </div>
    </section>

    {client_wall(d['clients'])}

    <section class="section section--tight">
      <div class="wrap cta-band reveal">
        <h2 class="h2" data-i18n="cta.band.t">בואו נבנה את <span class="thin">הפרויקט הבא שלכם.</span></h2>
        <a class="btn btn--primary" href="/Contact"><span data-i18n="cta.meeting">קבעו פגישת היכרות</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a>
      </div>
    </section>"""
    about_schema = {
        "@context": "https://schema.org", "@type": "AboutPage", "name": "אודות Pro Algorithm", "url": f"{SITE}/About",
        "mainEntity": {"@id": f"{SITE}/#organization"},
    }
    people_schema = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "הנהלת Pro Algorithm",
        "itemListElement": [
            {"@type": "Person", "position": i + 1, "name": t["name_he"], "jobTitle": t["role"],
             "image": SITE + img(t["image"]), "worksFor": {"@id": f"{SITE}/#organization"}}
            for i, t in enumerate(lead)
        ],
    }
    write("About.html", page(
        "/About", nav="/About",
        title="אודות בית התוכנה | צוות פיתוח אפליקציות ותוכנה - Pro Algorithm",
        title_en="About | Pro Algorithm",
        desc="הכירו את Pro Algorithm: בית תוכנה ישראלי המתמחה במחקר ופיתוח, בינה מלאכותית, אלגוריתמים ופיתוח אפליקציות לעסקים, בנייה ואדריכלות. הכירו את הצוות.",
        body=body, schemas=[about_schema, people_schema, breadcrumb([("בית", "/"), ("אודות", "/About")])],
    ))


EXPERTISE = [
    ("code", "exp.1", "פיתוח תוכנה ומערכות מותאמות אישית לעסקים",
     "אפליקציות Web ו-React, מערכות SaaS, אוטומציה ופתרונות AI, מקצה לקצה, מאפיון ועד הטמעה בשטח.",
     ["אפליקציות Web ו-React מקצה לקצה", "מערכות SaaS מותאמות אישית", "אוטומציה ופתרונות AI מוטמעים"]),
    ("users-three", "exp.2", "צוות פיתוח מנוהל",
     "שלושה מסלולים גמישים: מתכנת יחיד, מתכנת ועוד ראש צוות, או צוות פיתוח מלא שמנוהל מקצה לקצה כולל DevOps ואבטחת מידע.",
     ["מתכנת יחיד ועד צוות מלא", "ניהול מקצה לקצה", "כולל DevOps ואבטחת מידע"]),
    ("user-plus", "exp.3", "מתכנתים לפי דרישה",
     "השמת מפתחי Web, React, QA ו-DevOps אצלכם או מרחוק, לפי היקף ומסלול העסקה גמיש: שעתי, חלקי או מלא.",
     ["מפתחי Web, React, QA ו-DevOps", "אצלכם או מרחוק", "העסקה גמישה: שעתי, חלקי או מלא"]),
    ("buildings", "exp.4", "פתרונות BIM לבנייה ואדריכלות",
     "השמת מומחי Revit, AutoCAD, Dynamo ו-Grasshopper אצל הלקוח, כולל פיתוח תוספים ואוטומציות מותאמות לתהליכי העבודה.",
     ["מומחי Revit, AutoCAD, Dynamo ו-Grasshopper", "פיתוח תוספים מותאמים", "אוטומציות ייעודיות לתהליכים"]),
    ("cpu", "exp.5", "הטמעת AI וטכנולוגיה לארגונים",
     "תוכנית של הכשרה, מיפוי ואוטומציה בשטח למפעלים ולעיריות, עם מהנדס AI שמוצב אצל הלקוח לאורך התהליך.",
     ["הכשרה ומיפוי תהליכים", "אוטומציה בשטח למפעלים ועיריות", "מהנדס AI מוצב אצל הלקוח"]),
    ("compass-tool", "exp.6", "ספרינט גילוי ואבחון טכנולוגי",
     "תהליך ממוקד של ניתוח דרישות, מיפוי תהליכים ובניית מפת דרכים טכנולוגית ברורה לפרויקט, במספר רמות היקף לפי גודל הפרויקט.",
     ["ניתוח דרישות ומיפוי תהליכים", "מפת דרכים טכנולוגית ברורה", "רמות היקף מותאמות לגודל הפרויקט"]),
]


def build_expertise(d):
    rows = []
    for icon, key, t, p, bullets in EXPERTISE:
        lis = "".join(f'<li data-i18n="{key}.b{i + 1}">{esc(b)}</li>' for i, b in enumerate(bullets))
        rows.append(f"""
        <article class="svc reveal" id="{key.replace('.', '-')}">
          <i class="ph ph-{icon}" aria-hidden="true"></i>
          <div>
            <h2 data-i18n="{key}.t">{esc(t)}</h2>
            <p data-i18n="{key}.p">{esc(p)}</p>
          </div>
          <ul>{lis}</ul>
        </article>""")
    body = page_hero("פתרונות טכנולוגיים <span class=\"thin\">בקנה מידה של ארגון.</span>",
                     "פיתוח תוכנה, צוותי פיתוח מנוהלים, השמת מתכנתים, פתרונות BIM והטמעת AI, מותאמים לכל עסק וארגון.",
                     "exp.title", "exp.lead", [("בית", "/", "crumb.home"), ("מומחיות", None, "nav.expertise")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap svcs">{''.join(rows)}
      </div>
    </section>

    <section class="section section--tight">
      <div class="wrap">
        <div class="section__head reveal">
          <h2 class="h2" data-i18n="exp.core.t">המומחיות <span class="thin">שלנו.</span></h2>
          <p data-i18n="exp.core.p">פתרונות טכנולוגיים מקיפים שנועדו להאיץ את הטרנספורמציה הדיגיטלית של הארגון.</p>
        </div>
        <div class="trio reveal">
          <div><h3 data-i18n="exp.c1.t">אפליקציות עסקיות מותאמות</h3><p data-i18n="exp.c1.p">תוכנות ואפליקציות מותאמות לעסקים, שנבנות על ידי מפתחים ישראלים עם קוד איכותי ואספקה מהירה.</p></div>
          <div><h3 data-i18n="exp.c2.t">בינה מלאכותית ולמידת מכונה</h3><p data-i18n="exp.c2.p">פתרונות בינה מלאכותית מתקדמים ומערכות חכמות, שמפותחים על ידי מומחי AI ישראלים.</p></div>
          <div><h3 data-i18n="exp.c3.t">פיתוח אלגוריתמים</h3><p data-i18n="exp.c3.p">אלגוריתמים מתקדמים שמתוכננים ומותאמים על ידי צוות הפיתוח שלנו ליעילות מקסימלית.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="wrap cta-band reveal">
        <h2 class="h2" data-i18n="exp.cta">רוצים לשמוע איך זה נראה <span class="thin">אצלכם?</span></h2>
        <a class="btn btn--primary" href="/Contact"><span data-i18n="cta.quote">קבלו הצעת מחיר</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a>
      </div>
    </section>"""
    schema = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "תחומי המומחיות של Pro Algorithm",
        "itemListElement": [
            {"@type": "Service", "position": i + 1, "name": t, "description": p, "provider": {"@id": f"{SITE}/#organization"}, "areaServed": "IL"}
            for i, (_, _, t, p, _) in enumerate(EXPERTISE)
        ],
    }
    write("Expertise.html", page(
        "/Expertise", nav="/Expertise",
        title="תחומי מומחיות | פיתוח תוכנה, צוותי פיתוח, BIM והטמעת AI - Pro Algorithm",
        title_en="Expertise | Pro Algorithm",
        desc="פיתוח תוכנה ומערכות מותאמות, צוותי פיתוח מנוהלים, השמת מתכנתים, פתרונות BIM לבנייה ואדריכלות, הטמעת AI לארגונים וספרינט אבחון טכנולוגי.",
        body=body, schemas=[schema, breadcrumb([("בית", "/"), ("מומחיות", "/Expertise")])],
    ))


def build_blog(d):
    posts = d["posts"]
    filters = [("all", "הכל", "All")] + [(k, v[0], v[1]) for k, v in CATS.items()]
    btns = "".join(
        f'<button type="button" class="chip{" is-on" if k == "all" else ""}" data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}"{en(e)}>{esc(h)}</button>'
        for k, h, e in filters
    )
    body = page_hero("הבלוג של <span class=\"thin\">Pro Algorithm.</span>",
                     "תובנות, מדריכים ומנהיגות מחשבתית על אלגוריתמים, בינה מלאכותית, פיתוח מערכות וטכנולוגיה לענף הבנייה.",
                     "blog.h1", "blog.h1lead", [("בית", "/", "crumb.home"), ("בלוג", None, "nav.blog")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap">
        <div class="chips" role="group" aria-label="סינון לפי קטגוריה">{btns}</div>
        <div class="post-grid post-grid--all" data-posts>{''.join(post_card(p) for p in posts)}</div>
      </div>
    </section>"""
    schema = {
        "@context": "https://schema.org", "@type": "Blog", "name": "הבלוג של Pro Algorithm", "url": f"{SITE}/Blog",
        "publisher": {"@id": f"{SITE}/#organization"}, "inLanguage": "he-IL",
        "blogPost": [{"@type": "BlogPosting", "headline": p["title_he"], "url": SITE + post_url(p),
                      "datePublished": p["created"], "image": SITE + img(p.get("image"))} for p in posts],
    }
    write("Blog.html", page(
        "/Blog", nav="/Blog",
        title="בלוג | מאמרים על פיתוח תוכנה, AI ואלגוריתמים - Pro Algorithm",
        title_en="Blog | Pro Algorithm",
        desc="מאמרים ומדריכים מקצועיים על פיתוח תוכנה ואפליקציות, בינה מלאכותית, אלגוריתמים, SaaS, אבטחת מידע וטכנולוגיה לבנייה ואדריכלות.",
        body=body, schemas=[schema, breadcrumb([("בית", "/"), ("בלוג", "/Blog")])],
    ))


def build_posts(d):
    posts = d["posts"]
    for p in posts:
        cat_he, cat_en = CATS.get(p["category"], CATS["technology"])
        content_he = md(p["content_he"])
        content_en = md(p["content_en"]) if p.get("content_en") else ""
        related = [x for x in posts if x["category"] == p["category"] and x["id"] != p["id"]][:3]
        if len(related) < 3:
            related += [x for x in posts if x["id"] != p["id"] and x not in related][: 3 - len(related)]
        tags = "".join(f'<li>{esc(t)}</li>' for t in p.get("tags") or [])
        url = SITE + post_url(p)
        body = f"""
    <article class="article">
      <header class="article__head wrap">
        <nav class="crumbs" aria-label="פירורי לחם"><a href="/" data-i18n="crumb.home">בית</a><i class="ph ph-caret-left" aria-hidden="true"></i><a href="/Blog" data-i18n="nav.blog">בלוג</a><i class="ph ph-caret-left" aria-hidden="true"></i><span{en(cat_en)}>{esc(cat_he)}</span></nav>
        <h1{en(p['title_en'])}>{esc(p['title_he'])}</h1>
        <p class="article__lead"{en(p['excerpt_en'])}>{esc(p['excerpt_he'])}</p>
        <div class="article__meta"><span data-i18n="blog.by">צוות Pro Algorithm</span><time datetime="{(p['created'] or '')[:10]}"{en(fmt_date(p['created'], 'en'))}>{fmt_date(p['created'])}</time><span>{read_minutes(p['content_he'])} <span data-i18n="blog.min">דק׳ קריאה</span></span></div>
      </header>
      <figure class="article__img wrap"><img src="{img(p.get('image'))}" alt="{esc(p.get('image_alt_he') or p['title_he'])}" width="1200" height="675" fetchpriority="high"></figure>
      <div class="wrap article__grid">
        <div class="prose" data-prose>{content_he}</div>
        <aside class="article__aside">
          <div class="aside-card">
            <h2 data-i18n="blog.cta.t">מתכננים פרויקט?</h2>
            <p data-i18n="blog.cta.p">נשמח לשמוע על האתגר שלכם ולהציע דרך לפתרון.</p>
            <a class="btn btn--primary btn--sm" href="/Contact"><span data-i18n="cta.talk">דברו איתנו</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a>
          </div>
          {f'<ul class="tags">{tags}</ul>' if tags else ''}
        </aside>
      </div>
      {f'<template data-prose-en>{content_en}</template>' if content_en else ''}
    </article>

    <section class="section section--tight">
      <div class="wrap">
        <h2 class="h2 reveal" data-i18n="blog.related">מאמרים <span class="thin">נוספים.</span></h2>
        <div class="post-grid reveal" style="margin-top:48px">{''.join(post_card(x) for x in related)}</div>
      </div>
    </section>"""
        schema = {
            "@context": "https://schema.org", "@type": "BlogPosting",
            "headline": p["title_he"], "description": meta_desc(p), "image": SITE + img(p.get("image")),
            "datePublished": p["created"], "dateModified": p["updated"], "inLanguage": "he-IL",
            "author": {"@type": "Organization", "name": "Pro Algorithm", "url": SITE},
            "publisher": {"@id": f"{SITE}/#organization"},
            "mainEntityOfPage": {"@type": "WebPage", "@id": url},
            "keywords": ", ".join(p.get("tags") or []), "articleSection": cat_he,
        }
        html_doc = page(
            post_url(p), nav="/Blog", canonical=url, og_type="article",
            title=f"{p['title_he']} | בלוג Pro Algorithm", title_en=f"{p['title_en'] or p['title_he']} | Pro Algorithm Blog",
            desc=meta_desc(p), og_image=SITE + img(p.get("image")),
            keywords=", ".join(p.get("tags") or []) or KEYWORDS,
            body=body,
            schemas=[schema, breadcrumb([("בית", "/"), ("בלוג", "/Blog"), (p["title_he"], post_url(p))])],
            extra_head=f'<meta property="article:published_time" content="{p["created"]}">\n  <meta property="article:modified_time" content="{p["updated"]}">\n  <meta property="article:section" content="{esc(cat_he)}">',
        )
        write(post_file(p).lstrip("/") + ".html", html_doc)


def build_podcast(d):
    pods = d["podcasts"]
    feat = [p for p in pods if not p.get("short")]
    tracks = [("construction", "בנייה, אדריכלות ו-AI", "Construction, architecture and AI"),
              ("business", "טכנולוגיה, פיתוח ועסקים", "Technology, development and business")]
    sections = []
    for key, he, en_ in tracks:
        items = [p for p in pods if p["track"] == key]
        sections.append(f"""
    <section class="section section--tight">
      <div class="wrap">
        <h2 class="h2 reveal"{en(en_)}>{esc(he)}</h2>
        <div class="ep-grid reveal">{''.join(episode_card(p) for p in items)}</div>
      </div>
    </section>""")
    body = page_hero("פודקאסט <span class=\"thin\">Pro Algorithm.</span>",
                     "סרטונים, שיחות עומק וטיפים מעולם הטכנולוגיה, הפיתוח, ה-AI והנדל\"ן.",
                     "pod.h1", "pod.h1lead", [("בית", "/", "crumb.home"), ("פודקאסט", None, "nav.podcast")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap">
        <div class="ep-grid ep-grid--feature reveal">{''.join(episode_card(p, big=True) for p in feat[:2])}</div>
      </div>
    </section>
    {''.join(sections)}
    <section class="section section--tight">
      <div class="wrap cta-band reveal">
        <h2 class="h2" data-i18n="pod.yt">כל הפרקים <span class="thin">בערוץ היוטיוב שלנו.</span></h2>
        <a class="btn btn--primary" href="{ORG['youtube']}/videos" target="_blank" rel="noopener"><span data-i18n="pod.sub">לערוץ ביוטיוב</span><i class="ph ph-youtube-logo" aria-hidden="true"></i></a>
      </div>
    </section>"""
    write("Podcast.html", page(
        "/Podcast", nav="/Podcast",
        title="פודקאסט | שיחות על טכנולוגיה, AI ופיתוח - Pro Algorithm",
        title_en="Podcast | Pro Algorithm",
        desc="הפודקאסט של Pro Algorithm: שיחות עומק, סרטונים וטיפים על פיתוח תוכנה, בינה מלאכותית, אדריכלות, נדל\"ן ועסקים.",
        body=body, schemas=[*(video_schema(p) for p in pods), breadcrumb([("בית", "/"), ("פודקאסט", "/Podcast")])],
    ))


def build_contact(d):
    body = page_hero("בואו נבנה את <span class=\"thin\">הפרויקט הבא שלכם.</span>",
                     "ספרו לנו על הארגון והאתגר. צוות המומחים שלנו יחזור אליכם תוך יום עסקים אחד.",
                     "contact.h1", "contact.h1lead", [("בית", "/", "crumb.home"), ("צור קשר", None, "nav.contact")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap contact">
        <div class="reveal">
          {contact_info()}
          <dl class="spec" style="margin-top:48px">
            <div><dt data-i18n="contact.hours">שעות פעילות</dt><dd data-i18n="contact.hours.v">ראשון עד חמישי, 09:00 עד 18:00</dd></div>
            <div><dt data-i18n="contact.office">משרד</dt><dd class="ltr"><a href="tel:{ORG['office_phone_intl']}">072-393-5596</a></dd></div>
          </dl>
        </div>
        {contact_form('contact-page')}
      </div>
    </section>"""
    schema = {"@context": "https://schema.org", "@type": "ContactPage", "name": "צור קשר", "url": f"{SITE}/Contact",
              "mainEntity": {"@id": f"{SITE}/#organization"}}
    write("Contact.html", page(
        "/Contact", nav="/Contact",
        title="צור קשר | קבלו הצעת מחיר לפיתוח תוכנה - Pro Algorithm",
        title_en="Contact | Pro Algorithm",
        desc="צרו קשר עם Pro Algorithm לקבלת הצעת מחיר לפיתוח תוכנה, אפליקציות, מערכות AI ופתרונות לבנייה ואדריכלות. info@pro-algorithm.co.il | 053-946-2842",
        body=body, schemas=[schema, breadcrumb([("בית", "/"), ("צור קשר", "/Contact")])],
    ))


def build_accessibility(d):
    body = page_hero("הצהרת <span class=\"thin\">נגישות.</span>",
                     "Pro Algorithm מחויבת להנגשת האתר לכל המשתמשים.",
                     "acc.h1", "acc.h1lead", [("בית", "/", "crumb.home"), ("הצהרת נגישות", None, "foot.a11y")])
    body += f"""
    <section class="section section--tight">
      <div class="wrap prose prose--page">
        <h2>ההתחייבות שלנו</h2>
        <p>Pro Algorithm מחויבת לספק אתר נגיש לקהל הרחב ביותר האפשרי, ללא קשר לנסיבות ויכולות. אנו שואפים לעמוד בתקן הישראלי 5568 ובהנחיות WCAG 2.1 ברמה AA של ארגון W3C.</p>
        <p>הנחיות אלו מסבירות כיצד להפוך תוכן אינטרנט לנגיש יותר לאנשים עם מוגבלויות, ואנו מאמינים שהן גם הופכות את האתר שלנו לידידותי יותר עבור כולם.</p>
        <h2>תקני נגישות</h2>
        <ul>
          <li>עמידה בהנחיות WCAG 2.1 ברמה AA לנגישות אינטרנט</li>
          <li>תמיכה בניווט מקלדת בכל האתר, כולל קישור "דלגו לתוכן"</li>
          <li>תאימות לקוראי מסך ומבנה HTML סמנטי</li>
          <li>ניגודיות צבעים שעומדת ביחס 4.5:1 לפחות לטקסט רגיל</li>
          <li>כיבוד הגדרת "הפחתת תנועה" של מערכת ההפעלה</li>
        </ul>
        <h2>תפריט הנגישות באתר</h2>
        <ul>
          <li>הגדלה והקטנה של גודל הטקסט</li>
          <li>מצב ניגודיות גבוהה</li>
          <li>הדגשת קישורים</li>
          <li>גופן קריא</li>
          <li>עצירת אנימציות</li>
        </ul>
        <h2>הסדרי נגישות ויצירת קשר</h2>
        <p>אם נתקלתם במחסום נגישות באתר, או אם אתם זקוקים לסיוע בגישה לתוכן כלשהו, פנו אלינו ונעבוד איתכם כדי לספק את המידע או השירות באמצעים חלופיים.</p>
        <ul>
          <li>אימייל: <a href="mailto:{ORG['email']}">{ORG['email']}</a></li>
          <li>טלפון: <a href="tel:{ORG['phone_intl']}">{ORG['phone']}</a></li>
        </ul>
        <p>נגיב לפניות נגישות תוך 5 ימי עסקים.</p>
        <p class="muted">עדכון אחרון: {fmt_date(TODAY)}</p>
      </div>
    </section>"""
    write("AccessibilityStatement.html", page(
        "/AccessibilityStatement", nav=None,
        title="הצהרת נגישות | Pro Algorithm", title_en="Accessibility Statement | Pro Algorithm",
        desc="הצהרת הנגישות של Pro Algorithm: עמידה בתקן 5568 ו-WCAG 2.1 AA, תפריט נגישות, ופרטי יצירת קשר לפניות נגישות.",
        body=body, schemas=[breadcrumb([("בית", "/"), ("הצהרת נגישות", "/AccessibilityStatement")])],
    ))


def build_404():
    body = """
    <section class="phero phero--404">
      <div class="wrap">
        <p class="err-code">404</p>
        <h1 data-i18n="nf.t">העמוד לא נמצא.</h1>
        <p data-i18n="nf.p">ייתכן שהקישור השתנה. אפשר לחזור לדף הבית או לחפש בבלוג.</p>
        <div class="hero__cta" style="margin-top:32px">
          <a class="btn btn--primary" href="/"><span data-i18n="nf.home">לדף הבית</span><i class="ph ph-arrow-left" aria-hidden="true"></i></a>
          <a class="btn btn--ghost" href="/Blog" data-i18n="nav.blog">בלוג</a>
        </div>
      </div>
    </section>"""
    write("404.html", page("/404", title="העמוד לא נמצא | Pro Algorithm", title_en="Page not found | Pro Algorithm",
                           desc="העמוד שחיפשתם לא נמצא.", body=body, robots="noindex, follow"))


def build_blogpostpage_fallback(d):
    """/BlogPostPage?slug=... works on any host: Netlify rewrites it, others hit this page."""
    mapping = {}
    for p in d["posts"]:
        for s in (p["slug_he"], p["slug_en"]):
            if s:
                mapping[s] = post_file(p)
    body = f"""
    <section class="phero"><div class="wrap"><h1>טוען מאמר…</h1><p><a href="/Blog">לכל המאמרים</a></p></div></section>
    <script>(function(){{var m={json.dumps(mapping, ensure_ascii=False)};var s=new URLSearchParams(location.search).get('slug')||'';location.replace(m[s]||m[decodeURIComponent(s)]||'/Blog');}})();</script>"""
    write("BlogPostPage.html", page("/BlogPostPage", title="בלוג | Pro Algorithm", title_en="Blog | Pro Algorithm",
                                    desc="הבלוג של Pro Algorithm", body=body, canonical=f"{SITE}/Blog", robots="noindex, follow"))


def build_meta_files(d):
    posts = d["posts"]
    urls = [("/", "1.0", TODAY), ("/About", "0.8", TODAY), ("/Expertise", "0.8", TODAY), ("/Products", "0.9", TODAY),
            ("/Blog", "0.8", posts[0]["updated"][:10] if posts else TODAY), ("/Podcast", "0.7", TODAY),
            ("/Contact", "0.8", TODAY), ("/AccessibilityStatement", "0.3", TODAY)]
    urls += [(post_url(p), "0.6", (p["updated"] or TODAY)[:10]) for p in posts]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, pr, lm in urls:
        xml.append(f"  <url><loc>{esc(SITE + (u if u != '/' else '/'))}</loc><lastmod>{lm}</lastmod><priority>{pr}</priority></url>")
    xml.append("</urlset>")
    write("sitemap.xml", "\n".join(xml) + "\n")
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    write("manifest.json", json.dumps({
        "name": "Pro Algorithm", "short_name": "Pro Algorithm", "lang": "he", "dir": "rtl",
        "start_url": "/", "display": "standalone", "background_color": "#0a0c0f", "theme_color": "#0a0c0f",
        "icons": [{"src": "/assets/img/brand/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "/assets/img/brand/icon-512.png", "sizes": "512x512", "type": "image/png"}],
    }, ensure_ascii=False, indent=2))

    # Netlify: keep every old URL alive
    # set www.pro-algorithm.co.il as the primary domain in Netlify; it redirects the apex itself
    lines = ["# Generated by tools/build.py", ""]
    lines.append("# blog posts keep their original /BlogPostPage?slug= address (rewrite, not redirect)")
    for p in posts:
        for s in {p["slug_he"], p["slug_en"]} - {""}:
            enc = urllib.parse.quote(s)
            lines.append(f"/BlogPostPage slug={enc} {post_file(p)} 200")
            if enc != s:
                lines.append(f"/BlogPostPage slug={s} {post_file(p)} 200")
    lines += ["", "# lowercase and legacy variants of the old routes",
              "/about /About 301", "/blog /Blog 301", "/contact /Contact 301", "/expertise /Expertise 301",
              "/podcast /Podcast 301", "/products /Products 301", "/accessibilitystatement /AccessibilityStatement 301",
              "/accessibility-statement /AccessibilityStatement 301", "/accessibility /AccessibilityStatement 301",
              "/blog-post-page /BlogPostPage 301", "/blogpostpage /BlogPostPage 301",
              "/LandingPage / 301", "/landingpage / 301", "/landing-page / 301", "/home / 301", "/Home / 301",
              "/index.html / 301"]
    write("_redirects", "\n".join(lines) + "\n")

    write("_headers", """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
""")


def copy_assets():
    """css/js as-is; images: only the optimized files pages actually reference."""
    dst = os.path.join(DIST, "assets")
    src = os.path.join(ROOT, "assets")
    for sub in ("css", "js"):
        shutil.copytree(os.path.join(src, sub), os.path.join(dst, sub), dirs_exist_ok=True)
    for folder in ("blog", "podcast", "clients", "press", "leaders"):
        os.makedirs(os.path.join(dst, "img", folder), exist_ok=True)
        for n in os.listdir(os.path.join(src, "img", folder)):
            if n.endswith(".webp"):
                shutil.copy2(os.path.join(src, "img", folder, n), os.path.join(dst, "img", folder, n))
    os.makedirs(os.path.join(dst, "img", "brand"), exist_ok=True)
    for n in ("icon-32.png", "icon-180.png", "icon-192.png", "icon-512.png", "logo-white-480.png", "og.jpg", "hero-construction.webp"):
        shutil.copy2(os.path.join(src, "img", "brand", n), os.path.join(dst, "img", "brand", n))
    # browsers ask for /favicon.ico regardless of the <link rel=icon>
    from PIL import Image
    Image.open(os.path.join(src, "img", "brand", "icon-192.png")).save(
        os.path.join(DIST, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])


def main():
    # clear files but tolerate folders held open by OneDrive or the preview server
    if os.path.exists(DIST):
        for base, dirs, files in os.walk(DIST, topdown=False):
            for f in files:
                os.remove(os.path.join(base, f))
            for d_ in dirs:
                try:
                    os.rmdir(os.path.join(base, d_))
                except OSError:
                    pass
    d = {k: load(k) for k in ("team", "clients", "press", "posts", "podcasts")}
    copy_assets()
    build_home(d)
    build_products(d)
    build_about(d)
    build_expertise(d)
    build_blog(d)
    build_posts(d)
    build_podcast(d)
    build_contact(d)
    build_accessibility(d)
    build_404()
    build_blogpostpage_fallback(d)
    build_meta_files(d)
    n = sum(len(f) for _, _, f in os.walk(DIST))
    print(f"built {n} files into dist/ ({len(d['posts'])} posts, {len(d['podcasts'])} episodes)")


if __name__ == "__main__":
    main()
