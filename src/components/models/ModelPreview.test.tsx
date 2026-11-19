import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ModelPreview } from './ModelPreview';
import type { LocalModel } from '../../lib/models';
vi.mock('@tauri-apps/api/core',()=>({convertFileSrc:(path:string)=>'asset://'+path,isTauri:()=>true,invoke:vi.fn(async()=>{})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const model:LocalModel={category:'loras',name:'a.safetensors',path:'/models/a',size:1,localPreview:'/previews/a.jpg',info:{sha256:'',size:1,fetchedAt:1,civitai:{modelId:1,versionId:1,name:'A',version:'1',modelType:'LORA',category:'loras',nsfw:false,trainedWords:[],preview:'https://example.invalid/a.png'}}};
it('uses indexed JPG previews, falls back on failure and logs only the operation',()=>{
 const view=render(<ModelPreview model={model} fallback={<span>No preview</span>}/>);
 expect(view.container.querySelector('img')).toHaveProperty('src','asset:///previews/a.jpg');
 fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')).toHaveProperty('src','https://example.invalid/a.png');
 fireEvent.error(view.container.querySelector('img')!);expect(screen.getByText('No preview')).toBeTruthy();
 expect(vi.mocked(invoke).mock.calls).toEqual([['native_logs_library_error',{operation:'preview'}],['native_logs_library_error',{operation:'preview'}]]);
 view.rerender(<ModelPreview model={{...model,localPreview:'/previews/b.webp'}} fallback={<span>No preview</span>}/>);
 expect(view.container.querySelector('img')).toHaveProperty('src','asset:///previews/b.webp');
});
it('retries a previously failed cover after explicit refresh without changing provider URLs',()=>{
 const view=render(<ModelPreview model={model} fallback={<span>No preview</span>}/>);
 fireEvent.error(view.container.querySelector('img')!);fireEvent.error(view.container.querySelector('img')!);
 expect(screen.getByText('No preview')).toBeTruthy();
 view.rerender(<ModelPreview model={{...model,previewRevision:123}} fallback={<span>No preview</span>}/>);
 expect(view.container.querySelector('img')).toHaveProperty('src','asset:///previews/a.jpg?deas_preview=123');
 fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')).toHaveProperty('src','https://example.invalid/a.png');
});
it('shows a video cover as a native still frame and falls back when extraction fails',async()=>{
 vi.mocked(invoke).mockImplementation(async(cmd:string,args?:unknown)=>cmd==='native_media_reference_thumbnail'?((args as {path:string}).path.endsWith('ok.mp4')?'/cache/still.png':Promise.reject(new Error('ffmpeg'))):undefined);
 const view=render(<ModelPreview model={{...model,localPreview:'/previews/ok.mp4'}} fallback={<span>No preview</span>}/>);
 expect(screen.getByText('No preview')).toBeTruthy();
 await vi.waitFor(()=>expect(view.container.querySelector('img')).toHaveProperty('src','asset:///cache/still.png'));
 expect(vi.mocked(invoke)).toHaveBeenCalledWith('native_media_reference_thumbnail',{path:'/previews/ok.mp4',seconds:0});
 view.rerender(<ModelPreview model={{...model,localPreview:'/previews/bad.mp4'}} fallback={<span>No preview</span>}/>);
 await vi.waitFor(()=>expect(view.container.querySelector('img')).toHaveProperty('src','https://example.invalid/a.png'));
});
