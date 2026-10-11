import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {transform} from 'esbuild';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createMediaStore} from './mediaStore';
import crypto from 'node:crypto';
import {storageError} from './mediaContract';

const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const dirs: string[] = [];
afterEach(() => {vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir,{recursive:true,force:true});});
const temporary = () => {const dir=mkdtempSync(path.join(os.tmpdir(),'media-index-review-')); dirs.push(dir); return dir;};
async function evaluate(text: string, scope: Record<string, any>, ending: string) {
 const code=(await transform(text+'\n'+ending,{loader:'ts',format:'cjs'})).code;
 return new Function(...Object.keys(scope),code)(...Object.values(scope));
}

describe('actual local storage blocks', () => {
 it('keeps the first backup, publishes JSON atomically, and throws before updating memory', async () => {
   const dir=temporary(), file=path.join(dir,'history.json');
   const old=[{id:'old',url:'https://example.test/a'}]; writeFileSync(file,JSON.stringify(old));
   const mediaStore=createMediaStore(path.join(dir,'media'));
   const block=source.slice(source.indexOf('// Helper methods to read/write JSON files safely'),source.indexOf('const defaultKeys:'));
   const io = {...fs};
   const scope:any={fs:io,path,mediaStore,crypto,storageError,PROJECTS_FILE:path.join(dir,'projects.json'),HISTORY_FILE:file,SETTINGS_FILE:path.join(dir,'settings.json'),console:{log:()=>{},error:()=>{}}};
   const {migrateStoredMedia,writeJsonFile}=await evaluate(block,scope,'return {migrateStoredMedia,writeJsonFile};');
   const initial='first backup evidence'; writeFileSync(file+'.bak-before-media-migration',initial);
   const incoming=[{id:'new',url:'data:image/png;base64,AQID'}];
   migrateStoredMedia('history',file,incoming);
   expect(readFileSync(file+'.bak-before-media-migration','utf8')).toBe(initial);
   const intact=readFileSync(file,'utf8');
   io.renameSync=()=>{throw Object.assign(new Error('ENOSPC fixture'),{code:'ENOSPC'});};
   expect(()=>writeJsonFile(file,[{id:'failed'}])).toThrow(/ENOSPC/);
   expect(readFileSync(file,'utf8')).toBe(intact);
 });
 it('Express 4 history Layer catches a media IO failure and delegates a storage error', async () => {
   const handlers:any[]=[];
   const app={post:(_path:string,handler:any)=>handlers.push(handler)};
   const block=source.slice(source.indexOf('const MAX_HISTORY_ITEM_BYTES'),source.indexOf("app.delete('/api/history/:id'"));
   await evaluate(block,{app,externalizeMedia:()=>{throw Object.assign(new Error('ENOSPC fixture'),{errorSource:'storage'});},generationHistory:[],MAX_HISTORY_COUNT:500,writeJsonFile:()=>{},sanitizeGenerationMetadata:(x:any)=>x},'');
   const layerModule='express/lib/router/layer.js';
   const Layer=(await import(layerModule)).default;
   const next=vi.fn(); const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
   new Layer('/',{},handlers[0]).handle_request({body:{url:'data:image/png;base64,AQID'}},response,next);
   await new Promise(resolve=>setTimeout(resolve,10));
   expect(next).toHaveBeenCalledWith(expect.objectContaining({errorSource:'storage',message:'ENOSPC fixture'}));
 });
});
