import time

TESTS = [
  {"id": "muapi", "model": "z-image-turbo-text-to-image-lora", "name": "MuAPI"},
  {"id": "wavespeed", "model": "wavespeed-ai/z-image/turbo", "name": "WaveSpeed"},
  {"id": "aimlapi", "model": "flux/schnell", "name": "AIMLAPI"},
  {"id": "deepinfra", "model": "black-forest-labs/FLUX-1-dev", "name": "DeepInfra"},
  {"id": "replicate", "model": "black-forest-labs/flux-schnell", "name": "Replicate"},
  {"id": "mage", "model": "mango-v3", "name": "Mage"},
]

def test_one(p):
  pid = p["id"]
  model = p["model"]
  print(f"\n--- Testing {p['name']} ({pid}) ---")

  # Select provider
  js(f"""
  (() => {{
    const ckpt = document.getElementById('node-std-huggingface-t2i-ckpt');
    const sel = ckpt.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(sel, '{pid}');
    sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }})()
  """)
  time.sleep(1.5)

  # Select model
  js(f"""
  (() => {{
    const ckpt = document.getElementById('node-std-huggingface-t2i-ckpt');
    const selects = ckpt.querySelectorAll('select');
    if (selects.length > 1) {{
      const modelSel = selects[1];
      const opt = [...modelSel.options].find(o => o.value === '{model}' || o.value.includes('{model}'));
      if (opt) {{
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
        setter.call(modelSel, opt.value);
        modelSel.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }}
    }}
    const customInput = [...ckpt.querySelectorAll('input')].find(i => i.placeholder?.includes('自定义') || i.parentElement?.innerText?.includes('自定义模型'));
    if (customInput) {{
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(customInput, '{model}');
      customInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
      customInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
    }}
  }})()
  """)
  time.sleep(1.5)

  # Click Run
  js("""
  (() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('运行：保存图像'));
    if (btn) btn.click();
  })()
  """)

  # Wait up to 10 seconds for completion / error
  result_text = ""
  for sec in range(10):
    time.sleep(1)
    res = js("""
    (() => {
      const samp = document.getElementById('node-std-huggingface-t2i-samp');
      const errBox = samp ? samp.querySelector('.bg-rose-950\\\\/50, [class*="rose-"], [class*="red-"]') : null;
      return {
        err: errBox ? (errBox.textContent || '').trim() : '',
        sampText: samp ? (samp.textContent || '').slice(0, 100) : ''
      };
    })()
    """)
    if res.get("err"):
      result_text = res["err"]
      print(f"Found error at {sec+1}s: {result_text[:100]}")
      break

  shot = f"/root/github/ComfyUI Web Studio/.tower/worktrees/wt-4/temp/e2e/2026-11-05/schema5b/ui-{pid}.png"
  capture_screenshot(shot)
  print(f"Saved screenshot: {shot}")

for p in TESTS:
  test_one(p)
