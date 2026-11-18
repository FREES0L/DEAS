import { useState } from 'react';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { LoraSetsDialog,type SelectedLora } from './LoraSetsDialog';
import type { LocalModel } from '../../lib/models';
const a={category:'loras',name:'a.safetensors',path:'/m/loras/a.safetensors',size:1,info:null};
function Host({root='/m',models=[a],initial=[{name:a.name,strength:.5}],usable=true,onClose=()=>{}}:{root?:string;models?:LocalModel[];initial?:SelectedLora[];usable?:boolean;onClose?:()=>void}){const [selected,setSelected]=useState(initial);return <I18nProvider><LoraSetsDialog root={root} models={models} selected={selected} onChange={setSelected} onClose={onClose} onBrowse={()=>{}} usable={()=>usable}/></I18nProvider>;}
beforeEach(()=>{localStorage.clear();localStorage.setItem('deas.locale.v1','en');Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(this:HTMLDialogElement){this.open=false;}});});afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('edits weights, saves, updates, renames, reloads across remount and deletes a set without deleting selected LoRAs',()=>{
 const view=render(<Host/>);fireEvent.change(screen.getByLabelText('Strength of a.safetensors'),{target:{value:'0.75'}});
 fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Look A'}});fireEvent.click(screen.getByRole('button',{name:'Save new set'}));
 fireEvent.change(screen.getByLabelText('Strength of a.safetensors'),{target:{value:'-0.25'}});fireEvent.click(screen.getByRole('button',{name:'Update selected set'}));
 fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Look B'}});fireEvent.click(screen.getByRole('button',{name:'Rename set'}));
 view.unmount();render(<Host initial={[]}/>);fireEvent.change(screen.getByLabelText('Saved sets'),{target:{value:screen.getByRole('option',{name:'Look B'}).getAttribute('value')}});fireEvent.click(screen.getByRole('button',{name:'Load set'}));
 expect(screen.getByLabelText('Strength of a.safetensors')).toHaveProperty('value','-0.25');
 fireEvent.click(screen.getByRole('button',{name:'Delete set'}));expect(screen.queryByRole('option',{name:'Look B'})).toBeNull();expect(screen.getByLabelText('Strength of a.safetensors')).toHaveProperty('value','-0.25');
});
it('lets a weight be typed one character at a time, including the decimal point and the minus sign',()=>{
 render(<Host initial={[{name:a.name,strength:1}]}/>);
 const field=screen.getByLabelText('Strength of a.safetensors') as HTMLInputElement;
 expect(field.value).toBe('1');
 field.focus();
 fireEvent.change(field,{target:{value:'0'}});
 fireEvent.change(field,{target:{value:''}});            // the browser reports "" while "0." is typed
 expect(field.value).toBe('');                           // the in-progress text survives the re-render
 fireEvent.change(field,{target:{value:'0.5'}});
 fireEvent.blur(field);
 expect(field.value).toBe('0.5');
 field.focus();
 fireEvent.change(field,{target:{value:'-0.25'}});
 fireEvent.blur(field);
 expect(field.value).toBe('-0.25');
 field.focus();
 fireEvent.change(field,{target:{value:'50'}});          // outside the allowed range
 fireEvent.blur(field);
 expect(field.value).toBe('-0.25');                      // repaired instead of stored
});

