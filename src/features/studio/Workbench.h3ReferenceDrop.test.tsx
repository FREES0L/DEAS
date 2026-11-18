import { choosePipe, evidence, h3VideoFiles, pipe, sharedNativeDrops, videoEvidence } from './Workbench.testHarness';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { I18nProvider } from '../../i18n/I18nProvider';
import { scanModels } from '../../lib/models';
import { checkRecipePrerequisites } from '../../lib/recipePrerequisites';
import { Workbench } from './Workbench';

const roots={models:'/fixture/models',input:'/fixture/input'};
const entry=(name:string,media:'image'|'video'|'audio',path=roots.input+'/'+name)=>
 ({name,path,kind:'file',media,size:1,modified:1,symlink:false});
const left=entry('left.png','image');
const secondImage=entry('second.png','image');
const external=[entry('clip.mp4','video','/external/clip.mp4'),entry('voice.wav','audio','/external/voice.wav'),
 entry('source.png','image','/external/source.png')];
const mount=(endpoint=evidence.baseUrl)=>render(<I18nProvider><Workbench endpoint={endpoint} ownedBackend root="/fixture/env" roots={roots}/></I18nProvider>);
function setup(){
 vi.mocked(scanModels).mockResolvedValue(h3VideoFiles());
 vi.mocked(checkRecipePrerequisites).mockResolvedValue(videoEvidence);
 vi.mocked(invoke).mockImplementation(async(command,args)=>{
  if(command==='native_media_list')return {path:roots.input,entries:[left,secondImage],truncated:false};
  if(command==='native_media_describe')return (args as {paths:string[]}).paths.map(path=>external.find(entry=>entry.path===path)!);
  return null;
 });
}
const open=()=>{
 fireEvent.click(document.querySelector('[data-open-references]')!);
 return screen.getByRole('dialog',{name:'References'});
};
const mockEditorBounds=(dialog:HTMLElement)=>{
 vi.spyOn(dialog.querySelector('.references-editor')!,'getBoundingClientRect').mockReturnValue(
  {left:100,top:100,right:350,bottom:400,width:250,height:300,x:100,y:100,toJSON:()=>({})});
};
const dropInternal=async(dialog:HTMLElement,name=left.name,{x=150,y=150}={})=>{
 mockEditorBounds(dialog);
 const tile=await within(dialog).findByRole('button',{name});
 expect(tile.getAttribute('draggable')).toBe('false');
 const pointer=(target:HTMLElement,type:string,clientX:number,clientY:number,buttons:number)=>{
  fireEvent(target,Object.assign(new Event(type,{bubbles:true,cancelable:true}),
   {pointerId:1,isPrimary:true,pointerType:'mouse',button:0,buttons,clientX,clientY}));
 };
 pointer(tile,'pointerdown',50,150,1);
 expect(dialog.querySelector('.reference-drag-preview')).toBeNull();
 pointer(dialog,'pointermove',x,y,1);
 expect(dialog.querySelector('.reference-drag-preview')?.textContent).toContain(name);
 pointer(dialog,'pointerup',x,y,0);
 expect(dialog.querySelector('.reference-drag-preview')).toBeNull();
};
const dropExternal=async(dialog:HTMLElement,paths:string[])=>{
 mockEditorBounds(dialog);
 await act(async()=>{for(const handler of sharedNativeDrops)handler({payload:{type:'drop',paths,position:{x:150,y:150}}});});
 expect(invoke).toHaveBeenCalledWith('native_media_describe',{paths});
};
const role=(dialog:HTMLElement,value:string,kind:'video'|'image')=>{
 const assignment=within(dialog).getByRole('dialog',{name:'Assign dropped file'});
 const chooser=within(assignment).getByRole('combobox',{name:'Input roles'});
 fireEvent.change(chooser,{target:{value}});
 fireEvent.click(assignment.querySelector(`[data-${kind}-role="${value}"]`)!);
};
const layoutStored=()=>localStorage.getItem('deas.pref.studio.h3ReferenceDrafts.v1');
const assignmentRoles=(dialog:HTMLElement)=>within(within(dialog).getByRole('dialog',{name:'Assign dropped file'}))
 .getAllByRole('option').map(option=>(option as HTMLOptionElement).value);

