import {it,expect} from 'vitest';
import {describeApiFailure} from './apiFailure';
it('distinguishes app 200 from upstream 403 and explains a challenge without guessing balance',()=>{
 const data={ok:false,tensorart:{error:'catalog failed',status:403},executionTrace:[{status:403,endpoint:'https://tensor.art/models/',responseBody:'<html>challenges.cloudflare.com cf_chl</html>'}]};
 const text=describeApiFailure(200,data,'/api/models');
 expect(text).toContain('上游 HTTP 403 / 网站 HTTP 200');
 expect(text).toContain('人机验证');
 expect(text).toContain('https://tensor.art/models/');
});
it('does not invent an upstream HTTP code when no response was received',()=>{
 const text=describeApiFailure(502,{error:'connect failed',executionTrace:[{status:null,endpoint:'https://example.com'}]},'/api/models');
 expect(text).toContain('network');expect(text).not.toContain('上游 HTTP');
});
it('keeps local validation distinct from an upstream rejection',()=>{
 expect(describeApiFailure(400,{errorSource:'local',error:'模型为必填项'},'/api/generate')).toContain('local · 网站 HTTP 400');
});
