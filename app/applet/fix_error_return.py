with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

target = 'const civData = await fetchCivitaiRealImageMeta(targetImageId);\n      if (civData) {'
replacement = '''const civData = await fetchCivitaiRealImageMeta(targetImageId);
      if (civData.error) {
        return res.status(civData.status || 500).json({ error: civData.error });
      }
      if (civData) {'''

if target in text:
    text = text.replace(target, replacement)
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Successfully added civData.error return!")
else:
    print("Target not found!")
