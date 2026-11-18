import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { I18nProvider } from '../../i18n/I18nProvider';
import type { LocalModel } from '../../lib/models';
import { InstalledGallery } from './InstalledGallery';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:vi.fn(()=>true),convertFileSrc:(path:string)=>`https://asset.localhost${path}`}));
const model=(name:string,extra:Partial<LocalModel>={}):LocalModel=>({name,category:'loras',path:`/models/loras/${name}`,size:1048576,info:null,...extra});
const fox=model('characters/fox.safetensors',{family:'sdxl',info:{sha256:'a',size:1,fetchedAt:1,civitai:{name:'Fox portrait',creator:'FixtureCreator',version:'v2',base:'SDXL',trainedWords:['foxface','portrait style'],preview:'https://image.civitai.com/fox.jpg',nsfw:true,category:'loras',modelId:1,versionId:1,modelType:'LORA'}}});
const lamp=model('lighting/lamp.safetensors',{family:'flux'});
function Host({models=[fox,lamp],onFetch,locked=false}:{models?:LocalModel[];onFetch?:(models:LocalModel[],missingOnly:boolean)=>void;locked?:boolean}) {
 const [selected,setSelected]=useState('');const [category,setCategory]=useState('loras');
 return <I18nProvider><InstalledGallery models={models} loaded root="/models" category={category} setCategory={setCategory} selected={selected} setSelected={setSelected} locked={locked} actions={null} feedback={null} onFetch={onFetch} renderDetail={()=>'Native model details'}/></I18nProvider>;
}
beforeEach(()=>{vi.mocked(invoke).mockReset().mockResolvedValue(undefined);localStorage.clear();localStorage.setItem('deas.locale.v1','en');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('opens the exact file, model version and creator through the native actions',()=>{
 render(<Host/>);
 fireEvent.click(screen.getByRole('button',{name:fox.name}));
 const dialog=within(screen.getByRole('dialog',{name:'Model details'}));
 fireEvent.click(dialog.getByRole('button',{name:fox.path}));
 fireEvent.click(dialog.getByRole('button',{name:'View on Civitai'}));
 fireEvent.click(dialog.getByRole('button',{name:'FixtureCreator'}));
 expect(invoke).toHaveBeenCalledWith('native_media_reveal',{path:fox.path});
 expect(invoke).toHaveBeenCalledWith('native_open_civitai_model',{modelId:1,versionId:1,nsfw:true});
 expect(invoke).toHaveBeenCalledWith('native_open_civitai_creator',{username:'FixtureCreator',nsfw:true});
 fireEvent.click(dialog.getByRole('button',{name:'Close model details'}));
 fireEvent.click(screen.getByRole('button',{name:lamp.name}));
 expect(screen.queryByRole('button',{name:'View on Civitai'})).toBeNull();
});

it('searches metadata and trigger words, filters folders and bases, and keeps favorites',async()=>{
 render(<Host/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Search installed models'}),{target:{value:'foxface'}});
 expect(screen.getByRole('button',{name:fox.name})).toBeTruthy();expect(screen.queryByRole('button',{name:lamp.name})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Clear search'}));
 fireEvent.click(screen.getByRole('treeitem',{name:'lighting'}));
 expect(screen.queryByRole('button',{name:fox.name})).toBeNull();expect(screen.getByRole('button',{name:lamp.name})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
 fireEvent.change(screen.getByLabelText('Base model'),{target:{value:'SDXL'}});
 expect(screen.queryByRole('button',{name:lamp.name})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
 fireEvent.click(screen.getByRole('button',{name:`Add ${fox.name} to favorites`}));
 fireEvent.click(screen.getByRole('button',{name:'Favorites'}));
 expect(screen.getByRole('button',{name:fox.name})).toBeTruthy();expect(screen.queryByRole('button',{name:lamp.name})).toBeNull();
 cleanup();render(<Host/>);
 expect(screen.getByRole('button',{name:`Remove ${fox.name} from favorites`}).getAttribute('aria-pressed')).toBe('true');
});

it('stores notes and multiword tags locally and searches them after a remount',async()=>{
 const view=render(<Host/>);fireEvent.click(screen.getByRole('button',{name:fox.name}));
 fireEvent.change(screen.getByLabelText('Personal notes'),{target:{value:'Works at strength 0.7 with soft light'}});
 fireEvent.change(screen.getByLabelText('Edit model tags'),{target:{value:'soft lighting, character, soft lighting'}});fireEvent.blur(screen.getByLabelText('Edit model tags'));
 await waitFor(()=>expect(localStorage.getItem('deas.pref.library.local.organization')).toContain('soft lighting'));
 view.unmount();render(<Host/>);fireEvent.change(screen.getByRole('textbox',{name:'Search installed models'}),{target:{value:'strength 0.7'}});
 expect(screen.queryByRole('button',{name:lamp.name})).toBeNull();fireEvent.click(screen.getByRole('button',{name:fox.name}));
 expect(screen.getByLabelText('Personal notes')).toHaveProperty('value','Works at strength 0.7 with soft light');
 expect(screen.getByLabelText('Edit model tags')).toHaveProperty('value','soft lighting, character');
});

it('bounds rendered cards and preserves list and mature-preview preferences',()=>{
 render(<Host models={[fox,...Array.from({length:64},(_,i)=>model(`model-${i}.pt`))]}/>);
 expect(document.querySelectorAll('.library-card')).toHaveLength(60);
 fireEvent.click(screen.getByRole('button',{name:'Show 5 more'}));expect(document.querySelectorAll('.library-card')).toHaveLength(65);
 expect(document.querySelector('.library-card.is-sensitive')).toBeTruthy();fireEvent.click(screen.getByLabelText('Blur mature previews'));expect(document.querySelector('.library-card.is-sensitive')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'List view'}));expect(document.querySelector('.library-card-grid.is-list')).toBeTruthy();
 cleanup();render(<Host/>);expect(screen.getByRole('button',{name:'List view'}).getAttribute('aria-pressed')).toBe('true');expect(screen.getByLabelText('Blur mature previews')).toHaveProperty('checked',false);
});

it('copies literal trigger words and filenames and reports clipboard refusal',async()=>{
 render(<Host/>);fireEvent.click(screen.getByRole('button',{name:fox.name}));
 fireEvent.click(screen.getByRole('button',{name:'Copy all'}));await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith('foxface, portrait style'));
 fireEvent.click(screen.getByRole('button',{name:'Copy filename'}));await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fox.name));
 vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
 fireEvent.click(screen.getByRole('button',{name:'foxface'}));expect(await screen.findByRole('alert')).toHaveProperty('textContent','Could not copy. Select and copy the text manually.');
 expect(invoke).toHaveBeenCalledWith('native_logs_library_error',{operation:'clipboard'});
 expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toContain('portrait style');
});

it('uses a placeholder for failed previews and reports only the fixed operation',async()=>{
 render(<Host/>);fireEvent.error(document.querySelector('img.download-preview')!);
 await waitFor(()=>expect(document.querySelector('img.download-preview')).toBeNull());
 expect(invoke).toHaveBeenCalledWith('native_logs_library_error',{operation:'preview'});
});

it('opens a model popup with IDs, navigates cards and closes without changing model files',async()=>{
 render(<Host/>);fireEvent.click(screen.getByRole('button',{name:fox.name}));
 const dialog=screen.getByRole('dialog',{name:'Model details'});
 expect(dialog.textContent).toContain(fox.path);expect(dialog.textContent).toContain('Version ID');
 expect(screen.getByRole('button',{name:'Previous model'})).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByRole('button',{name:'Next model'}));expect(dialog.textContent).toContain(lamp.path);
 fireEvent.click(screen.getByRole('button',{name:'Close model details'}));expect(screen.queryByRole('dialog',{name:'Model details'})).toBeNull();
 expect(vi.mocked(invoke).mock.calls.some(([name])=>name==='native_model_family_write'||name==='native_models_scan')).toBe(false);
});

