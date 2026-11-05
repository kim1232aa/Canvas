import json
import time

PROVIDERS_TEST = [
  {
    "provider": "muapi",
    "name": "MuAPI",
    "model": "z-image-turbo-text-to-image-lora",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "wavespeed",
    "name": "WaveSpeed",
    "model": "wavespeed-ai/z-image/turbo",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "sogni",
    "name": "Sogni",
    "model": "krea-2-turbo",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "krea",
    "name": "Krea",
    "model": "image/krea/krea-2/medium",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "together",
    "name": "Together",
    "model": "black-forest-labs/FLUX.1-schnell",
    "expected": "BLOCKED_AUTH"
  },
  {
    "provider": "aimlapi",
    "name": "AIMLAPI",
    "model": "flux/schnell",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "novita",
    "name": "Novita",
    "model": "realisticVisionV40_v40VAE-inpainting_81543.safetensors",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "venice",
    "name": "Venice",
    "model": "venice-sd35",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "deepinfra",
    "name": "DeepInfra",
    "model": "black-forest-labs/FLUX-1-dev",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "replicate",
    "name": "Replicate",
    "model": "black-forest-labs/flux-schnell",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "mage",
    "name": "Mage",
    "model": "mango-v3",
    "expected": "PASS_BILLING"
  },
  {
    "provider": "sensenova",
    "name": "SenseNova",
    "model": "sensenova-u1.5-lite",
    "expected": "BLOCKED_CONFIG"
  }
]

print("Starting UI E2E test sequence for providers...")
results = {}

for p in PROVIDERS_TEST:
  p_id = p["provider"]
  m_id = p["model"]
  print(f"\n=== Testing {p['name']} ({p_id}) ===")

  # 1. Select provider
  js(f"""
  (() => {{
    const ckpt = document.getElementById('node-std-huggingface-t2i-ckpt');
    const sel = ckpt.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(sel, '{p_id}');
    sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }})()
  """)
  time.sleep(1)

  # 2. Set custom model if needed or select model
  js(f"""
  (() => {{
    const ckpt = document.getElementById('node-std-huggingface-t2i-ckpt');
    const selects = ckpt.querySelectorAll('select');
    if (selects.length > 1) {{
      const modelSel = selects[1];
      const opt = [...modelSel.options].find(o => o.value === '{m_id}' || o.value.includes('{m_id}'));
      if (opt) {{
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
        setter.call(modelSel, opt.value);
        modelSel.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }}
    }}
    // Also fill custom model input if present
    const customInput = [...ckpt.querySelectorAll('input')].find(i => i.placeholder?.includes('自定义') || i.parentElement?.innerText?.includes('自定义模型'));
    if (customInput) {{
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(customInput, '{m_id}');
      customInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
      customInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
    }}
  }})()
  """)
  time.sleep(1)

  # 3. Click Run
  js("""
  (() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('运行：保存图像'));
    if (btn) btn.click();
  })()
  """)
  print(f"Clicked Run for {p_id}")

  # 4. Wait for toast or node status
  toast_msg = ""
  for _ in range(8):
    time.sleep(1)
    toasts = js("""
    (() => {
      return [...document.querySelectorAll('[class*="toast"], [class*="alert"], [class*="banner"]')].map(t => t.innerText.trim()).filter(Boolean);
    })()
    """)
    if toasts:
      toast_msg = " | ".join(toasts)
      break

  # 5. Screenshot
  shot_path = f"/root/github/ComfyUI Web Studio/.tower/worktrees/wt-4/temp/e2e/2026-11-05/schema5b/ui-{p_id}.png"
  capture_screenshot(shot_path)
  print(f"Result for {p_id}: toast='{toast_msg[:120]}'")

  # Close any modal if opened
  js("""
  (() => {
    const closeBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('关闭') || b.innerText.includes('Close') || b.innerText === '✕');
    if (closeBtn) closeBtn.click();
  })()
  """)
  time.sleep(0.5)

print("\nUI E2E test sequence completed.")
