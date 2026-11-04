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
  "std-wavespeed-t2i": {
    "prompt": "A professional photograph of a quirky squirrel with a fiery red mohawk, energetically playing a whimsical drum set in a vibrant autumn forest. The drum kit is entirely imagined, with bass drums made from hollowed, oversized chestnuts that have been polished to a gleaming finish. The snare drum is crafted from a woven basket of intertwined twigs and leaves, producing a crisp, earthy sound. Cymbals are formed from large, dry maple leaves, their edges curled and textured, hanging on thin branch stands. Smaller acorns serve as tom-toms, and the hi-hat is composed of overlapping oak leaves, delicately stacked on a twig frame. Every element of the drum set is organic, blending seamlessly into the forest floor, which is blanketed in a rich layer of autumn leaves, as the squirrel’s paws expertly tap the instruments, filling the scene with the imagined rhythm of nature",
    "source": "https://civitai.red/images/33530948"
  },
  "std-huggingface-t2i": {
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
  "std-muapi-t2i": {
    "prompt": "c0l0ringb00k coloring book page, simple cute dragon, white background",
    "source": "https://civitai.red/images/31247708"
  },
  "std-replicate-t2i": {
    "prompt": "c0l0ringb00k coloring book page, simple cute dragon, white background",
    "source": "https://civitai.red/images/31247708"
  },
  "std-novita-t2i": {
    "prompt": "Astartes, silhouette, monochrome, greyscale, BREAK <lora:epi_noiseoffset2:0.65>, <lora:more_details:0.4>,",
    "negative": "BadDream, UnrealisticDream,",
    "source": "https://civitai.red/images/28785255"
  },
  "std-sogni-t2i": {
    "prompt": "extreme overhead fisheye perspective of a cyberpunk girl, oversized bright blue eye looking up, dark blue braided hair, complex white mechanical headset with exposed colorful wires, chartreuse shirt, tilted white building, solid blue sky, bold ink outlines, flat vibrant colors, comic illustration",
    "negative": "watermark,copyrights",
    "source": "https://civitai.red/images/142361732"
  },
  "std-fal-t2i": {
    "prompt": "c0l0ringb00k coloring book page, simple cute dragon, white background",
    "source": "https://civitai.red/images/31247708"
  }
};
