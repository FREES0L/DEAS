import { invoke } from '@tauri-apps/api/core';
/** Installed models under the ComfyUI models folder; CivitAI metadata is cached natively beside each file. */
export interface ModelSettings { sampler?:string; scheduler?:string; steps?:number; cfgScale?:number; size?:string; clipSkip?:number }
export interface CivitaiInfo { description?:string; modelId:number; versionId:number; name:string; creator?:string; version:string; modelType:string; category:string; base?:string; nsfw:boolean; trainedWords:string[]; preview?:string; settings?:ModelSettings }
export interface ModelInfo { sha256:string; size:number; fetchedAt:number; civitai:CivitaiInfo|null }
/** `family` is effective (declaration or detection); metadataError blocks execution, even for unknown checkpoints. */
export type FamilyEvidence = 'header' | 'filename' | 'unresolved' | 'conflict';
export interface LocalModel { /** UI-only explicit refresh marker for local cover assets. */ previewRevision?:number; localPreview?:string; addedAt?:number; check?:import('./modelCheck').ModelCheck; category:string; name:string; path:string; size:number; info:ModelInfo|null; family?:string; detectedFamily?:string; /** ACE-Step automatic identity evidence, independent of manual declaration. */ familyEvidence?:FamilyEvidence; familyOverride?:string; metadataError?:string; /** Header-detected companion architecture; absent means unknown, not compatible. */ component?:string; /** `truncated` when the safetensors header covers payload the file does not hold. */ integrity?:string; /** ACE-Step all-in-one (embedded encoders + VAE) outside `checkpoints/`; ComfyUI loads it only from there. */ misplacedAllInOne?:boolean }
/** Restores the native browsing index; explicit refresh checks file fingerprints. Run validates live files separately. */
export const scanModels=(root:string,extraRoots:string[]=[],refresh=false)=>invoke<LocalModel[]>('native_models_scan',{root,...(extraRoots.length?{extraRoots}:{}),...(refresh?{refresh:true}:{})});
/** Hashes the file once (cached), asks CivitAI by hash and writes `<file>.deas.json`. */
export const fetchModelInfo=(path:string,authenticated:boolean,savePreview:boolean)=>invoke<LocalModel>('native_model_info',{path,authenticated,savePreview});
/** Explicit source-bound declaration only; null restores automatic detection. Never hashes or fetches. */
export const writeModelFamily=(path:string,family:string|null)=>invoke<LocalModel>('native_model_family_write',{path,family});
export type ModelFileChange={old:string;path:string|null;name:string|null;localPreview:string|null};
export type ModelFileReport={changes:ModelFileChange[];errors:string[]};
export const changeModelFiles=(root:string,paths:string[],destination?:string)=>invoke<ModelFileReport>('native_model_files_change',{root,paths,destination,confirmed:true});

export type ModelScanScope='all'|'models'|'loras';
export interface ModelScanStatus { id:string; root:string; state:'idle'|'running'|'succeeded'|'failed'; file:string|null; completed:number; total:number; remaining:number; failed:number }
/** Native task lifetime is independent of the Library view; one batch at a time app-wide. */
export const startModelScan=(root:string,scope:ModelScanScope,authenticated:boolean,selection?:{paths:string[];missingOnly:boolean;savePreview:boolean})=>invoke<ModelScanStatus>('native_model_scan_start',{root,scope,authenticated,...selection});
export const readModelScanStatus=()=>invoke<ModelScanStatus>('native_model_scan_status');

export interface FamilyBatchReport { updated:LocalModel[];failed:string[] }
export const writeModelFamilies=(paths:string[],family:string|null)=>invoke<FamilyBatchReport>('native_model_family_write_many',{paths,family});
