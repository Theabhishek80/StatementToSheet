"""Usage: python3 set-domain.py https://your-real-site-url/
Replaces the placeholder site URL in index.html, sitemap.xml and robots.txt."""
import sys, pathlib
OLD = "https://your-username.github.io/statement-to-excel/"
if len(sys.argv) != 2 or not sys.argv[1].startswith("http"):
    sys.exit("Usage: python3 set-domain.py https://your-real-site-url/")
new = sys.argv[1].rstrip("/") + "/"
for name in ["index.html", "sitemap.xml", "robots.txt"]:
    p = pathlib.Path(name)
    p.write_text(p.read_text(encoding="utf-8").replace(OLD, new), encoding="utf-8")
    print("updated", name)
