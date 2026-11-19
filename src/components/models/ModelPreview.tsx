import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useEffect, useState, type ReactNode } from 'react';
import type { LocalModel } from '../../lib/models';
import { reportLibraryError } from '../../features/downloads/libraryDiagnostics';

const VIDEO=/\.(mp4|webm)$/i;
/** Video covers become a cached native still: the WebView never decodes the video itself. */
const stills=new Map<string,Promise<string>>();
function still(path:string){let s=stills.get(path);if(!s){s=invoke<string>('native_media_reference_thumbnail',{path,seconds:0}).then(p=>typeof p==='string'&&p?convertFileSrc(p):Promise.reject(new Error('no still')));s.catch(()=>stills.delete(path));stills.set(path,s);}return s;}

/** Reuse indexed local images first, then cached CivitAI URLs; never starts a model scan/fetch. */
export function ModelPreview({model,className,fallback}:{model?:LocalModel;className?:string;fallback:ReactNode}) {
 const video=!!model?.localPreview&&VIDEO.test(model.localPreview);
 const [frame,setFrame]=useState<{path:string;src?:string}>();
 useEffect(()=>{const path=video?model!.localPreview!:undefined;if(!path){setFrame(undefined);return;}let alive=true;setFrame({path});still(path).then(src=>{if(alive)setFrame({path,src});},()=>{if(alive){setFrame({path,src:''});reportLibraryError('preview');}});return()=>{alive=false;};},[video,model?.localPreview,model?.previewRevision]);
 const asset=video?(frame?.path===model?.localPreview?frame?.src:undefined):model?.localPreview?convertFileSrc(model.localPreview):undefined,local=asset&&model?.previewRevision&&!video?`${asset}${asset.includes('?')?'&':'?'}deas_preview=${model.previewRevision}`:asset,remote=model?.info?.civitai?.preview;
 const [failed,setFailed]=useState<string[]>([]);
 useEffect(()=>setFailed([]),[local,remote,model?.previewRevision]);
 const pending=video&&frame?.src===undefined;
 const src=[local,pending?undefined:remote].find((url):url is string=>!!url&&!failed.includes(url));
 return src?<img className={className} src={src} alt="" loading="lazy" decoding="async" onError={()=>{setFailed(old=>[...old,src]);reportLibraryError('preview');}}/>:<>{fallback}</>;
}
