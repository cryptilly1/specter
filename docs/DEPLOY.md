# Deploying to Vercel

One Vercel project per app, all from this repo. Each app has its own `vercel.json` and a bundled `/api/spec` function.

## One-time setup

```bash
vercel login
```

Then, for each app (run from the repo root):

```bash
cd apps/learnforge && vercel link --yes --project specter-learnforge && cd ../..
cd apps/haunthouse-walk && vercel link --yes --project specter-haunthouse-walk && cd ../..
cd apps/crypt-forge && vercel link --yes --project specter-crypt-forge && cd ../..
```

In each project, under Settings > General, set **Root Directory** to the app folder (`apps/learnforge` and so on) and turn on **Include files outside the root directory**. Vercel needs the second setting for the pnpm workspace.

Add the key to each project (Production and Preview). Do not paste it into any file:

```bash
cd apps/learnforge && vercel env add GROQ_API_KEY production && cd ../..
# repeat for the other two apps
```

## Deploy

```bash
cd apps/learnforge && vercel deploy --prod && cd ../..
cd apps/haunthouse-walk && vercel deploy --prod && cd ../..
cd apps/crypt-forge && vercel deploy --prod && cd ../..
```

Or connect the GitHub repo in the Vercel dashboard with the same three Root Directories, so every push deploys.

## Check the live apps

```bash
SPECTER_LF_URL=https://<learnforge>.vercel.app \
SPECTER_HW_URL=https://<walk>.vercel.app \
SPECTER_CF_URL=https://<forge>.vercel.app \
pnpm test:e2e
```

Check the AI endpoint (it should return a spec, not a 503):

```bash
curl -s https://<learnforge>.vercel.app/api/spec -H 'content-type: application/json' \
  -d '{"text":"make the powerhouse glow red","context":{"app":"learnforge","meshes":["mitochondria","nucleus"],"hotspots":[],"packs":[],"cameraPresets":[]}}'
```
