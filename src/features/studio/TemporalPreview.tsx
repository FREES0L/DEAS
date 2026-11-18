import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { TemporalPreviewData } from '../../lib/jobs';
import { NativeVideo, nativeVideo } from './NativeVideo';

type Props={preview:TemporalPreviewData;active:boolean;label:string;fallback?:string};
export function TemporalPreview(props:Props) {
 if(!props.active)return props.fallback?<img src={props.fallback} alt={props.label}/>:null;
 return <TemporalPreviewPlayback {...props}/>;
}

function TemporalPreviewPlayback({preview,label,fallback}:Props) {
 const [playing,setPlaying]=useState(preview);
 const [finished,setFinished]=useState(false);
 if(finished&&playing.revision!==preview.revision){
  setPlaying(preview);
  setFinished(false);
 }
 return <TemporalPreviewRevision key={playing.revision} preview={playing} label={label} fallback={fallback} onFinished={()=>setFinished(true)}/>;
}

function TemporalPreviewRevision({preview,label,fallback,onFinished}:Omit<Props,'active'>&{onFinished:()=>void}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const [video,setVideo]=useState<string>();
 const [failed,setFailed]=useState(false);
 const owner=useRef('');
 const fail=()=>{setFailed(true);onFinished();if(isTauri())void invoke('native_video_update',{id:owner.current,action:{kind:'previewError'}}).catch(()=>{});};
 useEffect(()=>{
  let disposed=false,frame=0;
  owner.current=crypto.randomUUID();
  setFailed(false);setVideo(undefined);
  if(preview.video){
   if(!nativeVideo())void invoke<string>('native_video_open',{id:owner.current,source:preview.video,autoPlay:true,repeat:false,muted:true}).then(src=>{if(!disposed)setVideo(src);},()=>{if(!disposed)fail();});
  }else{
   const context=canvas.current?.getContext('2d');
   if(!context){fail();return;}
   const frames=preview.frames;
   const images=frames.map(f=>{const image=new Image();image.src=f.src;return image;});
   const loads=images.map(image=>new Promise<void>((resolve,reject)=>{if(image.complete&&image.naturalWidth)resolve();else{image.onload=()=>resolve();image.onerror=reject;}}));
   void Promise.all(loads).then(()=>{
    if(disposed||!context)return;
    let start:number|undefined;
    const total=frames.reduce((sum,f)=>sum+f.durationMs,0);
    const paint=(now:number)=>{
     if(disposed)return;
     start??=now;
     const finished=now-start>=total;
     let elapsed=now-start,index=0;
     while(index<frames.length-1&&elapsed>=frames[index].durationMs){elapsed-=frames[index].durationMs;index++;}
     context.drawImage(images[index],0,0,preview.width,preview.height);
     if(finished)onFinished();
     else frame=requestAnimationFrame(paint);
    };
    frame=requestAnimationFrame(paint);
   },()=>{if(!disposed)fail();});
   return()=>{disposed=true;cancelAnimationFrame(frame);images.forEach(image=>{image.onload=null;image.onerror=null;image.src='';});};
  }
  return()=>{disposed=true;cancelAnimationFrame(frame);};
 },[preview.revision]);
 if(failed)return fallback?<img src={fallback} alt={label}/>:null;
 if(preview.video){
  if(nativeVideo())return <NativeVideo source={preview.video} label={label} autoPlay muted onStatus={status=>{if(status.error)fail();else if(status.ended)onFinished();}}/>;
  return video?<video src={video} aria-label={label} autoPlay muted playsInline onEnded={onFinished} onError={fail}/>:fallback?<img src={fallback} alt={label}/>:null;
 }
 return <canvas ref={canvas} width={preview.width} height={preview.height} role="img" aria-label={label}/>;
}
