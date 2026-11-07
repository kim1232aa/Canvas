/**
 * Preset prompts are ONLY verbatim recipe originals (docs/evidence/workflow-presets-inventory-2026-10-17.md:118):
 * a filled-in recipe page or a user-specified prompt, never self-created, never an "official example" or
 * "accepted run", never borrowed across model families. `source` must be the recipe page URL.
 * A preset absent here loads with an EMPTY prompt; nothing fills it in.
 */
export type RecipePrompt = { prompt: string; negative?: string; source: string };
export const PRESET_RECIPE_PROMPTS: Record<string, RecipePrompt> = {
  "std-tensorart-t2i": {
    "prompt": "Outfit: ((long flowing ivory-white dress:1.5)), lightweight semi-sheer fabric, soft translucent layers, off-shoulder neckline, long flowing sleeves, elegant draped silhouette, delicate gauzy texture, romantic ethereal design, fabric flowing naturally around the body Hair: ((long dark brown hair:1.45)), soft naturally wavy dark brown hair, long hair falling over the shoulders and down the back, loose face-framing strands, slightly tousled texture, natural movement, subtle warm highlights from the sunlight Face: ((soft ethereal feminine features:1.4)), delicate youthful face, large fuchsia red eyes, natural eyelashes, gentle rosy cheeks, small refined nose, glossy natural pink lips, peaceful dreamy expression, eyes softly closed or looking upward, serene romantic mood Accessories: ((small white flower hair accessory:1.4)), single delicate white flower tucked behind the ear, minimal jewelry, simple natural styling Pose: standing gracefully beside a shallow stream, body turned slightly sideways, head tilted upward toward the light, one hand raised near the face, the other arm relaxed naturally, flowing dress trailing around the body, peaceful elegant posture Props: ((small glowing water feature:1.35)), narrow stream of sparkling water flowing beside her, bright water droplets catching the sunlight, smooth pale stones surrounding the water Background: ((quiet natural rocky stream:1.45)), dark mossy rocks, shallow clear water, scattered pale stones, subtle greenery, secluded forest-like environment, peaceful hidden garden atmosphere Lighting: ((strong backlighting:1.55)), intense sunlight shining from behind the subject, dramatic glowing rim light around the hair and dress, dreamy overexposed highlights, sparkling reflections on the water, soft atmospheric haze, luminous white glow Photography: ((dreamy candid outdoor photograph:1.45)), strong natural lens flare, slightly overexposed exposure, soft focus, glowing highlights, subtle film grain, realistic digital camera texture, nostalgic Japanese photography aesthetic, ethereal summer atmosphere, natural imperfect composition",
    "negative": "(worst quality:2), (low quality:2), (normal quality:1.8), lowres, blurry, jpeg artifacts, pixelated, noisy, grainy, watermark, logo, text, signature, username, copyright, censored, cropped, out of frame, bad anatomy, bad proportions, malformed anatomy, deformed, disfigured, mutated, mutation, ugly, poorly drawn, poorly rendered, bad face, asymmetrical face, bad hands, bad fingers, malformed hands, fused fingers, missing fingers, extra fingers, six fingers, four fingers, extra arms, missing arms, extra legs, missing legs, twisted fingers, broken fingers, disconnected limbs, floating limbs, duplicated limbs, long fingers, short fingers, mutated hands, malformed nails, missing nails, cross-eyed, lazy eye, wonky eyes, mismatched eyes, asymmetrical eyes, extra eyes, missing eyes, bad pupils, blurry eyes, dead eyes, bad mouth, bad teeth, malformed lips, extra mouth, missing mouth, distorted nose, extra nose, duplicate, cloned face, twin, multiple people, multiple girls, extra person, oversaturated, overexposed, underexposed, harsh shadows, unnatural lighting, flat lighting, low contrast, bad perspective, distorted body, stretched body, compressed body, messy hair, floating hair, extra hair, hair covering eyes, tangled hair, bad clothes, fused clothes, clipping, floating accessories, broken accessories, extra accessories",
    "source": "https://tensor.art/images/1053306608244813366"
  },
  "std-huggingface-t2i": {
    "prompt": "t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.",
    "source": "https://civitai.red/images/113739497"
  },
  "std-modelscope-ai-t2i": {
    "prompt": "t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.",
    "source": "https://civitai.red/images/113739497"
  },
  "std-modelscope-t2i": {
    "prompt": "t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.",
    "source": "https://civitai.red/images/113739497"
  },
  "std-aimlapi-t2i": {
    "prompt": "t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.",
    "source": "https://civitai.red/images/113739497"
  },
  "std-sogni-t2i": {
    "prompt": "extreme overhead fisheye perspective of a cyberpunk girl, oversized bright blue eye looking up, dark blue braided hair, complex white mechanical headset with exposed colorful wires, chartreuse shirt, tilted white building, solid blue sky, bold ink outlines, flat vibrant colors, comic illustration",
    "negative": "watermark,copyrights",
    "source": "https://civitai.red/images/142361732"
  },
  "std-fal-t2i": {
    "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
    "source": "https://huggingface.co/krea/Krea-2-LoRA-retroanime"
  },
  "std-wavespeed-t2i": {
    "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
    "source": "https://huggingface.co/krea/Krea-2-LoRA-retroanime"
  },
  "std-muapi-t2i": {
    "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
    "source": "https://huggingface.co/krea/Krea-2-LoRA-retroanime"
  },
  "std-civitai-i2v": {
    "prompt": "summer",
    "source": "https://civitai.red/images/111400580"
  },
  // Ostris HF model card widget verbatim ("orbit 180 around an astronaut on the moon."); card also notes trigger word `orbit 360`.
  "std-fal-i2v": {
    "prompt": "orbit 180 around an astronaut on the moon.",
    "source": "https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora"
  },
  // Dustin2050 HF model card Wavespeed API Quick Start verbatim prompt (includes trigger word `lexy_vox`).
  "std-wavespeed-i2v": {
    "prompt": "lexy_vox, gentle head turn, warm smile, natural movement",
    "source": "https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2"
  },
  // Cseti HF model card widget[0].text verbatim (includes trigger word `Banostasis concept` and recommended transition structure).
  "std-fal-t2v": {
    "prompt": "Banostasis concept, a cinematic sequence of quick scene transitions of musical instruments dissolving into fragments of sound waves, which then condense into glowing orbs of light, the sequence of changes includes the transitions between a concert hall, a crowded subway tunnel, and an open desert plain, shot with rapid lens push-ins and kaleidoscopic lighting shifts, stylized in synesthetic neon abstract art.",
    "source": "https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1"
  },
  // Dustin2050 HF model card Wavespeed API Quick Start verbatim prompt (includes trigger word `lexy_vox`).
  "std-wavespeed-t2v": {
    "prompt": "lexy_vox, close-up portrait, warm smile, natural daylight, sharp focus",
    "source": "https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2"
  },
  // Civitai Wan 2.2 T2V LoRA 2247725@2530788 images[0].meta.prompt / negativePrompt verbatim.
  "std-civitai-t2v": {
    "prompt": "(PBRSty1e, 3d animation), caucasian woman, shiny skin, realistic style. . bride, white wedding dres, hair: Black hair, joy with clear indications of ecstasy, long shot",
    "negative": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，(child),(teen),(youth)",
    "source": "https://civitai.com/api/v1/model-versions/2530788"
  },
  // OpenMOSS MOSS-Image-Base HF model card Quick Start verbatim prompt (matches seed=42, steps=50, cfg=3.0, 1024x1024).
  "std-nanogpt-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  // Civitai official Krea v2 orchestration recipe (krea.md) verbatim prompt.
  "std-civitai-t2i": {
    "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
    "source": "https://developer.civitai.com/orchestration/recipes/krea.md"
  },
  // Krea model card has no negative field on this endpoint; prompt is the card's own preview caption.
  "std-krea-t2i": {
    "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
    "source": "https://huggingface.co/krea/Krea-2-LoRA-retroanime"
  },
  // Runware Krea 2 Turbo docs example "Converted Water Tower Living Room" (verbatim positivePrompt).
  "std-runware-t2i": {
    "prompt": "High-end real-estate interior photography of a decommissioned 1960s concrete water tower converted into an extraordinary circular residence. Show the main living room occupying the full round tank: honest curved board-formed concrete walls, a shallow ribbed concrete ceiling, and a continuous band of slim panoramic windows overlooking a dense European city at blue hour. Compose from the edge of the room with a wide but natural architectural perspective, emphasizing the sweeping curve of the space while keeping vertical lines straight. A low crescent-shaped rust velvet sofa faces a sculptural blackened-steel fireplace; cobalt lounge chairs, a round travertine coffee table, a large hand-knotted cream rug, walnut cabinetry, and restrained contemporary art create a sophisticated warm interior. Include a compact reading nook integrated beneath the windows and subtle evidence of the original industrial structure, including restored steel braces and one sealed pipe connection used as a display niche. Soft amber concealed lighting grazes the textured concrete, balanced with cool indigo dusk through the glazing; practical lamps are gently illuminated, with realistic reflections and nuanced shadow detail. Immaculately staged but believable, quiet and inviting, tactile materials, editorial architectural photography, photorealistic, crisp natural detail, broad dynamic range, no people, no signs, no lettering, no fisheye distortion, no duplicated furniture. Finished standalone property-marketing image in 3:2 landscape composition.",
    "source": "https://runware.ai/docs/models/krea-2-turbo"
  },
  // Same opened MOSS-Image card prompt, reused only where the endpoint has no LoRA trigger of its own.
  "std-together-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-deepinfra-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-agnes-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-sensenova-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-modelslab-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-gemini-t2i": {
    "prompt": "A wide view of a refrigerator beside a kitchen counter with a fruit bowl. A small sticky note on the refrigerator door is handwritten in Chinese:\n\"记得买牛奶和鸡蛋！\n牛奶两盒，鸡蛋一打。\n顺便带一袋面包。\"",
    "source": "https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base"
  },
  "std-mage-t2i": {
    "prompt": "Outfit: ((long flowing ivory-white dress:1.5)), lightweight semi-sheer fabric, soft translucent layers, off-shoulder neckline, long flowing sleeves, elegant draped silhouette, delicate gauzy texture, romantic ethereal design, fabric flowing naturally around the body Hair: ((long dark brown hair:1.45)), soft naturally wavy dark brown hair, long hair falling over the shoulders and down the back, loose face-framing strands, slightly tousled texture, natural movement, subtle warm highlights from the sunlight Face: ((soft ethereal feminine features:1.4)), delicate youthful face, large fuchsia red eyes, natural eyelashes, gentle rosy cheeks, small refined nose, glossy natural pink lips, peaceful dreamy expression, eyes softly closed or looking upward, serene romantic mood Accessories: ((small white flower hair accessory:1.4)), single delicate white flower tucked behind the ear, minimal jewelry, simple natural styling Pose: standing gracefully beside a shallow stream, body turned slightly sideways, head tilted upward toward the light, one hand raised near the face, the other arm relaxed naturally, flowing dress trailing around the body, peaceful elegant posture Props: ((small glowing water feature:1.35)), narrow stream of sparkling water flowing beside her, bright water droplets catching the sunlight, smooth pale stones surrounding the water Background: ((quiet natural rocky stream:1.45)), dark mossy rocks, shallow clear water, scattered pale stones, subtle greenery, secluded forest-like environment, peaceful hidden garden atmosphere Lighting: ((strong backlighting:1.55)), intense sunlight shining from behind the subject, dramatic glowing rim light around the hair and dress, dreamy overexposed highlights, sparkling reflections on the water, soft atmospheric haze, luminous white glow Photography: ((dreamy candid outdoor photograph:1.45)), strong natural lens flare, slightly overexposed exposure, soft focus, glowing highlights, subtle film grain, realistic digital camera texture, nostalgic Japanese photography aesthetic, ethereal summer atmosphere, natural imperfect composition",
    "source": "https://tensor.art/images/1053306608244813366"
  }
};
