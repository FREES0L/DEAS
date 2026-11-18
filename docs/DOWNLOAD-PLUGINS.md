# Download and authentication plugins

## Implementation contract

Installed publishes explicit refresh/fetch/scan results to the
retained Studio inventory. It does not make navigation or focus a provider lookup,
nor start a second model-folder walk. Shared local Favorites and bounded bulk family
sidecar edits are described in [Library](LIBRARY.md); native execution checks remain
authoritative and separate from these browsing updates.

Data-only TOML catalogs declare optional resources and provider plugins. UX is generated from validated catalog data; adding an entry must not require a JSX edit. Catalog files contain no credentials, shell commands or executable hooks. A downloadable workflow/preset is data, not permission to execute it.

Provider families: Hugging Face model/dataset repository files and user repository listing; CivitAI creator/model resources; GitHub user repositories and repository files; generic HTTPS direct files and declarative JSON resource indexes; explicit Ollama endpoint model listing. Ollama installed models are backend resources, not downloadable files or an implicit pull authorization.

Anonymous access is the default, with provider-specific limitations. Token access is a separate native plugin, bound to provider and exact configured origin. Tokens are never read back to frontend, persisted in drafts/catalogs, added to query strings or logs. Saving defaults to OS credential-store persistence with a session-only opt-out; saved official-provider tokens are restored at desktop startup without plaintext fallback. Library browsing automatically uses the matching configured token unless anonymous mode was explicitly selected; download plans retain the browse access mode. Token presence is not proof of login, license acceptance, faster downloads or entitlement.

Only explicit Browse actions contact sources. Pagination must expose continuation/limits rather than claiming completeness. Native transport validates endpoints, bounded JSON and redirect behavior. Authorization must never be forwarded to foreign download/CDN redirects. Arbitrary direct HTTPS sources may be anonymous; trusted credential origins cannot be overridden by untrusted catalog entries.

Downloads are separately planned, immutable, consented and non-executing. A selected existing parent plus explicit new subfolder forms the destination; reject existing targets, traversal, symlink components and overwrites. Store resource identities, source origins, optional checksums/licenses and limits in the plan before confirmation. Stream into exclusive partial files; validate reported size/checksum when available, atomically publish, expose actual status/progress/errors and only delete app-owned partials. No auto-install into external ComfyUI or automatic workflow execution. Optional download failure must not relabel core ComfyUI installation failure or readiness.

## IPC contract for this slice

Catalog/discovery native module:

- `native_download_import_catalog({text})` validates/adds session-only TOML providers/entries; duplicate IDs cannot override origins. The UI offers an explicit text import; reading/importing never contacts a source.
- `native_download_catalog()` returns `{version:1, providers:[{id,kind,label,origin,scopes,anonymousNotice}], entries:[{id,label,providerId,scope,locator,kind,target,license?,sha256?,preview?}]}`. `target` is the ComfyUI folder category the UI groups by; `preview` is an HTTPS image/video URL rendered by the webview (CSP allows `image.civitai.com`). The compiled catalog merges `default.toml` with the entry-only `darksidewalker.toml` (generated from the CivitAI models API).
- `native_download_browse({request:{providerId,scope:'user'|'repo'|'model'|'search'|'index'|'backend',locator,cursor?:string,authenticated:boolean}})` returns `{resources:[{id,label,kind,url?:string,size?:number,sha256?:string,downloadable:boolean,locator?:string,preview?:string,category?:string}],nextCursor:string|null,warnings:string[]}`. CivitAI `search` takes free text and returns browsable model identities (`kind:'repo'`, `locator` = model ID) with `preview` (first version image, may be `.mp4`) and `category` (ComfyUI folder derived from the model type); `model`/`user` file listings carry the same two fields.
- `native_download_plan({request:{providerId,resources:[resource],parentPath,folderName,authenticated:boolean}})` returns `{id,target,resources,totalKnownBytes,unknownSizeCount,warnings,canExecute}`. An empty `folderName` stages into the existing user-owned `parentPath` itself (used for `<env>/ComfyUI/models/<category>`); files are still created exclusively and no manifest is written. A non-empty name creates a new subfolder as before.
- `native_download_start({planId,confirmed:true})`, `native_download_status()`, `native_download_cancel()` return `{state:'idle'|'running'|'succeeded'|'failed'|'cancelled',completed,total,bytesDownloaded,error:string|null}`.

Authentication module:

