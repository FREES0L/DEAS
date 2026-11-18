import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { bundledCatalog, I18nProvider } from '../../i18n/I18nProvider';
import { matchEntries, searchIndex } from '../../lib/search';
import { StartupPanel } from './StartupPanel';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:vi.fn(()=>true)}));
let job:unknown=null;let bench:unknown={jobs:[]};
const presets={speed:{flags:['--use-ck-attention'],fast:['fp16_accumulation']},compatibility:{flags:[],fast:[]},off:{flags:[],fast:[]}};
beforeEach(()=>{localStorage.clear();localStorage.setItem('deas.locale.v1','en');vi.mocked(isTauri).mockReturnValue(true);job=null;bench={jobs:[]};
 vi.mocked(invoke).mockImplementation(async(c,a)=>c==='native_startup_read'?{startup:{preset:'speed',flags:[],fast:[]},packages:[],presets,partner_flag:true}:c==='native_job_current'?job:c==='native_workbench_current'?bench:(a as {startup:unknown}).startup);});
afterEach(()=>{cleanup();vi.resetAllMocks();});
const mount=(onRestart=vi.fn())=>{render(<I18nProvider><StartupPanel root="/env" onRestart={onRestart}/></I18nProvider>);return onRestart;};

it('defaults to Speed+, shows its resolved flags and saves presets by name', async()=>{
 const onRestart=mount();
 const attention=await screen.findByRole('combobox',{name:'Attention backend'}) as HTMLSelectElement;
 expect(screen.getByRole('button',{name:'Speed+'}).getAttribute('aria-pressed')).toBe('true');
 expect(attention.value).toBe('--use-ck-attention');
 expect((screen.getByRole('checkbox',{name:/^Autotune/}) as HTMLInputElement).checked).toBe(false);
 const apply=screen.getByRole('button',{name:'Apply (restarts backend)'}) as HTMLButtonElement;
 expect(apply.disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Optimizations off'}));
 expect(attention.value).toBe('');
 fireEvent.click(apply);
 await screen.findByText(/^Saved\. A running backend restarts/);
 expect(vi.mocked(invoke)).toHaveBeenCalledWith('native_startup_write',{root:'/env',startup:{preset:'off',flags:[],fast:[]}});
 expect(onRestart).toHaveBeenCalledOnce();
});

it('manually opts into autotune as custom flags and restarts only without a running job', async()=>{
 const onRestart=mount();
 const attention=await screen.findByRole('combobox',{name:'Attention backend'});
 expect((screen.getByRole('option',{name:/^Sage · needs sageattention/}) as HTMLOptionElement).disabled).toBe(true);
 expect(screen.queryByRole('checkbox',{name:/cuBLAS|Async/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Compatibility'}));
 expect((screen.getByRole('checkbox',{name:/^Autotune/}) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole('checkbox',{name:/^Autotune/}));
 fireEvent.click(screen.getByRole('checkbox',{name:/^Keep models in VRAM/}));
 expect(screen.getByText('Custom settings.')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Compatibility'}).getAttribute('aria-pressed')).toBe('false');
 job={state:'running'};
 fireEvent.click(screen.getByRole('button',{name:'Apply (restarts backend)'}));
 await screen.findByText(/A job is running/);
 expect(vi.mocked(invoke)).toHaveBeenCalledWith('native_startup_write',{root:'/env',startup:{flags:['--highvram'],fast:['autotune']}});
 expect(onRestart).not.toHaveBeenCalled();
 fireEvent.change(attention,{target:{value:'--use-ck-attention'}});
 await waitFor(()=>expect((attention as HTMLSelectElement).value).toBe('--use-ck-attention'));
 });

it('keeps paid API nodes disabled by default, saves an explicit opt-in and survives a preset switch', async()=>{
 mount();
 await screen.findByRole('combobox',{name:'Attention backend'});
 const box=screen.getByRole('checkbox',{name:'Disable partner nodes (paid API models)'}) as HTMLInputElement;
 expect(box.checked).toBe(true);
 expect(box.disabled).toBe(false);
 expect(screen.getByText(/Removes ComfyUI.s paid API nodes/)).toBeTruthy();
 fireEvent.click(box);
 const apply=screen.getByRole('button',{name:'Apply (restarts backend)'}) as HTMLButtonElement;
 expect(apply.disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Compatibility'}));
 expect((screen.getByRole('checkbox',{name:'Disable partner nodes (paid API models)'}) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(apply);
 await screen.findByText(/^Saved\. A running backend restarts/);
 expect(vi.mocked(invoke)).toHaveBeenCalledWith('native_startup_write',{root:'/env',startup:{preset:'compatibility',flags:[],fast:[],disablePartnerNodes:false}});
});

it('greys the partner-node choice out and names the remedy when the core lacks the flag', async()=>{
 vi.mocked(invoke).mockImplementation(async(c,a)=>c==='native_startup_read'?{startup:{preset:'speed',flags:[],fast:[]},packages:[],presets,partner_flag:false}:c==='native_job_current'?job:c==='native_workbench_current'?bench:(a as {startup:unknown}).startup);
 mount();
 await screen.findByRole('combobox',{name:'Attention backend'});
 const box=screen.getByRole('checkbox',{name:'Disable partner nodes (paid API models)'}) as HTMLInputElement;
 expect(box.disabled).toBe(true);
 expect(screen.getByText(/needs a newer ComfyUI core/)).toBeTruthy();
});

it('indexes every Startup optimization so global search finds each backend option', async()=>{
 mount();
 await screen.findByRole('combobox',{name:'Attention backend'});
 (document.querySelector('[data-startup-advanced]') as HTMLDetailsElement).open=true;
 // The LRU size field only exists in LRU cache mode, like in the app itself.
 fireEvent.change(document.querySelector('[data-startup-field="cache"] select') as HTMLSelectElement,{target:{value:'lru'}});
 const entries=searchIndex.filter(e=>e.view==='backend'&&e.panel==='startup');
 expect(entries.length).toBeGreaterThanOrEqual(19);
 for(const entry of entries)expect(document.querySelector(entry.target),`${entry.label} ${entry.target}`).toBeTruthy();
 const text=(key:string)=>bundledCatalog.dictionaries.en[key];
 const hit=(query:string)=>matchEntries(searchIndex,query,text,searchIndex.length).map(e=>e.target);
 for(const [query,anchor] of [['speed+','[data-startup-presets]'],['attention backend','[data-startup-field="attention"]'],['autotune','[data-startup-fast="autotune"]'],['fp8','[data-startup-fast="fp8_matrix_mult"]'],['keep models in vram','[data-startup-check="highvram"]'],['reserve vram','[data-startup-field="reserveVram"]'],['black images','[data-startup-field="vae"]'],['diffusion model precision','[data-startup-field="unet"]'],['fp16 text encoder','[data-startup-check="fp16-text-enc"]'],['classic cache','[data-startup-field="cache"]'],['partner nodes','.startup-panel [data-startup-partner-nodes]']] as const)expect(hit(query),query).toContain(anchor);
 expect(hit('apply options')).toContain('[data-startup-apply]');
 const reason=searchIndex.find(e=>e.target==='[data-startup-field="cacheLru"]')!.reason!;
 expect(reason).toBe('search.reason.startupCacheLru');
 for(const locale of ['en','de','fr','ja','tr','zh'])expect(bundledCatalog.dictionaries[locale][reason],locale).toBeTypeOf('string');
 });

it('is reachable from global search at its own anchor', ()=>{
 const entry=searchIndex.find(e=>e.label==='startup.partnerNodes')!;
 expect(entry).toMatchObject({view:'backend',panel:'startup',target:'.startup-panel [data-startup-partner-nodes]'});
 const text=(key:string)=>bundledCatalog.dictionaries.en[key];
 for(const query of ['partner nodes','api nodes','paid models'])expect(matchEntries(searchIndex,query,text),query).toContain(entry);
 for(const locale of ['en','de','fr','ja','tr','zh']){const d=bundledCatalog.dictionaries[locale];for(const key of ['startup.partner','startup.partnerNodes','startup.partnerHelp','startup.partnerUnsupported'])expect(d[key],`${locale} ${key}`).toBeTruthy();}
 });

 it('does not restart over a running Workbench generation', async()=>{
 const onRestart=mount();
 await screen.findByRole('combobox',{name:'Attention backend'});
 bench={jobs:[{id:'w',state:'running'}]};
 fireEvent.click(screen.getByRole('button',{name:'Optimizations off'}));
 fireEvent.click(screen.getByRole('button',{name:'Apply (restarts backend)'}));
 await screen.findByText(/A job is running/);
 expect(onRestart).not.toHaveBeenCalled();
 });