it('prefers local raster covers and falls back to the remote preview on error',()=>{
 render(<Host models={[{...fox,localPreview:'/models/loras/characters/fox.preview.jpg'}]}/>);
 const image=document.querySelector<HTMLImageElement>('.download-preview')!;
 expect(image.src).toBe('https://asset.localhost/models/loras/characters/fox.preview.jpg');
 fireEvent.error(image);
 expect(document.querySelector<HTMLImageElement>('.download-preview')!.src).toBe('https://image.civitai.com/fox.jpg');
 fireEvent.error(document.querySelector('.download-preview')!);
 expect(document.querySelector('.library-placeholder')).toBeTruthy();
 expect(document.querySelector('.library-browse [role="tablist"]')).toBeTruthy();
 expect(document.querySelector('.library-sidebar [role="tablist"]')).toBeNull();
});

it('fetches the whole matching collection rather than just rendered cards and respects folder scope',()=>{
 const onFetch=vi.fn();const models=[fox,lamp,...Array.from({length:64},(_,i)=>model(`lighting/light-${i}.pt`))];
 render(<Host models={models} onFetch={onFetch}/>);
 fireEvent.click(screen.getByRole('button',{name:'Fetch'}));
 expect(onFetch).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Start fetch'}));
 expect(onFetch).toHaveBeenLastCalledWith(expect.arrayContaining(models),true);
 expect(onFetch.mock.calls[0][0]).toHaveLength(66);
 fireEvent.click(screen.getByRole('treeitem',{name:'lighting'}));
 fireEvent.click(screen.getByRole('button',{name:'Fetch'}));
 fireEvent.change(screen.getByLabelText('Fetch scope'),{target:{value:'folder'}});
 fireEvent.click(screen.getByLabelText('Only missing metadata or previews'));
 fireEvent.click(screen.getByRole('button',{name:'Start fetch'}));
 expect(onFetch.mock.calls[1][0]).toHaveLength(65);expect(onFetch.mock.calls[1][1]).toBe(false);
});