- `native_auth_verify({providerId})` automatically probes only the fixed official-provider identity endpoint; returns `{providerId,status}` (`verified`, `rejected`, `unavailable`, `unsupported`), never token/profile data. See [authentication verification](AUTH-PLUGIN.md) for transport bounds and evidence limits.
- `native_auth_status()` returns `[{providerId,configured:boolean,persisted:boolean}]` (metadata only).
- `native_auth_restore({providerId,origin?:string})` explicitly retries loading an OS-store entry; official providers are also restored once at desktop startup. The current UI exposes the three official providers; custom accounts require explicit native origin registration/set/restore and are not yet exposed in the UI.
- `native_auth_set({providerId,token,persist:boolean,origin?:string})` and `native_auth_remove({providerId})` return metadata only.
- Native `AuthState` offers `credential(provider_id, exact_origin) -> Result<Option<String>,String>`. Provider origins: huggingface=https://huggingface.co, civitai=https://civitai.com, github=https://api.github.com. Custom HTTP/Ollama credentials must be explicitly origin-bound, not inferred from catalog metadata; unsupported origins fail closed.

The UI uses these exact commands and displays native result only. Browser preview identifies missing native transport and never fabricates resources/progress. Authentication and catalog modules are independent; download/provider adapters reuse only the scoped credential accessor. Runtime secrets must not appear in errors or status.

## Catalog extension example and current limits

Paste an entry-only extension into **Extend TOML catalog**. Replace the illustrative URL and IDs with actual resources before browsing; this example does not claim an existing downloadable file.

```toml
version = 1
providers = []

[[entries]]
id = "my-workflow"
label = "My API workflow data"
providerId = "http"
scope = "index"
locator = "direct:https://raw.githubusercontent.com/OWNER/REPO/main/workflow.json"
kind = "workflow"
target = "workflow-files"
# license = "License checked against upstream"
# sha256 = "Exact 64-character SHA-256 from a trusted source"
```

`target` is catalog guidance, not permission to write into that folder. The user selects an existing parent and new child separately. New HTTPS origins require their own declared `http` provider with a unique ID; they never inherit HF/CivitAI/GitHub credentials. `direct:` disambiguates a JSON file from `index:`. A JSON index uses `{version:1, resources:[resource]}` with the Resource IPC shape and validated same-origin download URLs.

HF locators use `models:OWNER`/`datasets:OWNER` at user scope, then `models:OWNER/REPO`/`datasets:OWNER/REPO` at repository scope. GitHub uses `OWNER` then `OWNER/REPO[/directory]`; CivitAI uses creator username or model ID. Ollama accepts only its declared explicit loopback origin and returns passive tags.

The parent must be effective-user-owned and not group/world writable; staging children have private permissions. Same-user adversarial mutation is not a sandbox guarantee. Download writing has Linux and Windows code paths (Windows writes are not runtime-verified) and is bounded to 16 files, 20 GiB total and one hour per job. HF resolves `main`; GitHub uses its default revision and at most 50 directory entries. No automatic recursive clone, Git LFS expansion, revision pinning, large-download resume or managed model placement. HTTP fixtures prove transport mechanics; upstream response-shape fixtures are not live API acceptance. Session imports and saved custom credential origin bindings are not automatically restored. Real vault operations have not been tested; vault failures have no plaintext fallback.

## Acceptance checklist

- [x] Validated extensible TOML catalog feeds UX without resource-specific rendering code.
- [x] Dynamic provider listing, pagination and anonymous limitations.
- [x] Separate authentication module with metadata-only reads and scoped native credentials.
- [x] Explicit immutable download plans and real bounded streaming with integrity/path protections.
- [x] UI explicit browse/auth/download consent, stale result invalidation and localization.
- [x] Scratch HTTP/file tests, frontend/native build gates, responsive browser fixtures and native initial-screen rendering; interactive native plugin UI-to-transport acceptance remains unverified.

Live authenticated provider, gated license acceptance, provider rate/speed entitlement, large-model resume, full install integration and other target OS verification must be distinguished from local HTTP/UI fixtures.

## Folder settings and local presence

### Native Installed gallery (proposed)