test('H3 video assigns internal and native drops by media type and reopens with saved references',async()=>{
 setup();const view=mount();
 await waitFor(()=>expect(pipe('Text → Video').disabled).toBe(false));
 choosePipe('Text → Video');
 let dialog=open();
 await dropInternal(dialog,left.name,{x:70,y:150});
 expect(within(dialog).queryByRole('dialog',{name:'Assign dropped file'})).toBeNull();
 await dropInternal(dialog);
 expect(within(dialog).getByText('Choose a role for this file.')).toBeTruthy();
 expect(dialog.querySelector('[data-ref]')).toBeNull();
 role(dialog,'reference','video');
 expect(dialog.querySelector('[data-ref="left.png"]')).toBeTruthy();
 await dropInternal(dialog,secondImage.name);
 expect(dialog.querySelector('[data-ref="second.png"]')).toBeTruthy();
 expect(within(dialog).queryByRole('dialog',{name:'Assign dropped file'})).toBeNull();
 await dropExternal(dialog,[external[2],...external.slice(0,2)].map(item=>item.path));
 expect(dialog.querySelector('[data-ref="source.png"]')).toBeTruthy();
 expect(dialog.querySelector('[data-ref="clip.mp4"]')).toBeNull();
 expect(assignmentRoles(dialog)).toEqual(['reference','source']);
 role(dialog,'reference','video');
 expect(dialog.querySelector('[data-ref="clip.mp4"]')).toBeTruthy();
 expect(dialog.querySelector('[data-ref="voice.wav"]')).toBeNull();
 expect(assignmentRoles(dialog)).toEqual(['reference']);
 role(dialog,'reference','video');
 expect(dialog.querySelector('[data-ref="voice.wav"]')).toBeTruthy();
 await waitFor(()=>expect(layoutStored()).toContain('/external/voice.wav'));
 expect(layoutStored()).not.toContain('asset://');
 view.unmount();mount("http://127.0.0.1:7802/");
 await waitFor(()=>expect(document.querySelector('[data-open-references]')).toBeTruthy());
 dialog=open();
 for(const name of ['left.png','second.png','source.png','clip.mp4','voice.wav'])expect(dialog.querySelector(`[data-ref="${name}"]`)).toBeTruthy();
 expect(within(dialog).queryByRole('button',{name:'Ask for image roles'})).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:'Clear'}));
 await dropInternal(dialog);
 expect(within(dialog).getByRole('dialog',{name:'Assign dropped file'})).toBeTruthy();
});

test('H3 frame roles appear in the Images lane and can be removed independently',async()=>{
 setup();mount();
 await waitFor(()=>expect(pipe('Text → Video').disabled).toBe(false));
 choosePipe('Text → Video');
 const dialog=open();
 const images=dialog.querySelector('[data-reference-lane="image"]')!;
 await dropInternal(dialog);
 role(dialog,'both','video');
 for(const position of ['first','last']){
  const card=images.querySelector(`[data-video-role-card="${position}"]`);
  expect(card?.querySelector('img')?.alt).toBe(left.name);
 }
 expect(images.querySelector('.reference-empty')).toBeNull();
 expect(images.querySelector('[data-ref]')).toBeNull();
 fireEvent.click(images.querySelector('[data-video-role-remove="first"]')!);
 expect(images.querySelector('[data-video-role-card="first"]')).toBeNull();
 expect(images.querySelector('[data-video-role-card="last"]')).toBeTruthy();
 fireEvent.click(images.querySelector('[data-video-role-remove="last"]')!);
 expect(images.querySelector('.reference-empty')).toBeTruthy();
});

test('H3 Image Edit offers separate source and reference roles and restores both',async()=>{
 setup();const view=mount();
 await waitFor(()=>expect(pipe('Image → Image').disabled).toBe(false));
 choosePipe('Image → Image');
 let dialog=open();
 await dropInternal(dialog);
 expect(dialog.querySelector('[data-reference-source] img')).toBeNull();
 role(dialog,'reference','image');
 expect(dialog.querySelector('[data-reference-controls] img')?.getAttribute('alt')).toBe(left.name);
 expect(dialog.querySelector('[data-reference-source] img')).toBeNull();
 await dropInternal(dialog,secondImage.name);
 expect(dialog.querySelectorAll('[data-reference-controls] img')).toHaveLength(2);
 expect(within(dialog).queryByRole('dialog',{name:'Assign dropped file'})).toBeNull();
 expect(within(dialog).queryByRole('button',{name:'Ask for image roles'})).toBeNull();
 for(const remove of dialog.querySelectorAll('[data-reference-remove]'))fireEvent.click(remove);
 await dropExternal(dialog,[external[2].path]);
 role(dialog,'source','image');
 expect(dialog.querySelector('[data-reference-source] img')?.getAttribute('alt')).toBe('source.png');
 await dropInternal(dialog);
 role(dialog,'reference','image');
 await waitFor(()=>expect(layoutStored()).toContain('/external/source.png'));
 view.unmount();mount();
 await waitFor(()=>expect(document.querySelector('[data-open-references]')).toBeTruthy());
 dialog=open();
 expect(dialog.querySelector('[data-reference-source] img')?.getAttribute('alt')).toBe('source.png');
 expect(dialog.querySelector('[data-reference-controls] img')?.getAttribute('alt')).toBe(left.name);
});
