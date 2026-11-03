/**
 * Documented prompt per standard preset so a preset runs as loaded (雁 2026-11-04).
 * Every entry is copied verbatim from an accepted real-gen run, an official example, or a repo acceptance doc;
 * `source` says which. Never invent prompts here.
 */
export type RecipePrompt = { prompt: string; negative?: string; source: string };
export const PRESET_RECIPE_PROMPTS: Record<string, RecipePrompt> = {
  "std-modelscope-t2i": {
    "prompt": "A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography",
    "source": "accepted run hist_1793695144423_1ms48 (docs/evidence/t7-modelscope-cn-acceptance.md)"
  },
  "std-modelscope-ai-t2i": {
    "prompt": "A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography",
    "source": "accepted run hist_1793706156544_8obck (docs/evidence/t7-modelscope-ai-acceptance.md)"
  },
  "std-tensorart-t2i": {
    "prompt": "Outfit: ((long flowing ivory-white dress:1.5)), lightweight semi-sheer fabric, soft translucent layers, off-shoulder neckline, long flowing sleeves, elegant draped silhouette, delicate gauzy texture, romantic ethereal design, fabric flowing naturally around the body Hair: ((long dark brown hair:1.45)), soft naturally wavy dark brown hair, long hair falling over the shoulders and down the back, loose face-framing strands, slightly tousled texture, natural movement, subtle warm highlights from the sunlight Face: ((soft ethereal feminine features:1.4)), delicate youthful face, large fuchsia red eyes, natural eyelashes, gentle rosy cheeks, small refined nose, glossy natural pink lips, peaceful dreamy expression, eyes softly closed or looking upward, serene romantic mood Accessories: ((small white flower hair accessory:1.4)), single delicate white flower tucked behind the ear, minimal jewelry, simple natural styling Pose: standing gracefully beside a shallow stream, body turned slightly sideways, head tilted upward toward the light, one hand raised near the face, the other arm relaxed naturally, flowing dress trailing around the body, peaceful elegant posture Props: ((small glowing water feature:1.35)), narrow stream of sparkling water flowing beside her, bright water droplets catching the sunlight, smooth pale stones surrounding the water Background: ((quiet natural rocky stream:1.45)), dark mossy rocks, shallow clear water, scattered pale stones, subtle greenery, secluded forest-like environment, peaceful hidden garden atmosphere Lighting: ((strong backlighting:1.55)), intense sunlight shining from behind the subject, dramatic glowing rim light around the hair and dress, dreamy overexposed highlights, sparkling reflections on the water, soft atmospheric haze, luminous white glow Photography: ((dreamy candid outdoor photograph:1.45)), strong natural lens flare, slightly overexposed exposure, soft focus, glowing highlights, subtle film grain, realistic digital camera texture, nostalgic Japanese photography aesthetic, ethereal summer atmosphere, natural imperfect composition",
    "source": "accepted run hist_1793693239642_fo6ux = tensor.art/images/1053306608244813366 recipe",
    "negative": "(worst quality:2), (low quality:2), (normal quality:1.8), lowres, blurry, jpeg artifacts, pixelated, noisy, grainy, watermark, logo, text, signature, username, copyright, censored, cropped, out of frame, bad anatomy, bad proportions, malformed anatomy, deformed, disfigured, mutated, mutation, ugly, poorly drawn, poorly rendered, bad face, asymmetrical face, bad hands, bad fingers, malformed hands, fused fingers, missing fingers, extra fingers, six fingers, four fingers, extra arms, missing arms, extra legs, missing legs, twisted fingers, broken fingers, disconnected limbs, floating limbs, duplicated limbs, long fingers, short fingers, mutated hands, malformed nails, missing nails, cross-eyed, lazy eye, wonky eyes, mismatched eyes, asymmetrical eyes, extra eyes, missing eyes, bad pupils, blurry eyes, dead eyes, bad mouth, bad teeth, malformed lips, extra mouth, missing mouth, distorted nose, extra nose, duplicate, cloned face, twin, multiple people, multiple girls, extra person, oversaturated, overexposed, underexposed, harsh shadows, unnatural lighting, flat lighting, low contrast, bad perspective, distorted body, stretched body, compressed body, messy hair, floating hair, extra hair, hair covering eyes, tangled hair, bad clothes, fused clothes, clipping, floating accessories, broken accessories, extra accessories"
  },
  "std-wavespeed-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "accepted run hist_1793687045083_fuctj = civitai.com/images/33530948 recipe"
  },
  "std-replicate-t2i": {
    "prompt": "style of 80s cyberpunk, a portrait photo",
    "source": "replicate.com/black-forest-labs/flux-dev-lora official default_example"
  },
  "std-huggingface-t2i": {
    "prompt": "A weathered alpine observatory at blue hour, brass telescope beneath a crystal dome, windblown snow across stone steps, dramatic volumetric moonlight, ultra-detailed cinematic photograph",
    "source": "docs/evidence/t7-huggingface-current-acceptance.md"
  },
  "std-agnes-t2i": {
    "prompt": "A glass terrarium library suspended above a mossy canyon at dawn, tiny brass ladders, mist between miniature shelves, soft volumetric sunlight, intricate editorial illustration",
    "source": "docs/evidence/t7-agnes-acceptance.md (Agnes FE sample)"
  },
  "std-gemini-t2i": {
    "prompt": "Isometric cutaway of a tiny retro-futurist ramen shop inside a red train carriage, rainy Tokyo platform outside, warm lantern light, precise miniature details, product-visualization clarity",
    "source": "docs/evidence/t7-gemini-acceptance.md"
  },
  "std-modelslab-t2i": {
    "prompt": "a majestic lion resting on a savanna at sunset, cinematic lighting, 8k resolution",
    "source": "docs/evidence/t7-modelslab-acceptance.md"
  },
  "std-runware-t2i": {
    "prompt": "a minimalist coffee cup on a wooden table, soft morning light, hyperdetailed, 8k masterpiece",
    "source": "docs/evidence/t7-runware-acceptance.md"
  },
  "std-muapi-t2i": {
    "prompt": "A cute corgi living inside a house made of sushi, vibrant anime illustration, playful expression, crisp cel shading",
    "source": "docs/evidence/t7-muapi-acceptance.md"
  },
  "std-sensenova-t2i": {
    "prompt": "A biomechanical koi pond inside a brutalist museum atrium, mirrored black water, copper fins, skylight reflections, architectural photography, restrained monochrome palette",
    "source": "docs/evidence/t7-sensenova-acceptance.md"
  },
  "std-fal-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-together-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-deepinfra-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-nanogpt-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-krea-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-sogni-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-civitai-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-mage-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "no provider recipe; FLUX-family accepted recipe civitai.com/images/33530948 (flux-dev, hist_1793687045083_fuctj)"
  },
  "std-aimlapi-t2i": {
    "prompt": "A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography",
    "source": "no provider recipe; Z-Image-Turbo-family accepted run hist_1793695144423_1ms48"
  },
  "std-novita-t2i": {
    "prompt": "a majestic lion resting on a savanna at sunset, cinematic lighting, 8k resolution",
    "source": "no provider recipe; SD-family accepted sample docs/evidence/t7-modelslab-acceptance.md"
  },
  "std-venice-t2i": {
    "prompt": "a majestic lion resting on a savanna at sunset, cinematic lighting, 8k resolution",
    "source": "no provider recipe; SD-family accepted sample docs/evidence/t7-modelslab-acceptance.md"
  },
  "std-wavespeed-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-image-to-video official curl example"
  },
  "std-fal-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "no provider recipe; Wan I2V official example (wavespeed.ai wan-2.2-image-to-video docs)"
  },
  "std-muapi-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "no provider recipe; Wan I2V official example (wavespeed.ai wan-2.2-image-to-video docs)"
  },
  "std-civitai-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "no provider recipe; Wan I2V official example (wavespeed.ai wan-2.2-image-to-video docs)"
  },
  "std-replicate-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "no provider recipe; Wan I2V official example (wavespeed.ai wan-2.2-image-to-video docs)"
  },
  "std-novita-i2v": {
    "prompt": "A cinematic ocean wave at sunrise, highly detailed",
    "source": "no provider recipe; Wan I2V official example (wavespeed.ai wan-2.2-image-to-video docs)"
  }
};