Installed has a preview gallery and a compact list view, with horizontal model-type navigation
above the collection and a modal detail popup for the selected file. The toolbar searches
filenames, CivitAI names/versions, trigger words, base families, personal tags and
notes. Folder, base-model, metadata-presence, tag and Favorites filters combine;
Clear filters resets them. Collapsible folders include descendant files and remember expansion. Sort by name (both directions), date added, size, Studio use count, local version count, shuffled order or base model. Studio use counts start with this patch and count subsequent model/LoRA activations, not completed generations. Date added uses file creation time when available, otherwise first discovery. Local versions use distinct known CivitAI version IDs.
Only 60 matching cards are rendered initially. Enable **View all** beside Sort
to automatically append the next cards as you scroll, without pressing Show more.
The toggle survives restart. Turn it off for manual 60-card batches. Both modes
use the saved snapshot without rescanning. Search and filtering still cover the complete loaded native snapshot.

- Stars mark Favorites. Notes (up to 4,000 characters) and comma-separated tags
  (up to 20, 50 characters each) are personal preferences keyed by the exact model
  path. Tags commit on blur or Enter. These preferences, view mode and search survive
  restart in DEAS's local profile; they do not write to model files, `.deas.json` or
  other managers' metadata. If profile storage is unavailable/full, the existing
  preference service keeps changes only for the current session. Path changes
  require reorganizing the new path; there is no automatic file rename/move/delete.
- Preview covers prefer a sibling image found during explicit Refresh, then fall
  back to existing CivitAI metadata. Supported extensions are JPG/JPEG, PNG, WebP,
  GIF, AVIF and BMP (case insensitive); browser decoding determines whether a file
  is valid. For `name.safetensors`, discovery tries `name.preview.<ext>`,
  `name.<ext>`, then `name.safetensors.preview.<ext>`, in that order. Each group
  prefers JPG, JPEG, PNG, WebP, GIF, AVIF, then BMP. Covers must be regular sibling
  files, 1 byte to 32 MiB; symlinks are skipped. Missing/failed covers show a format
  placeholder. Refresh discovers added/removed covers, while ordinary navigation
  uses the saved index. No model hashing, metadata fetch or other manager's metadata
  import is triggered. Known mature previews are blurred
  by default, with a remembered checkbox. Unknown maturity cannot be inferred.
- Click a model for its popup, previous/next navigation, version/filename/location/base/size/identity facts, trigger-word copy buttons, personal organization,
  existing native compatibility advice, companion suggestions and metadata fetch.
  Right-click or Shift+F10 on a model retains Edit meta. Copy filename preserves the
  exact category-relative model name. Clipboard refusal is shown inline; preview,
  clipboard and listing failures are rate-limited in central Logs with no filenames,
  user notes, remote URLs or clipboard contents.
- Catalog browsing, versions, explicit downloads and provider authorization retain
  the existing DEAS native tools. The Installed view hides the irrelevant download
  basket action. Personal recipes, workflow application, bulk filesystem management,
  video previews and LoRA Manager browser-extension integration are not part of this
  native gallery slice. No LoRA Manager service or custom nodes are installed.

The wider folder column wraps long names and keeps counts and eye controls visible.
Folders/filters and model cards have independent scroll areas in the Library
workspace. Scrolling cards keeps the folder column in place.

LoRA cards have a **+** action, also available as **Add to Studio LoRAs** in details
and the right-click card menu (keyboard: Shift+F10).
It adds a draft selection at weight 1 and briefly confirms the action with a floating
notice that leaves buttons aligned and stays visible above scrolled panes/dialogs.
Cached optional null metadata fields are accepted. Storage failures show a failure notice. It preserves
an existing weight and leaving the current page/popup in place. It neither changes
the main model nor starts generation. Use the LoRAs button below Studio's model
picker to manage selected weights, order, on/off switches and named sets. Adding
a retained disabled LoRA re-enables it with its previous weight and position. Click the dark backdrop outside
the model-details popup to close it; tags commit before closing.

### Folder visibility

Click the eye beside a folder to hide its files and descendants from cards,
searches, Favorites results and Fetch targets. The folder stays in the tree with
its eye crossed out, so it can be shown again. Hiding the root hides the entire
current category. A child hidden by its parent has a disabled eye until the parent
is shown; independently hidden children remain hidden when the parent is restored.
Folder counts describe the indexed inventory, including hidden files. Clear filters
does not reset visibility. Visibility is remembered per browser, root and category;
Library and Studio keep separate preferences. Files, metadata and active Studio
selections are unchanged. This is a display preference, not an access restriction.

### Fetch metadata and previews

