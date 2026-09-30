"""Pull content and assets from the current Pro Algorithm sites into data/ and assets/img/.

Sources:
  - Base44 public entities of pro-algorithm.co.il (BlogPost, PodcastVideo)
  - Static assets referenced by pro-algorithm.co.il and buildalgo.co.il

Run: python tools/fetch_content.py
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
IMG = os.path.join(ROOT, "assets", "img")

APP = "6874c2fc337b6e28a8ec9e95"
API = f"https://base44.app/api/apps/{APP}/entities"
SB = f"https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/{APP}"
MEDIA = f"https://media.base44.com/images/public/{APP}"
BA = "https://www.buildalgo.co.il/assets/images"
UA = {"User-Agent": "Mozilla/5.0", "X-App-Id": APP}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    return body if binary else body.decode("utf-8")


def save_img(url, rel):
    path = os.path.join(IMG, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return rel
    safe = urllib.parse.quote(url, safe=":/?=&%")
    try:
        with open(path, "wb") as f:
            f.write(get(safe, binary=True))
        print("  img", rel)
    except Exception as e:  # keep going, report at the end
        print("  FAILED", rel, e, file=sys.stderr)
        return None
    return rel


BRAND = {
    "brand/logo-white.png": f"{MEDIA}/0230b1a07_MAIN-LOGOwhite.png",
    "brand/favicon.png": f"{MEDIA}/77dbec17f_Favicon-blue.png",
    "brand/logo-dark.png": f"{BA}/company-logos/MAIN-LOGO.png",
    "brand/og-construction.png": f"{MEDIA}/32e31abdf_buildings-construction-purple.png",
    "brand/hero-construction.jpg": f"{BA}/story-frames/poster-desktop.jpg",
}

TEAM = [
    ("noad", "נועד ג'ורנו", "Noad Giorno", "CEO", "ניהול והובלה", "Management & Leadership",
     "בעל ניסיון רב בהובלת צוותים וחברות להצלחה, עם יכולת מוכחת ליישם אסטרטגיות צמיחה ולבנות ארגונים חזקים ומובילים.",
     "Extensive experience leading teams and companies to success, with a proven ability to execute growth strategies and build strong organizations.",
     f"{SB}/d3e162adc_WhatsAppImage2025-11-20at094200.jpeg"),
    ("tzach", "צח דבוש", "Tzach Dabush", "CTO", "אלקטרוניקה ופיתוח Web", "Electronics & Web Development",
     "למעלה מ-10 שנות ניסיון בפיתוח מערכות מתקדמות ובניהול צוותים, עם התמחות בהובלת חדשנות והטמעת פתרונות טכנולוגיים פורצי דרך.",
     "Over 10 years developing advanced systems and managing teams, specializing in leading innovation and deploying breakthrough technology.",
     f"{SB}/da1566e19_WhatsAppImage2025-11-20at091228.jpg"),
    ("ido", "עידו טביב", "Ido Tabib", "Chief Customer Relations Officer", "Customer Success & Relations", "Customer Success & Relations",
     'סמנכ"ל קשרי לקוחות המתמחה בניהול קשרי לקוחות אסטרטגיים, הובלת צוותי שירות ובניית חוויות לקוח מיטביות.',
     "VP of customer relations, specializing in strategic accounts, leading service teams and building excellent customer experiences.",
     f"{SB}/9262cd4a6_image.png"),
    ("linoy", "לינוי", "Linoy", "Full-Stack Developer", "Web Development", "Web Development",
     "מפתחת Full-Stack מנוסה עם התמחות ב-React, Node.js ומערכות Cloud מורכבות.",
     "Experienced full-stack developer specializing in React, Node.js and complex cloud systems.",
     f"{SB}/c47e8f643_1a1f47ba-2812-4a7d-9d12-e669a8f575fc.jpg"),
    ("ben", "בן שואן", "Ben Shoan", "Backend Developer", "Server & Database", "Server & Database",
     "מתכנת באקאנד מנוסה המתמחה בבניית מערכות צד שרת יציבות ומדרגיות.",
     "Experienced backend developer building stable, scalable server-side systems.",
     f"{SB}/725b29935_f3bf6461-b84b-4940-9ca3-fd205f5f74a5.jpg"),
    ("shlomi", "שלומי טפירו", "Shlomi Tapiro", "AI & Automation Developer", "Neural Networks", "Neural Networks",
     "מתכנת עם ניסיון עשיר באוטומציות ורשתות נוירונים, מומחה בפתרונות AI מתקדמים.",
     "Developer with deep experience in automation and neural networks, expert in advanced AI solutions.",
     f"{SB}/e8bd3eab5_c5da005d-2cc4-4d43-bf2b-524d67483d99.jpg"),
    ("omer", "עומר טולדנו", "Omer Toledano", "AI & Data Science Specialist", "Artificial Intelligence & Data Science", "Artificial Intelligence & Data Science",
     "מומחית AI ומדעי הנתונים עם תואר שני מבן גוריון, מתמחה בפתרונות AI מתקדמים, למידת מכונה ואנליזת נתונים מורכבת.",
     "AI and data science specialist with a master's degree from Ben-Gurion University, focused on machine learning and complex data analysis.",
     f"{SB}/007593774_WhatsAppImage2026-02-12at130836.jpeg"),
    ("evelina", "אבלינה שיימן", "Evelina Sheiman", "Sales Manager", "Sales Management", "Sales Management",
     "מנהלת מכירות מנוסה עם יכולות הובלת צוותים, בניית קשרי לקוחות אסטרטגיים ועמידה ביעדים.",
     "Experienced sales manager leading teams, building strategic client relationships and meeting targets.",
     f"{SB}/90c3d7f87_WhatsAppImage2025-11-20at091548.jpeg"),
    ("revital", "רויטל יגאלי", "Revital Yigali", "Sales Manager", "Sales and Customer Service", "Sales and Customer Service",
     "בעלת ניסיון במכירות פרונטליות וטלפוניות, בניית קשרי לקוחות, והובלת תהליכי מכירה משלב ההיכרות ועד סגירת העסקה.",
     "Experienced in in-person and phone sales, building client relationships and leading the sales process from first contact to close.",
     f"{MEDIA}/bb8af4855_revital.jpg"),
    ("yaniv", "יניב סיביליה", "Yaniv Sibilia", "Operations Manager", "Operations and Logistics", "Operations and Logistics",
     "אחראי על תיאום מערכי עבודה, ניהול צוותים ותהליכי תפעול, ושיפור זרימת העבודה בארגון לשם יעילות מרבית.",
     "Coordinates work streams, teams and operations, improving organizational workflow for maximum efficiency.",
     f"{MEDIA}/d66093968_yaniv.jpg"),
    ("liat", "ליאת אוברוב", "Liat Ovrov", "Accounting Manager", "Accounting Management", "Accounting Management",
     "בעלת ניסיון בניהול מערכות חשבונאיות מקצה לקצה וליווי הנהלה בקבלת החלטות מבוססות נתונים.",
     "Experienced in managing end-to-end accounting systems and supporting management in data-driven decisions.",
     f"{MEDIA}/a820066ed_liat.png"),
]

# Curated client logos. Some were hand-processed (ACB lettering recolored, Redmark cropped
# from a card), so existing files in assets/img/clients are never overwritten.
CLIENTS = [
    ("idf", 'צה"ל', "Israel Defense Forces", "https://commons.wikimedia.org/wiki/Special:FilePath/Badge_of_the_Israeli_Defense_Forces_2022_version.svg?width=800"),
    ("mod", "משרד הביטחון", "Israel Ministry of Defense", "https://commons.wikimedia.org/wiki/Special:FilePath/Logo_of_the_Ministry_of_Defense_of_Israel_(Hebrew).png"),
    ("rafael", "רפאל", "Rafael Advanced Defense Systems", "https://commons.wikimedia.org/wiki/Special:FilePath/Rafael_Advanced_Defense_Systems_Logo.svg?width=800"),
    ("mafat", 'מפא"ת', "MAFAT - Directorate of Defense R&D", "https://commons.wikimedia.org/wiki/Special:FilePath/Mafat_Logo_in_Hebrew_svg.svg?width=800"),
    ("tau", "אוניברסיטת תל אביב", "Tel Aviv University", f"{SB}/1d5be016b_IMG_1672.png"),
    ("bar-ilan", "אוניברסיטת בר-אילן", "Bar-Ilan University", f"{BA}/customer logos/bar-ilan.png"),
    ("acb", "התאחדות הקבלנים בוני הארץ", "Israel Builders Association", "https://www.acb.org.il/wp-content/uploads/2017/05/logo.svg"),
    ("pekerman", "פקרמן הנדסה ואדריכלות", "Pekerman Engineering & Architecture", f"{BA}/customer logos/pekerman.png"),
    ("redmark", "רדמרק אדריכלות וניהול פרויקטים", "Redmark Architecture & Project Management", "https://talknopf-ressh.cloudinary.com/image/upload/q_auto/redmark_site/REDMARKSquare.gif"),
    ("aspire-home", "אספייר הום", "Aspire Home Audio Plus", ""),  # logo supplied by the client
    ("mydesk", "myDESK", "myDESK", f"{SB}/67d25216c_IMG_1675.png"),
]

PRESS = [
    ("globes", "Globes", "הסטארט-אפים שיחליפו את האדריכלים",
     "שתי חברות סטארט-אפ ישראליות מציעות תוכנות שמנסות להחליף אלמנטים מרכזיים בעבודת התכנון",
     "https://www.globes.co.il/news/article.aspx?did=1001380915"),
    ("calcalist", "Calcalist", "מה יעשה ה-AI לאדריכלות והבנייה?",
     "השפעת ה-AI על מקצוע האדריכלות והחשש מהחלפת כוח אדם אנושי במכונות",
     "https://www.calcalist.co.il/real-estate/article/b1hwhj251x"),
    ("globes", "Globes", "אנחנו מחליפים את מהנדסי הבניין ב-AI, מי שיישאר זה רק האדריכל",
     "סטארט-אפ חדש לשילוב בינה מלאכותית בתכנון",
     "https://www.globes.co.il/news/article.aspx?did=1001526847"),
    ("calcalist", "Calcalist", '"המענה לבעיות בענף הנדל"ן יגיע מ-AI"',
     'ענף הנדל"ן, אחד האיטיים ביותר באימוץ טכנולוגיה, נדחק למצב הדורש שינוי מהותי, והמענה לאתגרים יגיע מ-AI ואימוץ טכנולוגיה בקנה מידה רחב',
     "https://www.calcalist.co.il/conferences/article/sjbpz9p11wl"),
    ("mako", "mako", "AI וניהול חכם: הדרך של ענף הבנייה להתחדשות וצמיחה",
     "הטכנולוגיות החדשות שקיימות היום בשוק יכולות לצמצם משמעותית את בעיית הדיור הלאומית",
     "https://www.mako.co.il/news-business/duns_100-realestate/Article-ebba5c87bde1691026.htm"),
    ("ynet", "ynet", "בינה מלאכותית בעיצוב ואדריכלות: חיובי או שלילי?",
     "בשנים הקרובות נפח העבודה שייעשה באמצעות בינה מלאכותית ואוטומציה יגיע לכ-40%",
     "https://www.ynet.co.il/architecture/article/sygzyvxt3"),
    ("nadlan-center", "Nadlan Center", "ה-AI משנה את האדריכלות, האם יחליף אותה?",
     "משרדי אדריכלים ומעצבי פנים משתמשים ב-AI כדי ליצור הדמיות וסרטונים במהירות ולייעל תהליכים",
     "https://www.nadlancenter.co.il/article/13052"),
    ("walla", "Walla", "זה כבר כאן: האם אנו לפני מהפכת ה-AI בעולם האדריכלות, העיצוב והבנייה?",
     "עולם הבינה המלאכותית ישפיע נמרצות על תחומים רבים בענף",
     "https://home.walla.co.il/item/3647977"),
]

# Construction-focused episodes from buildalgo.co.il
BA_PODCASTS = [
    ("F7tHmD-HIbQ", "איך הבינה המלאכותית משנה את כללי המשחק?", "בפרק הזה אנחנו מארחים את ד״ר הדס נור, שחוקרת את השינוי הגדול שמתרחש היום בעולם האדריכלות והעיצוב", "2026-01-20", "01:01:29", False),
    ("fNFjbPN5hcQ", "מגמות חדשות באדריכלות", "המגמות בשוק והשינוי בתפקיד האדריכל", "2025-12-19", "00:01:29", True),
    ("_HUQrO_xbGI", "הזמן כמרכיב יצירתי", "למה יצירתיות חייבת זמן ולא יכולה לרוץ מהר כמו ה-AI", "2025-12-17", "00:01:18", True),
    ("LzLAs7v1FMc", "החיבור בין AI לפרמטריות", "מדברים על שילוב ה-AI עם תוכנה פרמטרית", "2025-12-11", "00:00:46", True),
    ("81_jL2nej1k", "עתיד מקצוע האדריכלות", "האם המקצוע של האדריכלות עתיד להיעלם מהעולם", "2025-12-06", "00:00:29", True),
    ("NdzYcBNJTmI", "תובנות מהמחקר על טכנולוגיות המחר", "מה היה ממצא המחץ במחקר על אדריכלות והטכנולוגיה של המחר", "2025-12-03", "00:00:52", True),
]


def slug_ok(s):
    return (s or "").strip().strip("/")


def main():
    os.makedirs(DATA, exist_ok=True)

    print("brand")
    for rel, url in BRAND.items():
        save_img(url, rel)

    print("team")
    team = []
    for key, he, en, role, exp_he, exp_en, bio_he, bio_en, url in TEAM:
        ext = os.path.splitext(url)[1].lower() or ".jpg"
        img = save_img(url, f"team/{key}{ext}")
        team.append(dict(key=key, name_he=he, name_en=en, role=role, expertise_he=exp_he,
                         expertise_en=exp_en, bio_he=bio_he, bio_en=bio_en, image=img))

    print("clients")
    clients = []
    for key, he, en, url in CLIENTS:
        img = save_img(url, f"clients/{key}.png")
        clients.append(dict(key=key, name_he=he, name_en=en, image=img))

    print("press")
    press = []
    for key, outlet, title, body, url in PRESS:
        logo_name = "nadlan-center" if key == "nadlan-center" else key
        img = save_img(f"{BA}/media logos/{logo_name}.png", f"press/{key}.png")
        press.append(dict(outlet=outlet, logo=img, title=title, body=body, url=url))

    print("blog posts")
    posts = json.loads(get(f"{API}/BlogPost?limit=500"))
    seen, clean = set(), []
    for p in sorted(posts, key=lambda x: x.get("updated_date") or "", reverse=True):
        if not p.get("published"):
            continue
        s = slug_ok(p.get("slug_he")) or slug_ok(p.get("slug_en"))
        if not s or s in seen:
            continue
        seen.add(s)
        img_url = p.get("image_url") or ""
        img = None
        if img_url:
            if "unsplash.com" in img_url:
                img_url = img_url.split("?")[0] + "?w=1200&q=75&auto=format&fit=crop"
                ext = ".jpg"
            else:
                ext = os.path.splitext(urllib.parse.urlparse(img_url).path)[1] or ".jpg"
            img = save_img(img_url, f"blog/{p['id']}{ext}")
        clean.append(dict(
            id=p["id"], slug_he=slug_ok(p.get("slug_he")), slug_en=slug_ok(p.get("slug_en")),
            title_he=p.get("title_he") or "", title_en=p.get("title_en") or "",
            excerpt_he=p.get("excerpt_he") or "", excerpt_en=p.get("excerpt_en") or "",
            content_he=p.get("content_he") or "", content_en=p.get("content_en") or "",
            image=img, image_alt_he=p.get("image_alt_he") or "", image_alt_en=p.get("image_alt_en") or "",
            category=p.get("category") or "technology", tags=p.get("tags") or [],
            created=p.get("created_date"), updated=p.get("updated_date") or p.get("created_date"),
        ))
    clean.sort(key=lambda x: x["created"] or "", reverse=True)
    print("  posts kept:", len(clean), "of", len(posts))

    print("podcasts")
    vids = json.loads(get(f"{API}/PodcastVideo?limit=500"))
    pods, seen_ids = [], set()
    for v in sorted(vids, key=lambda x: x.get("published_date") or "", reverse=True):
        yid = v.get("youtube_id")
        if not yid or yid in seen_ids:
            continue
        seen_ids.add(yid)
        pods.append(dict(id=yid, title_he=v.get("title_he") or "", title_en=v.get("title_en") or "",
                         desc_he=v.get("description_he") or "", desc_en=v.get("description_en") or "",
                         date=v.get("published_date"), duration=v.get("duration"),
                         short="shorts" in (v.get("youtube_url") or ""), featured=bool(v.get("featured")),
                         track="business"))
    for yid, title, desc, date, dur, short in BA_PODCASTS:
        if yid in seen_ids:
            continue
        seen_ids.add(yid)
        pods.append(dict(id=yid, title_he=title, title_en="", desc_he=desc, desc_en="", date=date,
                         duration=dur, short=short, featured=not short, track="construction"))
    pods.sort(key=lambda x: x["date"] or "", reverse=True)
    for p in pods:
        p["thumb"] = save_img(f"https://i.ytimg.com/vi/{p['id']}/hqdefault.jpg", f"podcast/{p['id']}.jpg")
    print("  episodes:", len(pods))

    for name, obj in [("team", team), ("clients", clients), ("press", press), ("posts", clean), ("podcasts", pods)]:
        with open(os.path.join(DATA, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    print("done")


if __name__ == "__main__":
    main()