it('keeps sets scoped to their model folder and blocks missing files from replacing selections',()=>{
 const view=render(<Host/>);fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Saved'}});fireEvent.click(screen.getByRole('button',{name:'Save new set'}));view.unmount();
 const other=render(<Host root="/other"/>);expect(screen.queryByRole('option',{name:'Saved'})).toBeNull();other.unmount();
 render(<Host models={[]} initial={[]}/>);fireEvent.change(screen.getByLabelText('Saved sets'),{target:{value:screen.getByRole('option',{name:'Saved'}).getAttribute('value')}});
 expect(screen.getByRole('button',{name:'Load set'})).toHaveProperty('disabled',true);expect(screen.getByText('Missing or incompatible: a.safetensors')).toBeTruthy();
});
it('saves and reloads disabled missing LoRAs without validating them or enabling them',()=>{
 const view=render(<Host initial={[{name:a.name,strength:.5},{name:'missing.pt',strength:.7,enabled:false}]}/>);
 fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Disabled missing'}});
 fireEvent.click(screen.getByRole('button',{name:'Save new set'}));
 expect(screen.queryByText('Missing or incompatible: missing.pt')).toBeNull();
 view.unmount();render(<Host initial={[]}/>);
 fireEvent.change(screen.getByLabelText('Saved sets'),{target:{value:screen.getByRole('option',{name:'Disabled missing'}).getAttribute('value')}});
 expect(screen.getByRole('button',{name:'Load set'})).toHaveProperty('disabled',false);
 fireEvent.click(screen.getByRole('button',{name:'Load set'}));
 expect(screen.getByRole('button',{name:'Enable missing.pt'}).getAttribute('aria-pressed')).toBe('false');
 expect(screen.getByLabelText('Strength of missing.pt')).toHaveProperty('value','0.7');
});
it('rejects malformed saved weights',()=>{
 localStorage.setItem('deas.pref.studio.loraSets',JSON.stringify([{id:'bad',name:'Bad',root:'/m',loras:[{...a,strength:11}]}]));render(<Host/>);expect(screen.queryByRole('option',{name:'Bad'})).toBeNull();
});
it('shows previews and loads present other-family LoRAs as a draft while retaining warnings',()=>{
 const previewModel={...a,info:{sha256:'',size:1,fetchedAt:1,civitai:{modelId:1,versionId:1,name:'A',version:'1',modelType:'LORA',category:'loras',nsfw:false,trainedWords:[],preview:'https://example.invalid/a.jpg'}}};
 const view=render(<Host usable={false} models={[previewModel]}/>);
 expect(view.container.ownerDocument.querySelector('.lora-set-preview img')?.getAttribute('src')).toBe('https://example.invalid/a.jpg');
 fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Other family'}});fireEvent.click(screen.getByRole('button',{name:'Save new set'}));
 fireEvent.click(screen.getByRole('button',{name:'Remove a.safetensors'}));expect(screen.getByRole('button',{name:'Load set'})).toHaveProperty('disabled',false);
 fireEvent.click(screen.getByRole('button',{name:'Load set'}));expect(screen.getByLabelText('Strength of a.safetensors')).toHaveProperty('value','0.5');expect(screen.getAllByText('Missing or incompatible: a.safetensors')).toHaveLength(2);
});
it('opens cached details and trigger words above the picker; Escape preserves the picker draft and restores focus',()=>{
 const close=vi.fn(),model={...a,info:{sha256:'',size:1,fetchedAt:1,civitai:{modelId:1,versionId:2,name:'Portrait style',version:'v2',base:'Anima',modelType:'LORA',category:'loras',nsfw:false,trainedWords:['portrait_style','warm light'],preview:'https://example.invalid/a.jpg'}}};
 render(<Host models={[model]} onClose={close}/>);fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Draft set'}});
 const thumbnail=screen.getByRole('button',{name:'Details for a.safetensors'});thumbnail.focus();fireEvent.click(thumbnail);
 const details=screen.getByRole('dialog',{name:'LoRA details'});expect(within(details).getByText('portrait_style')).toBeTruthy();expect(within(details).getByText('warm light')).toBeTruthy();expect(within(details).getByText('Anima')).toBeTruthy();expect(within(details).getByText('/m/loras/a.safetensors')).toBeTruthy();
 fireEvent(details,new Event('cancel',{bubbles:true,cancelable:true}));expect(screen.queryByRole('dialog',{name:'LoRA details'})).toBeNull();
 expect(close).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'Selected LoRAs and sets'})).toBeTruthy();expect(screen.getByLabelText('Set name')).toHaveProperty('value','Draft set');expect(document.activeElement).toBe(thumbnail);
 fireEvent.click(thumbnail);fireEvent.click(within(screen.getByRole('dialog',{name:'LoRA details'})).getByRole('button',{name:'Close'}));expect(screen.getByLabelText('Strength of a.safetensors')).toHaveProperty('value','0.5');
});
it('retains order, weights and enabled flags in saved sets and supports keyboard reordering',()=>{
 const b={...a,name:'b.safetensors',path:'/m/loras/b.safetensors'};
 const view=render(<Host models={[a,b]} initial={[{name:a.name,strength:.25},{name:b.name,strength:.8}]}/>);
 fireEvent.keyDown(screen.getByRole('button',{name:'Reorder b.safetensors'}),{key:'ArrowUp'});
 expect([...document.querySelectorAll('[data-lora-row]')].map(row=>row.getAttribute('data-lora-row'))).toEqual([b.name,a.name]);
 fireEvent.click(screen.getByRole('button',{name:'Disable b.safetensors'}));
 expect(document.querySelector('[data-lora-row="b.safetensors"]')?.classList.contains('is-disabled')).toBe(true);
 expect(screen.getByLabelText('Strength of b.safetensors')).toHaveProperty('value','0.8');
 fireEvent.change(screen.getByLabelText('Set name'),{target:{value:'Ordered'}});fireEvent.click(screen.getByRole('button',{name:'Save new set'}));
 view.unmount();render(<Host models={[a,b]} initial={[]}/>);
 fireEvent.change(screen.getByLabelText('Saved sets'),{target:{value:screen.getByRole('option',{name:'Ordered'}).getAttribute('value')}});fireEvent.click(screen.getByRole('button',{name:'Load set'}));
 expect([...document.querySelectorAll('[data-lora-row]')].map(row=>row.getAttribute('data-lora-row'))).toEqual([b.name,a.name]);
 expect(screen.getByRole('button',{name:'Enable b.safetensors'}).getAttribute('aria-pressed')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Enable b.safetensors'}));expect(screen.getByLabelText('Strength of b.safetensors')).toHaveProperty('value','0.8');
});
