// ../../packages/specter-library/src/types.ts
var LICENSES = {
	cc0: {
		id: "CC0-1.0",
		label: "CC0",
		attributionRequired: false
	},
	ccby: {
		id: "CC-BY-4.0",
		label: "CC BY 4.0",
		attributionRequired: true
	},
	generated: {
		id: "Generated",
		label: "AI-generated (Meshy)",
		attributionRequired: false
	}
};
/**
* Hosts an asset URL may point at. Share links and AI answers can only load models from these, so a crafted link
* cannot make a viewer fetch arbitrary URLs.
*/
var ALLOWED_ASSET_HOSTS = [
	"dl.polyhaven.org",
	"static.poly.pizza",
	"3d-api.si.edu",
	"raw.githubusercontent.com",
	"assets.meshy.ai"
];
function isAllowedAssetUrl(url) {
	try {
		const u = new URL(url);
		if (u.protocol !== "https:") return false;
		if (u.username || u.password) return false;
		return ALLOWED_ASSET_HOSTS.includes(u.hostname) || u.hostname.endsWith(".meshy.ai");
	} catch {
		return false;
	}
}
// ../../packages/specter-library/src/providers.ts
/** Categories we never return, whatever the query. */
var BLOCKED_WORDS = [
	"weapon",
	"firearm",
	"gun",
	"rifle",
	"pistol",
	"knife",
	"sword",
	"gore",
	"nsfw",
	"nude",
	"blood"
];
function isBlocked(text) {
	const t = text.toLowerCase();
	return BLOCKED_WORDS.some((w) => t.includes(w));
}
// ../../packages/specter-library/src/meshy.ts
var BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";
async function call(key, init, deps) {
	const res = await (deps.fetchImpl ?? fetch)(`${BASE}${init.path ?? ""}`, {
		method: init.method,
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/json"
		},
		body: init.body ? JSON.stringify(init.body) : void 0
	});
	let json = {};
	try {
		json = await res.json();
	} catch {}
	return {
		status: res.status,
		json
	};
}
function readableError(status, json) {
	if (status === 401) return "The Meshy key was rejected.";
	if (status === 402) return "Meshy needs a paid plan or more credits for this.";
	if (status === 403) return "Meshy declined that prompt.";
	if (status === 429) return "Meshy is busy. Try again in a minute.";
	return String(json?.message ?? `Meshy error ${status}`).slice(0, 160);
}
/** Start a text-to-3D job (shape preview first). The key never leaves the server. */
async function startGeneration(prompt, key, deps = {}) {
	const p = prompt.trim().slice(0, 300);
	if (p.length < 3) return {
		ok: false,
		error: "Describe the object in a few words."
	};
	if (isBlocked(p)) return {
		ok: false,
		error: "That kind of object can't be generated here."
	};
	const r = await call(key, {
		method: "POST",
		body: {
			mode: "preview",
			prompt: p,
			ai_model: "latest",
			should_remesh: true,
			target_polycount: 3e4,
			moderation: true,
			target_formats: ["glb"]
		}
	}, deps);
	if (r.status >= 300 || typeof r.json?.result !== "string") return {
		ok: false,
		error: readableError(r.status, r.json)
	};
	return {
		ok: true,
		job: {
			id: r.json.result,
			stage: "preview"
		},
		progress: 0
	};
}
/** Poll a job. When the preview succeeds it starts texturing automatically and returns the new job id. */
async function pollGeneration(job, prompt, key, deps = {}) {
	if (!/^[A-Za-z0-9-]{8,80}$/.test(job.id)) return {
		ok: false,
		error: "Invalid job id"
	};
	const r = await call(key, {
		method: "GET",
		path: `/${job.id}`
	}, deps);
	if (r.status >= 300) return {
		ok: false,
		error: readableError(r.status, r.json)
	};
	const t = r.json ?? {};
	const pct = Math.max(0, Math.min(100, Number(t.progress ?? 0)));
	if (t.status === "FAILED" || t.status === "CANCELED" || t.status === "EXPIRED") return {
		ok: false,
		error: String(t.task_error?.message ?? "Generation failed. Try a simpler description.").slice(0, 160)
	};
	if (t.status !== "SUCCEEDED") return {
		ok: true,
		job,
		progress: job.stage === "preview" ? Math.round(pct / 2) : 50 + Math.round(pct / 2)
	};
	if (job.stage === "preview") {
		const refine = await call(key, {
			method: "POST",
			body: {
				mode: "refine",
				preview_task_id: job.id,
				enable_pbr: true,
				target_formats: ["glb"]
			}
		}, deps);
		if (refine.status >= 300 || typeof refine.json?.result !== "string") return finish(t, prompt, "untextured");
		return {
			ok: true,
			job: {
				id: refine.json.result,
				stage: "refine"
			},
			progress: 50
		};
	}
	return finish(t, prompt, "textured");
}
function finish(t, prompt, note) {
	const url = String(t?.model_urls?.glb ?? "");
	if (!isAllowedAssetUrl(url)) return {
		ok: false,
		error: "Meshy returned a model from an unexpected address."
	};
	const title = prompt.trim().slice(0, 60);
	return {
		ok: true,
		done: true,
		progress: 100,
		candidate: {
			provider: "meshy",
			assetId: String(t.id),
			title,
			url,
			thumbnail: typeof t.thumbnail_url === "string" ? t.thumbnail_url : void 0,
			license: LICENSES.generated,
			credit: `"${title}" generated with Meshy (${note}). Download links from Meshy expire, so export the scene to keep it.`,
			sourceUrl: "https://www.meshy.ai"
		}
	};
}
// ../../packages/specter-library/src/catalogue.ts
var K = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
function khronos(model, title, keywords, license = LICENSES.cc0, note = "CC0") {
	return {
		provider: "catalogue",
		assetId: `khronos-${model.toLowerCase()}`,
		title,
		url: `${K}/${model}/glTF-Binary/${model}.glb`,
		license,
		credit: `${title} from the Khronos glTF Sample Assets (${note})`,
		sourceUrl: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${model}`,
		keywords
	};
}
khronos("Avocado", "Avocado", [
	"avocado",
	"fruit",
	"food"
]), khronos("Lantern", "Lantern", [
	"lantern",
	"street lamp",
	"lamp post"
]), khronos("WaterBottle", "Water bottle", [
	"bottle",
	"water bottle",
	"flask"
]), khronos("BoomBox", "Boom box", [
	"boombox",
	"boom box",
	"radio",
	"stereo"
]), khronos("ToyCar", "Toy car", [
	"toy car",
	"car",
	"toy"
]), khronos("SheenChair", "Armchair", [
	"chair",
	"armchair",
	"seat"
]), khronos("Fox", "Fox", ["fox", "animal"], LICENSES.ccby, "model CC0 by PixelMannen, rig CC BY 4.0 by tomkranis");
// ../../packages/specter-library/src/server.ts
var hits = /* @__PURE__ */ new Map();
function limited(ip, max) {
	const now = Date.now();
	const k = ip || "anon";
	const arr = (hits.get(k) ?? []).filter((t) => now - t < 6e4);
	if (arr.length >= max) return true;
	arr.push(now);
	hits.set(k, arr);
	if (hits.size > 5e3) hits.clear();
	return false;
}
/** POST /api/generate {prompt} starts a job. POST {prompt, job:{id,stage}} polls it. GET reports whether it's enabled. */
async function handleGenerateRequest(req, env, deps = {}) {
	const key = env.MESHY_API_KEY?.trim();
	if (req.method === "GET") return {
		status: 200,
		body: { enabled: Boolean(key) }
	};
	if (req.method !== "POST") return {
		status: 405,
		body: { error: "Use POST" }
	};
	if (!key) return {
		status: 503,
		body: { error: "Generation is not set up (no MESHY_API_KEY)." }
	};
	const b = req.body ?? {};
	const prompt = typeof b.prompt === "string" ? b.prompt : "";
	if (!prompt || prompt.length > 300) return {
		status: 400,
		body: { error: "Invalid prompt" }
	};
	try {
		if (b.job && typeof b.job.id === "string" && (b.job.stage === "preview" || b.job.stage === "refine")) {
			if (limited(`${req.ip}:poll`, 120)) return {
				status: 429,
				body: { error: "Polling too fast" }
			};
			return {
				status: 200,
				body: await pollGeneration({
					id: b.job.id,
					stage: b.job.stage
				}, prompt, key, deps)
			};
		}
		if (limited(`${req.ip}:gen`, 6)) return {
			status: 429,
			body: { error: "Too many generations. Try again in a minute." }
		};
		return {
			status: 200,
			body: await startGeneration(prompt, key, deps)
		};
	} catch {
		return {
			status: 502,
			body: { error: "Meshy could not be reached." }
		};
	}
}
// server/generate.ts
/** Vercel serverless function: /api/generate (Meshy). Disabled unless MESHY_API_KEY is set. */
async function handler(req, res) {
	const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
	const out = await handleGenerateRequest({
		method: req.method,
		query: req.query ?? {},
		body: req.body,
		ip: fwd || req.socket?.remoteAddress
	}, process.env);
	res.setHeader("cache-control", "no-store");
	res.status(out.status).json(out.body);
}
export { handler as default };
