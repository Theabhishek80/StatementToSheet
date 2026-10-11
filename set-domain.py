"""Usage: python3 set-domain.py https://your-new-site/
Changes the site URL in index.html, sitemap.xml and robots.txt."""
import re, sys, pathlib
if len(sys.argv) != 2 or not sys.argv[1].startswith("http"):
    sys.exit("Usage: python3 set-domain.py https://your-new-site/")
new = sys.argv[1].rstrip("/") + "/"
html = pathlib.Path("index.html").read_text(encoding="utf-8")
old = re.search(r'rel="canonical" href="([^"]+)"', html).group(1)
for name in ["index.html", "sitemap.xml", "robots.txt"]:
    p = pathlib.Path(name)
    p.write_text(p.read_text(encoding="utf-8").replace(old, new), encoding="utf-8")
    print("updated", name)
