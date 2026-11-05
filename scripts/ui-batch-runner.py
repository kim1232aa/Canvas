import json
import time

TESTS = [
  {"id": "muapi", "model": "z-image-turbo-text-to-image-lora", "name": "MuAPI"},
  {"id": "wavespeed", "model": "wavespeed-ai/z-image/turbo", "name": "WaveSpeed"},
  {"id": "krea", "model": "image/krea/krea-2/medium", "name": "Krea"},
  {"id": "together", "model": "black-forest-labs/FLUX.1-schnell", "name": "Together"},
  {"id": "aimlapi", "model": "flux/schnell", "name": "AIMLAPI"},
  {"id": "novita", "model": "realisticVisionV40_v40VAE-inpainting_81543.safetensors", "name": "Novita"},
  {"id": "venice", "model": "venice-sd35", "name": "Venice"},
  {"id": "deepinfra", "model": "black-forest-labs/FLUX-1-dev", "name": "DeepInfra"},
  {"id": "replicate", "model": "black-forest-labs/flux-schnell", "name": "Replicate"},
  {"id": "mage", "model": "mango-v3", "name": "Mage"},
  {"id": "sensenova", "model": "sensenova-u1.5-lite", "name": "SenseNova"},
]

def run_provider(p):
  pid = p["id"]
  model = p["model"]
  print(f"\n>>> Running UI test for {p['name']} ({pid}) with model {model}...")

  # 1. Select provider
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

  # 2. Select or set model
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

  # 3. Click Run
  js("""
  (() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('运行：保存图像'));
    if (btn) btn.click();
  })()
  """)

  # 4. Wait for node error or status update
  error_text = ""
  for _ in range(12):
    time.sleep(1)
    status = js("""
    (() => {
      const samp = document.getElementById('node-std-huggingface-t2i-samp');
      const ckpt = document.getElementById('node-std-huggingface-t2i-ckpt');
      const errEl = document.querySelector('[class*="border-rose"], [class*="bg-rose"], .text-rose-400, .text-red-400');
      return {
        sampError: samp ? ([...samp.querySelectorAll('[class*="rose"], [class*="red"]')].map(e => e.textContent || '').join(' ') || samp.innerText.slice(0, 100)) : '',
        errElText: errEl ? (errEl.textContent || '').slice(0, 150) : ''
      };
    })()
    """)
    if status.get("sampError") and any(w in status["sampError"] for w in ["Error", "error", "400", "401", "402", "403", "404", "500", "502", "INSUFFICIENT", "balance", "funds", "credit", "未配置"]):
      error_text = status["sampError"]
      break
    if status.get("errElText"):
      error_text = status["errElText"]
      break

  # 5. Capture screenshot
  shot = f"/root/github/ComfyUI Web Studio/.tower/worktrees/wt-4/temp/e2e/2026-11-05/schema5b/ui-{pid}.png"
  capture_screenshot(shot)
  print(f">>> {p['name']} finished. Error text: {error_text.strip()[:100]}. Screenshot: {shot}")

for p in TESTS:
  try:
    run_provider(p)
  except Exception as e:
    print(f"Error testing {p['name']}: {e}")

print("\nAll UI tests completed!")
