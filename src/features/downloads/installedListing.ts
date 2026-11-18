import { MODEL_LIBRARY_UPDATED,patchModels,modelPathKey,type ModelLibraryUpdate,publishModelLibrary,refreshModelPreviews } from '../../lib/modelLibrary';
import { scanModels, type LocalModel } from '../../lib/models';
import { reportLibraryError } from './libraryDiagnostics';

// One folder's listing for this app session. Never persist model metadata or cache
// execution admission: generation continues to use the native validation paths.
let listing: {root:string; models:LocalModel[]|null; pending?:Promise<LocalModel[]>; updates?:LocalModel[][]}|undefined;

export function loadInstalledListing(root:string, refresh=false, reloadIndex=false):Promise<LocalModel[]> {
 if(listing?.root!==root)listing={root,models:null};
 const entry=listing;
 if(entry.pending)return entry.pending;
 if(!refresh&&!reloadIndex&&entry.models!==null)return Promise.resolve(entry.models);
 entry.updates=[];
 entry.pending=scanModels(root,[],refresh).then(value=>{const patched=entry.updates!.reduce(patchModels,value);const models=refresh||reloadIndex?refreshModelPreviews(patched):patched;entry.models=models;if(listing===entry&&(refresh||reloadIndex))publishModelLibrary({root,models});return models;}).catch(error=>{reportLibraryError('listing');throw error;}).finally(()=>{entry.pending=undefined;entry.updates=undefined;});
 return entry.pending;
}

export function rememberInstalledListing(root:string, models:LocalModel[]) {
 if(listing?.root===root)listing.models=models;
}

export function clearInstalledListing() { listing=undefined; }

// Edit meta can be used from Studio while Library is unmounted.
if(typeof window!=='undefined')window.addEventListener('deas:model-family-changed',event=>{
 const model=(event as CustomEvent<LocalModel>).detail;
 listing?.updates?.push([model]);
 if(listing?.models)listing.models=listing.models.map(old=>old.path===model.path?{...model,addedAt:old.addedAt,localPreview:model.localPreview??old.localPreview}:old);
});

if(typeof window!=='undefined')window.addEventListener(MODEL_LIBRARY_UPDATED,event=>{const change=(event as CustomEvent<ModelLibraryUpdate>).detail;if(listing&&change.updates&&modelPathKey(listing.root)===modelPathKey(change.root)){listing.updates?.push(change.updates);if(listing.models)listing.models=patchModels(listing.models,change.updates);}});
