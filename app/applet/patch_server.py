with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('async function fetchCivitaiRealImageMeta(imageId: string)')
end_marker = 'app.post(\'/api/civitai/extract-workflow\''
end_idx = text.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    new_func = """async function fetchCivitaiRealImageMeta(imageId: string) {
  try {
    const resp = await fetch(`https://civitai.com/images/${imageId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `Civitai 上游响应 HTTP ${resp.status}: ${errText.slice(0, 500)}`, status: resp.status };
    }
    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\\s\\S]*?)<\\/script>/);
    if (!match) {
      return { error: `Civitai 页面未包含 __NEXT_DATA__ 元数据 (Image #${imageId})`, status: 404 };
    }
    const json = JSON.parse(match[1]);
    const queries = json.props?.pageProps?.trpcState?.json?.queries || [];
    let genData: any = null;
    let imgGet: any = null;
    for (const q of queries) {
      const qName = q.queryKey?.[0]?.[1];
      if (qName === 'getGenerationData') genData = q.state?.data;
      if (qName === 'get') imgGet = q.state?.data;
    }
    if (!genData && !imgGet) {
      return { error: `Civitai 页面未找到该图片的生成元数据 (Image #${imageId})`, status: 404 };
    }
    return { genData, imgGet, status: 200 };
  } catch (e: any) {
    return { error: `连接 Civitai 发生网络错误: ${e.message}`, status: 500 };
  }
}\n\n"""
    text = text[:start_idx] + new_func + text[end_idx:]
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Successfully patched fetchCivitaiRealImageMeta!")
else:
    print("Markers not found!")
