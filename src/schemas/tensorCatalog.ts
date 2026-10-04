// Official public directory links inspected at https://tensor.art/models/ on 2026-10-03.
// These are community pages, not an undocumented TAMS list API.
export const TENSOR_CATALOG_SOURCE='https://tensor.art/models/';
export const TENSOR_CATALOG_TAGS=[
 ['all','全部推荐'],['officialModel','官方模型'],['illustrious','Illustrious'],['flux','FLUX'],['anime','动漫'],['beauty','人物'],['male','男性'],['realistic','写实'],['style','风格'],['chinese','国风'],['sciFi','科幻'],['buildings','建筑'],['photography','摄影'],['scenery','风景'],['mecha','机甲'],['clothing','服饰'],['game','游戏'],['technology','科技'],['cartoon','卡通'],['animal','动物'],['3D','3D'],['25D','2.5D'],['vehicle','车辆'],['design','设计'],['food','食物'],['detail','细节'],
] as const;
export function tensorCatalogUrl(tag='all') {
 if(!TENSOR_CATALOG_TAGS.some(([value])=>value===tag))throw new Error('未知 Tensor 公共目录分类');
 return tag==='all'?TENSOR_CATALOG_SOURCE:`${TENSOR_CATALOG_SOURCE}?tag=${encodeURIComponent(tag)}`;
}