it('remembers hidden folders, excludes descendants from search and Fetch, and restores them with the eye',()=>{
 const onFetch=vi.fn();const view=render(<Host onFetch={onFetch}/>);
 fireEvent.click(screen.getByRole('button',{name:'Hide characters folder'}));
 expect(screen.queryByRole('button',{name:fox.name})).toBeNull();expect(screen.getByRole('button',{name:lamp.name})).toBeTruthy();
 fireEvent.change(screen.getByRole('textbox',{name:'Search installed models'}),{target:{value:'foxface'}});
 expect(screen.queryByRole('button',{name:fox.name})).toBeNull();
 fireEvent.click(screen.getAllByRole('button',{name:'Clear filters'})[0]);
 expect(screen.queryByRole('button',{name:fox.name})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Fetch'}));fireEvent.change(screen.getByLabelText('Fetch scope'),{target:{value:'all'}});fireEvent.click(screen.getByRole('button',{name:'Start fetch'}));
 expect(onFetch).toHaveBeenCalledWith([lamp],true);
 view.unmount();render(<Host onFetch={onFetch}/>);
 expect(screen.queryByRole('button',{name:fox.name})).toBeNull();expect(screen.getByRole('button',{name:'Show characters folder'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Show characters folder'}));expect(screen.getByRole('button',{name:fox.name})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Hide All folders folder'}));expect(document.querySelectorAll('.library-card')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Show All folders folder'}));expect(document.querySelectorAll('.library-card')).toHaveLength(2);
});

it('View all automatically appends matching cards and remembers the toggle without a native request',async()=>{
 const models=Array.from({length:125},(_,i)=>model(`style-${i}.pt`));
 const view=render(<Host models={models}/>);expect(document.querySelectorAll('.library-card')).toHaveLength(60);
 fireEvent.click(screen.getByLabelText('View all'));
 await waitFor(()=>expect(document.querySelectorAll('.library-card')).toHaveLength(125));
 expect(screen.queryByRole('button',{name:/Show .* more/})).toBeNull();
 expect(invoke).not.toHaveBeenCalled();
 view.unmount();render(<Host models={models}/>);
 expect(screen.getByLabelText('View all')).toHaveProperty('checked',true);
 await waitFor(()=>expect(document.querySelectorAll('.library-card')).toHaveLength(125));
 fireEvent.click(screen.getByLabelText('View all'));
 await waitFor(()=>expect(document.querySelectorAll('.library-card')).toHaveLength(60));
});

it('adds a Library LoRA with a notice without opening a popup or starting work',()=>{
 render(<Host/>);fireEvent.click(screen.getByRole('button',{name:`Add to Studio LoRAs: ${fox.name}`}));
 expect(screen.getByRole('status').textContent).toContain('LoRA added');expect(screen.queryByRole('dialog')).toBeNull();
 const queue=JSON.parse(localStorage.getItem('deas.pref.studio.loraAddQueue')!);expect(queue).toHaveLength(1);expect(queue[0].model.path).toBe(fox.path);expect(invoke).not.toHaveBeenCalled();
});

it('adds LoRAs from the right-click menu and keeps metadata editing available',()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:vi.fn()});
 vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.setAttribute('open','');});
 render(<Host/>);const card=screen.getByRole('button',{name:fox.name});
 fireEvent.contextMenu(card);fireEvent.click(screen.getByRole('menuitem',{name:'Add to Studio LoRAs'}));
 expect(screen.getByRole('status').textContent).toContain('LoRA added');expect(screen.queryByRole('dialog')).toBeNull();
 expect(JSON.parse(localStorage.getItem('deas.pref.studio.loraAddQueue')!)[0].model.path).toBe(fox.path);
 fireEvent.contextMenu(card);const edit=screen.getByRole('menuitem',{name:'Edit meta…'});
 fireEvent.pointerDown(edit);fireEvent.click(edit);expect(screen.getByRole('dialog',{name:'Edit meta…'})).toBeTruthy();
});
it('does not add a locked Library LoRA and keeps keyboard metadata editing reachable',()=>{
 render(<Host locked/>);
 const add=screen.getByRole('button',{name:`Add to Studio LoRAs: ${fox.name}`});
 expect(add).toHaveProperty('disabled',true);fireEvent.click(add);
 expect(localStorage.getItem('deas.pref.studio.loraAddQueue')).toBeNull();
 fireEvent.contextMenu(screen.getByRole('button',{name:fox.name}));
 expect(screen.getByRole('menuitem',{name:'Add to Studio LoRAs'})).toHaveProperty('disabled',true);
 expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Edit meta…'}));
});

