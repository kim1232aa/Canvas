import urllib.request
import re

try:
    req = urllib.request.Request("https://g.alicdn.com/sail-web/maas/2.13.159/umi.js", headers={"User-Agent": "Mozilla/5.0"})
    content = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", errors="ignore")
    apis = set(re.findall(r"[\"'](/api/v\d/[^\"'\s\?]+)[\"']", content))
    print(f"Total APIs found: {len(apis)}")
    for a in sorted(apis):
        if any(k in a for k in ["model", "hub", "lora"]):
            print("Match:", a)
except Exception as e:
    print("Error:", e)
