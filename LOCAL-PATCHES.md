# Local patches

Freesol's DEAS runs from this branch, `stabilitymatrix-folder-aliases`, on
top of upstream `darksidewalker/DEAS`. This file is the ledger of every
change the branch carries, kept so a later decision can be made per patch:
send it upstream, keep it local, or drop it because upstream fixed the
problem their own way. It stays on this branch and never goes into an
upstream pull request.

## Keeping it

- **New change:** every commit added to this branch gets an entry below in
  the same commit: what broke in Freesol's words, the fix, its commits, and
  the AMD-only and status fields.
- **Rebase or evaluation:** for every entry, check upstream's commits,
  issues and pull requests since the date in its status. Then update the
  status line with the date and upstream version you checked. An entry
  upstream has fixed comes off the branch; move it to Retired with the
  upstream commit or version that fixed it.

Status values: `local` (not sent), `sent: <PR url>`, `merged: <version>`,
`fixed upstream: <commit or version>`, `keep local: <reason>`.

## Active

### 1. StabilityMatrix folder names

- **Broke:** Studio saw only LoRAs from `/mnt/ai/models`; checkpoints,
  diffusion models, VAEs, text encoders and upscalers were invisible,
  because DEAS knew only 2 of StabilityMatrix's folder names.
- **Fix:** a 14-entry alias table (`StableDiffusion`, `DiffusionModels`,
  `TextEncoders`, `ESRGAN` and the rest) used for both category lookup and
  model locations. `src-tauri/src/settings.rs`.
- **Commits:** eddd4a8
- **AMD-only:** no
- **Status:** local, checked 2026-11-19 against v0.3.3 (2a753d0)

### 2. AMD GPU detection on the in-tree driver

- **Broke:** setup recommended CPU and said it "cannot run nvidia-smi":
  the in-tree amdgpu driver has no `/sys/module/amdgpu/version`.
- **Fix:** a loaded amdgpu module without that file reports the driver as
  `in-kernel`, not the kernel version, so a kernel update does not force a
  backend reinstall. `src-tauri/src/amd.rs`.
- **Commits:** b06962a
- **AMD-only:** yes
- **Status:** local, checked 2026-11-19 against v0.3.3 (2a753d0)

### 3. AMD through setup, install and start

- **Broke:** with detection fixed, each later step still refused AMD in
  turn: setup failed with "Invalid native defaults response", install with
  "Approved backend is not executable", Start ran the NVIDIA probe, and
  launch failed with "Unsupported backend". Upstream's docs say AMD support
  had not been run on a real Radeon.
- **Fix:** setup accepts an AMD recommendation (plus the
  `setup.detectedAmd` string in 6 locales); backend validation and
  environment reopen admit AMD; Start probes with the AMD probe; launch adds
  no device flag for AMD (`HIP_VISIBLE_DEVICES=0` is already set).
  `AiOSetup.tsx`, `backend.rs`, `install.rs`.
- **Commits:** 4bea0c0, 01a3dad, 90d5680
- **AMD-only:** yes
- **Status:** local, checked 2026-11-19 against v0.3.3 (2a753d0)
- **Proof:** R9700 (gfx1201), ROCm torch 2.13.0+rocm10.0.0; 1024² at 28
  steps in 11.5 s warm. Only image generation has been run; video, H3,
  music and masking are untested on AMD.

### 4. Model library goes stale; video covers missing

- **Broke:** most model tiles showed a blank square instead of the
  preview. The library index was rebuilt only on an explicit Reload, and
  LoRA Manager had since moved 241 models and downloaded 363 more, so tiles
  pointed at files that no longer existed. Models whose cover is an `.mp4`
  (68 of them) never had a preview at all.
- **Fix:** a plain load walks only the model directories and rescans when
  any changed after the snapshot's scan began (index schema 2 records that
  time). `.mp4` and `.webm` covers count as previews after images, and
  tiles show them as the cached ffmpeg still frame from
  `native_media_reference_thumbnail`.
  `downloads_models_index.rs`, `ModelPreview.tsx`.
- **Commits:** 7d1e02f
- **AMD-only:** no
- **Status:** local, checked 2026-11-19 against v0.3.3 (2a753d0)

## Retired

None yet.