it('accepts nullable native LoRA metadata without persisting CivitAI payloads',()=>{
 const native=JSON.parse(JSON.stringify({...fox,metadataError:null,detectedFamily:null,familyOverride:null}));
 render(<Host models={[native]}/>);fireEvent.click(screen.getByRole('button',{name:`Add to Studio LoRAs: ${fox.name}`}));
 expect(screen.getByRole('status').textContent).toContain('LoRA added');
 const queue=JSON.parse(localStorage.getItem('deas.pref.studio.loraAddQueue')!);
 expect(queue[0].model.path).toBe(fox.path);expect(queue[0].model.info).toBeNull();
 expect(invoke).not.toHaveBeenCalled();
});

it('cancels nested metadata editing without dismissing the Library detail dialog',()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});
 render(<Host/>);fireEvent.click(screen.getByRole('button',{name:fox.name}));
 fireEvent.click(screen.getByRole('button',{name:'Edit meta…'}));
 fireEvent(screen.getByRole('dialog',{name:'Edit meta…'}),new Event('cancel',{cancelable:true,bubbles:true}));
 expect(screen.queryByRole('dialog',{name:'Edit meta…'})).toBeNull();
 expect(screen.getByRole('dialog',{name:'Model details'})).toBeTruthy();
 expect(invoke).not.toHaveBeenCalled();
});

it('shows persistence failures instead of an added notice',()=>{
 render(<Host/>);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
 fireEvent.click(screen.getByRole('button',{name:`Add to Studio LoRAs: ${fox.name}`}));
 expect(screen.getByRole('alert').textContent).toContain('Could not add the LoRA');expect(screen.queryByRole('status')).toBeNull();
});

it('Favorites sidebar ignores folder visibility and a folder click restores normal browsing',()=>{
 localStorage.setItem('deas.pref.library.local.organization',JSON.stringify({[fox.path]:{favorite:true}}));localStorage.setItem('deas.pref.library.local.hiddenFolders',JSON.stringify({'/models:loras':['characters']}));
 render(<Host/>);expect(screen.queryByRole('button',{name:fox.name})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Favorites'}));expect(screen.getByRole('button',{name:fox.name})).toBeTruthy();expect(screen.queryByRole('button',{name:lamp.name})).toBeNull();
 expect(screen.getByRole('button',{name:'Favorites'}).getAttribute('aria-current')).toBe('page');fireEvent.click(screen.getByRole('treeitem',{name:'All folders'}));expect(screen.queryByRole('button',{name:fox.name})).toBeNull();expect(screen.getByRole('button',{name:lamp.name})).toBeTruthy();
});
it('keeps bulk family controls out of Library',()=>{
 render(<Host/>);expect(screen.queryByRole('button',{name:'Select models'})).toBeNull();
});
