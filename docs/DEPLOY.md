# Deploying to Vercel

Live projects (team `cryptilly1s-projects`):

| App | URL | Vercel project |
|---|---|---|
| LearnForge | https://specter-learnforge.vercel.app | `specter-learnforge` |
| HauntHouse Walk | https://specter-haunthouse-walk.vercel.app | `specter-haunthouse-walk` |
| Crypt Forge | https://specter-crypt-forge.vercel.app | `specter-crypt-forge` |

Each app folder is linked to its project (`apps/<app>/.vercel/`, not committed).

## Add the AI key (once per project)

Run each command and paste the key when asked. Never put it in a file:

```bash
cd apps/learnforge && vercel env add GROQ_API_KEY production && cd ../..
cd apps/haunthouse-walk && vercel env add GROQ_API_KEY production && cd ../..
cd apps/crypt-forge && vercel env add GROQ_API_KEY production && cd ../..
```

Then redeploy, because environment variables apply to new deployments only.

## Deploy (prebuilt)

The apps are built locally and the output is uploaded. This avoids monorepo root-directory settings, and the `/api/spec` function is already a single bundled file.

```bash
for a in learnforge haunthouse-walk crypt-forge; do
  (cd apps/$a && vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod --yes)
done
```

`engines.node` is pinned to `22.x` in each app's package.json; the Vercel project default (26.x) is rejected by the builder.

## Check the live apps

```bash
SPECTER_LF_URL=https://specter-learnforge.vercel.app \
SPECTER_HW_URL=https://specter-haunthouse-walk.vercel.app \
SPECTER_CF_URL=https://specter-crypt-forge.vercel.app \
pnpm test:e2e
```

Check the AI endpoint. Before the key is added it answers `No AI provider is configured`. After, it returns a spec:

```bash
curl -s https://specter-learnforge.vercel.app/api/spec -H 'content-type: application/json' \
  -d '{"text":"make the powerhouse glow red","context":{"app":"learnforge","meshes":["mitochondria","nucleus"],"hotspots":[],"packs":[],"cameraPresets":[]}}'
```
