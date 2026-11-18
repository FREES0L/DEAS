import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { describeMedia, draggedItem, dropCssPoint, itemFromEntry, MEDIA_DRAG, type MediaItem } from '../../lib/media';
import { useI18n } from '../../i18n/I18nProvider';
import { ReferenceHeaderTools } from './ReferenceManagerWorkspace';
import { useDialogBackdropClose } from '../../components/useDialogBackdropClose';
import { MediaTileDrag } from '../media/MediaTileDrag';
import './continuity-overlay.css';
import './references-overlay.css';
import './reference-manager.css';

/** Modal shell: the media picker beside an editor (video `ReferencesPanel` or the image reference bar). */
export function ReferencesOverlay({ onClose, picker, children, pickerHint, manager=false, subtitle,imageEdit=false,onDropItems,dropPrompt }: { onClose:()=>void; picker:ReactNode; children:ReactNode; pickerHint?:string;manager?:boolean;subtitle?:string;imageEdit?:boolean;onDropItems?:(items:MediaItem[])=>void;dropPrompt?:ReactNode }) {
 const {t}=useI18n();
 const dialog=useRef<HTMLDialogElement>(null),close=useRef<HTMLButtonElement>(null);
 const title=useId();
 const [tools,setTools]=useState<HTMLDivElement|null>(null);
 const editor=useRef<HTMLElement>(null);
 const tileDrag=useRef<{item:MediaItem;id:number;x:number;y:number;started:boolean;thumbnail?:string;onOtherTarget:(target:Element|null)=>void}|null>(null);
 const [dragState,setDragState]=useState<'dragging'|'over'|null>(null);
 const [dropError,setDropError]=useState(false);
 const latest=useRef({onDropItems,imageEdit});latest.current={onDropItems,imageEdit};
 const receive=(items:MediaItem[])=>{
  const accepted=items.filter(item=>!!item.path&&(!latest.current.imageEdit||item.media==='image'));
  setDropError(accepted.length!==items.length||!accepted.length);
  if(accepted.length)latest.current.onDropItems?.(accepted);
 };
 const dropEnabled=!!onDropItems;
 const overEditor=(x:number,y:number)=>{
  const target=editor.current,rect=target?.getBoundingClientRect();
  return !!(target&&rect?.width&&rect.height&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom
   &&!Array.from(document.querySelectorAll('dialog[open]')).some(modal=>!modal.contains(target)));
 };
 // Native file drops and tile gestures use separate inputs. WebView2 can intercept HTML drag-and-drop.
 const startTileDrag=(item:MediaItem,e:PointerEvent<HTMLButtonElement>,onOtherTarget:(target:Element|null)=>void)=>{
  if(e.button!==0||!e.isPrimary||e.pointerType==='touch'||!item.path||dropPrompt)return;
  const image=e.currentTarget.querySelector('img');
  const thumbnail=image?.currentSrc||image?.src||(item.media==='image'?item.src:undefined);
  tileDrag.current={item,id:e.pointerId,x:e.clientX,y:e.clientY,started:false,thumbnail,onOtherTarget};
 };
 const cancelTileDrag=()=>{
  const drag=tileDrag.current;
  tileDrag.current=null;
  setDragState(null);
  if(drag&&dialog.current?.hasPointerCapture?.(drag.id))dialog.current.releasePointerCapture(drag.id);
 };
 const moveTileDrag=(e:PointerEvent<HTMLDialogElement>)=>{
  const drag=tileDrag.current;
  if(!drag||drag.id!==e.pointerId)return;
  if(!(e.buttons&1)){cancelTileDrag();return;}
  if(!drag.started){
   if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
   e.currentTarget.setPointerCapture?.(e.pointerId);
   drag.started=true;
  }
  e.preventDefault();
  e.currentTarget.style.setProperty('--tile-drag-x',`${e.clientX}px`);
  e.currentTarget.style.setProperty('--tile-drag-y',`${e.clientY}px`);
  setDragState(overEditor(e.clientX,e.clientY)?'over':'dragging');
 };
 const finishTileDrag=(e:PointerEvent<HTMLDialogElement>)=>{
  const drag=tileDrag.current;
  if(!drag||drag.id!==e.pointerId)return;
  cancelTileDrag();
  if(!drag.started||dropPrompt)return;
  e.preventDefault();
  if(overEditor(e.clientX,e.clientY))receive([drag.item]);
  else drag.onOtherTarget(document.elementFromPoint?.(e.clientX,e.clientY)??null);
 };
 useEffect(()=>{
  window.addEventListener('blur',cancelTileDrag);
  return()=>window.removeEventListener('blur',cancelTileDrag);
 },[]);
 useEffect(()=>{
  if(!dropEnabled||!isTauri())return;
  let alive=true,stop:(()=>void)|undefined,logged=false;
  const report=()=>{
   if(!alive)return;
   setDropError(true);
   if(!logged){logged=true;void invoke('native_logs_reference_media_error').catch(()=>{});}
  };
  void (async()=>getCurrentWebview().onDragDropEvent(event=>{
   if(!alive||event.payload.type!=='drop')return;
   const {x,y}=dropCssPoint(event.payload.position);
   if(!overEditor(x,y))return;
   void describeMedia(event.payload.paths.slice(0,16)).then(entries=>{
    if(alive)receive(entries.flatMap(entry=>{const item=itemFromEntry(entry);return item?[item]:[];}));
   },report);
  }))().then(unlisten=>{if(alive)stop=unlisten;else unlisten();},report);
  return()=>{alive=false;stop?.();};
 },[dropEnabled]);
 useEffect(()=>{
  const el=dialog.current!;el.showModal();close.current?.focus();
  return()=>{if(el.open)el.close();};
 },[]);
 const dismiss=()=>{if(dialog.current?.open)dialog.current.close();onClose();};
 const backdrop=useDialogBackdropClose(dismiss);
 return <dialog ref={dialog} {...backdrop} className="continuity-overlay references-overlay" data-reference-manager={manager||undefined} data-image-edit={imageEdit||undefined} data-tile-drag={dragState??undefined} aria-labelledby={title}
  onPointerMove={moveTileDrag} onPointerUp={finishTileDrag} onPointerCancel={cancelTileDrag} onLostPointerCapture={cancelTileDrag}
  onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();if(tileDrag.current)cancelTileDrag();else dismiss();}}>
  <header className="continuity-overlay-header"><div className="references-dialog-title"><h2 id={title}>{t('studio.run.dock.references')}</h2>{manager&&subtitle&&<span className="references-model-badge">{subtitle}</span>}</div>{manager&&<div className="references-header-tools" ref={setTools}/>}
   <button ref={close} type="button" className={manager?'wb-dock-action':undefined} onClick={dismiss}>{t('studio.close')}</button></header>
  <div className="references-overlay-body">
   <section className="references-picker" aria-label={t('studio.run.dock.media')}>{!manager&&<p className="media-help">{pickerHint??t('studio.run.video.pickerHint')}</p>}
    <MediaTileDrag.Provider value={dropEnabled?startTileDrag:null}>{picker}</MediaTileDrag.Provider></section>
   <section ref={editor} className="references-editor" aria-label={t('studio.run.dock.references')}
    onDragOverCapture={e=>{if(dropEnabled&&e.dataTransfer.types.includes(MEDIA_DRAG))e.preventDefault();}}
    onDropCapture={e=>{if(!dropEnabled||!(e.target instanceof Node)||!e.currentTarget.contains(e.target))return;const item=draggedItem(e.dataTransfer);if(item){e.preventDefault();e.stopPropagation();receive([item]);}}}>
    {dropError&&<p role="alert" className="reference-feedback">{t('studio.run.reference.dropUnavailable')}</p>}
    <ReferenceHeaderTools.Provider value={manager?tools:null}>{children}{dropPrompt}</ReferenceHeaderTools.Provider></section>
  </div>
  {dragState&&tileDrag.current&&<div className="reference-drag-preview" aria-hidden="true">
   {tileDrag.current.thumbnail?<img draggable={false} alt="" src={tileDrag.current.thumbnail}/>:<span className="reference-drag-glyph">{tileDrag.current.item.media==='audio'?'♪':tileDrag.current.item.media==='video'?'▶':'◇'}</span>}
   <span className="reference-drag-name">{tileDrag.current.item.name}</span>
  </div>}
  {manager&&<footer className="references-dialog-footer"><p>{t('studio.run.video.referencesLayoutHint')}</p><button type="button" className="wb-dock-action" onClick={dismiss}>{t('studio.run.video.referencesDone')}</button></footer>}
 </dialog>;
}
