// The search category and repo name cannot prove an adapter's resource type.
export function isHuggingFaceLora(resource:{tags?:unknown}) {
 return Array.isArray(resource.tags) && resource.tags.some(tag=>typeof tag==='string'&&['lora','lycoris','locon','dora'].includes(tag.toLowerCase()));
}