The **Fetch** control sits beside **Refresh models** in the collection header;
its options expand below the compact action row. It works from the current saved listing. Choose current filtered
results (including matching cards beyond Show more), current folder and descendants,
current model category or the entire library. **Only missing metadata or previews**
is enabled initially. Fetch skips current metadata with creator information and,
when local saving is enabled, a local cover if the provider offers one. Uncheck it
to refresh existing records. A no-match CivitAI result remains
missing and can be retried explicitly. The count is an upper bound before native
missing-record checks. In a card's popup, Fetch/Refresh metadata handles that file.

**Start fetch** is explicit. It looks up CivitAI by SHA-256, reuses valid cached hashes
and may read whole weight files when hashing is needed. Native code validates and
deduplicates the selected paths, keeps four requests in flight, reports progress
and errors through central Logs, and continues when switching views. It caches
metadata and preview URLs beside each model. **Save preview locally** sits beside
**Start fetch**, defaults to off, and applies to batch and individual metadata
fetches. When enabled, Fetch saves a missing CivitAI still image next to the model.
An existing local preview is used as-is. If saving fails, the metadata and remote
preview link are still available. Configured CivitAI credentials apply to metadata
lookups. Closing DEAS stops in-flight work.

Completed batches patch the native index once per saved index, then refresh the
visible cards from that saved index. No recursive model-folder listing is triggered
by Fetch or by returning to Library. **Scan Files** retains its older explicit
whole-folder discovery workflow; **Refresh models** discovers local file changes.

In **Model details**, click the file path to open its containing folder. **View on
Civitai** opens the matched version and the creator name opens their profile when
that information is available. Models flagged mature open on civitai.red, because
civitai.com only shows a "moved to civitai.red" notice for them; other models open on
civitai.com. Metadata lookups and downloads keep using the civitai.com API, which
returns the same mature models, hashes and download redirects as civitai.red.
Global search includes local model search, Favorites,
folder/base filters and Refresh models.

Right-click an installed model card to choose **Move to folder…** or **Delete…**.
Use **Bulk select** to pick individual cards or select the filtered results. Move
chooses an existing folder in the same model category and refuses filename
conflicts. Delete requires confirmation and permanently removes the selected
files. Metadata and unshared covers follow the models. Successful changes update
the saved listing without a model-folder scan.

The proposed native browser stores a native browsing index in the app cache, keyed by
configured model roots and detector version. The first load builds the index;
subsequent visits and restarts read it without walking model folders. A detector
upgrade, missing or invalid index requires rebuilding. **Refresh models** explicitly
walks folders and reuses unchanged file/sidecar records. External additions and removals appear after Refresh models. Completed metadata
batches patch existing index records and reload that saved index without walking
model folders.
Individual metadata edits/fetches update the matching cached record without a
model-directory scan. A failed refresh retains the previous listing. Library and
Studio share the native index, collapsible folder navigation, bounded card batches
and sorting controls. The snapshot is browsing advice; native generation validation
still checks selected files live. No background filesystem watcher is added.

`native_settings_read({root})` / `native_settings_write({root, folders:{models?,input?,output?}})` keep `deas-settings.json` beside the environment (absolute existing directories only). The owned backend start appends `--input-directory`, `--output-directory` and `--extra-model-paths-config <root>/deas-models.yaml` (generated, `base_path` = models folder with the standard ComfyUI subfolders) when set; a folder removed since saving fails the start. The Library targets `<models>/<category>` for model categories when a models folder is configured. `native_files_present({paths})` reports which absolute files exist; the Library marks listed files found in the destination as "already local" and does not offer them for download. Catalog cards (model pages) are not checked until their files are listed.

`native_models_scan({root})` lists model files (`safetensors/sft/ckpt/pt/pth/gguf/bin`, hidden names skipped, 5000 cap) under the standard ComfyUI category folders of `root` with any cached `<file>.deas.json` sidecar and a `family` ID for model and LoRA files (safetensors header `modelspec.architecture` or tensor-key signature from `src/families/builtin.json`, else the cached CivitAI base model; absent = unknown). `native_model_info({path, authenticated})` hashes the file (reusing the cached hash while the source fingerprint matches), queries CivitAI `api/v1/model-versions/by-hash/<sha256>` through the catalog's CivitAI provider (token when configured and requested) and writes the sidecar atomically: `sha256`, `size`, `fetchedAt`, and `civitai` (model/version IDs and names, type → ComfyUI category, base model, NSFW flag, trigger words, 450px preview URL, first showcase image settings) or `null` for an unknown hash. A valid local cover takes precedence over the preview URL. Sidecar metadata is informational: it is not a verified download, license acceptance or architecture check.
