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
function words(q) {
	return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && ![
		"a",
		"an",
		"the",
		"of",
		"some",
		"model",
		"3d"
	].includes(w)).map((w) => w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
}
async function getJson(url, c, headers = {}) {
	const res = await c.fetchImpl(url, {
		headers: {
			accept: "application/json",
			...headers
		},
		signal: c.signal
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}
var polyHavenIndex = null;
var POLYHAVEN_TTL = 36e5;
function scorePolyHaven(id, a, q) {
	const name = a.name.toLowerCase();
	const tags = a.tags.map((t) => t.toLowerCase());
	const cats = a.categories.map((t) => t.toLowerCase());
	let s = 0;
	for (const w of q) {
		if (name.split(/\s+/).includes(w) || id.split("_").includes(w)) s += 3;
		else if (name.includes(w)) s += 2;
		if (tags.includes(w)) s += 2;
		if (cats.some((c) => c.includes(w))) s += 1;
	}
	return s;
}
/**
* Poly Haven: free API, no key, CC0 assets. Their API terms ask apps using the live API to show a
* "Powered by Poly Haven" credit, which is returned as platformCredit.
*/
async function searchPolyHaven(query, c) {
	const q = words(query);
	if (!q.length) return [];
	if (!polyHavenIndex || Date.now() - polyHavenIndex.at > POLYHAVEN_TTL) polyHavenIndex = {
		at: Date.now(),
		data: await getJson("https://api.polyhaven.com/assets?t=models", c)
	};
	const ranked = Object.entries(polyHavenIndex.data).filter(([id, a]) => !isBlocked(`${id} ${a.name} ${a.categories.join(" ")} ${a.tags.join(" ")}`)).map(([id, a]) => ({
		id,
		a,
		s: scorePolyHaven(id, a, q)
	})).filter((r) => r.s >= 3).sort((x, y) => y.s - x.s).slice(0, c.limit);
	const out = [];
	await Promise.all(ranked.map(async ({ id, a }) => {
		try {
			const g = (await getJson(`https://api.polyhaven.com/files/${encodeURIComponent(id)}`, c))?.gltf?.["1k"]?.gltf;
			if (!g?.url || !isAllowedAssetUrl(g.url)) return;
			const urlMap = {};
			for (const [rel, f] of Object.entries(g.include ?? {})) if (isAllowedAssetUrl(f.url)) urlMap[rel] = f.url;
			const author = Object.keys(a.authors ?? {}).join(", ");
			out.push({
				provider: "polyhaven",
				assetId: id,
				title: a.name,
				url: g.url,
				urlMap,
				thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
				license: LICENSES.cc0,
				credit: `${a.name}${author ? ` by ${author}` : ""} (Poly Haven, CC0)`,
				sourceUrl: `https://polyhaven.com/a/${id}`,
				platformCredit: {
					text: "Powered by Poly Haven",
					url: "https://polyhaven.com"
				},
				triangles: a.polycount,
				tags: a.tags
			});
		} catch {}
	}));
	const order = new Map(ranked.map((r, i) => [r.id, i]));
	return out.sort((x, y) => (order.get(x.assetId) ?? 0) - (order.get(y.assetId) ?? 0));
}
/**
* Poly Pizza: free key, CC0 and CC-BY low-poly models. Their API terms require attribution for every model and a
* visible mention that models come from Poly Pizza, with a link. Models are loaded straight from their CDN; we never
* re-host or mirror the catalogue.
*/
async function searchPolyPizza(query, key, c) {
	const q = words(query).join(" ");
	if (!q) return [];
	const data = await getJson(`https://api.poly.pizza/v1/search/${encodeURIComponent(q)}?limit=${Math.min(24, c.limit * 2)}&format=glb`, c, { "X-Auth-Token": key });
	const results = Array.isArray(data?.results) ? data.results : [];
	const out = [];
	for (const r of results) {
		const lic = String(r.Licence ?? r.License ?? "");
		const license = /cc0|public domain/i.test(lic) ? LICENSES.cc0 : /cc[- ]?by(?![- ]?(nc|nd|sa))/i.test(lic) ? LICENSES.ccby : null;
		if (!license) continue;
		const url = String(r.Download ?? "");
		if (!isAllowedAssetUrl(url)) continue;
		const title = String(r.Title ?? "Model").slice(0, 80);
		if (isBlocked(`${title} ${(r.Tags ?? []).join(" ")}`)) continue;
		const user = String(r.Creator?.Username ?? "unknown");
		out.push({
			provider: "polypizza",
			assetId: String(r.ID),
			title,
			url,
			thumbnail: typeof r.Thumbnail === "string" ? r.Thumbnail : void 0,
			license,
			credit: `"${title}" by ${user} (poly.pizza) ${license.label}`,
			sourceUrl: `https://poly.pizza/m/${encodeURIComponent(String(r.ID))}`,
			platformCredit: {
				text: "Models provided by Poly Pizza",
				url: "https://poly.pizza"
			},
			triangles: typeof r.TriangleCount === "number" ? r.TriangleCount : void 0,
			tags: Array.isArray(r.Tags) ? r.Tags.slice(0, 12) : void 0
		});
		if (out.length >= c.limit) break;
	}
	return out;
}
var SI_QUALITY_ORDER = [
	"Medium",
	"Low",
	"High",
	"AR",
	"Low_resolution",
	"Thumb"
];
/**
* Smithsonian: the 3D file API (no key) finds web-sized .glb files for a query. Each 3D package is then checked
* against the Open Access API (key required), and only packages marked CC0 are returned. Some scans are
* non-commercial only; those are skipped.
*/
async function searchSmithsonian(query, key, c) {
	const q = words(query).join(" ");
	if (!q) return [];
	const files = await getJson(`https://3d-api.si.edu/api/v1.0/content/file/search?q=${encodeURIComponent(q)}&file_type=glb&rows=100`, c);
	const byPackage = /* @__PURE__ */ new Map();
	for (const r of files?.rows ?? []) {
		const pkg = String(r?.content?.model_url ?? "");
		if (!/^3d_package:[0-9a-f-]{36}$/i.test(pkg) || r?.content?.usage !== "Web3D") continue;
		if (!isAllowedAssetUrl(String(r?.content?.uri ?? ""))) continue;
		const entry = byPackage.get(pkg) ?? {
			title: (String(r.title ?? "").trim() || "Smithsonian object").slice(0, 80),
			glbs: []
		};
		entry.glbs.push(r.content);
		byPackage.set(pkg, entry);
	}
	const qWords = words(query);
	const relevant = (title) => {
		const t = ` ${title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
		return qWords.some((w) => t.includes(` ${w}`));
	};
	const packages = [...byPackage.entries()].filter(([, e]) => !isBlocked(e.title) && relevant(e.title)).slice(0, c.limit + 2);
	return (await Promise.all(packages.map(async ([pkg, e]) => {
		try {
			const row = ((await getJson(`https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(`"${pkg}"`)}&rows=3&api_key=${encodeURIComponent(key)}`, c))?.response?.rows ?? []).find((r) => JSON.stringify(r?.content?.descriptiveNonRepeating?.online_media ?? {}).includes(pkg));
			const media = (row?.content?.descriptiveNonRepeating?.online_media?.media ?? []).find((m) => m?.id === pkg);
			if (!media || String(media?.usage?.access ?? "").toUpperCase() !== "CC0") return null;
			e.glbs.sort((a, b) => SI_QUALITY_ORDER.indexOf(a.quality) - SI_QUALITY_ORDER.indexOf(b.quality));
			const best = e.glbs[0];
			const unit = String(row?.unitCode ?? "Smithsonian");
			return {
				provider: "smithsonian",
				assetId: pkg,
				title: e.title,
				url: best.uri,
				thumbnail: typeof media.thumbnail === "string" ? media.thumbnail : void 0,
				license: LICENSES.cc0,
				credit: `${e.title}, Smithsonian Institution (${unit}), CC0`,
				sourceUrl: String(row?.content?.descriptiveNonRepeating?.record_link ?? "https://3d.si.edu"),
				platformCredit: {
					text: "Smithsonian Open Access",
					url: "https://www.si.edu/openaccess"
				}
			};
		} catch {
			return null;
		}
	}))).filter((x) => x !== null).slice(0, c.limit);
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
/**
* Built-in catalogue: glTF sample models whose license was checked against each model's metadata.json.
* It needs no key or search service, so common requests still work when every online library is down.
*/
var CATALOGUE = [
	khronos("Avocado", "Avocado", [
		"avocado",
		"fruit",
		"food"
	]),
	khronos("Lantern", "Lantern", [
		"lantern",
		"street lamp",
		"lamp post"
	]),
	khronos("WaterBottle", "Water bottle", [
		"bottle",
		"water bottle",
		"flask"
	]),
	khronos("BoomBox", "Boom box", [
		"boombox",
		"boom box",
		"radio",
		"stereo"
	]),
	khronos("ToyCar", "Toy car", [
		"toy car",
		"car",
		"toy"
	]),
	khronos("SheenChair", "Armchair", [
		"chair",
		"armchair",
		"seat"
	]),
	khronos("Fox", "Fox", ["fox", "animal"], LICENSES.ccby, "model CC0 by PixelMannen, rig CC BY 4.0 by tomkranis")
];
function searchCatalogue(query) {
	const q = ` ${query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
	if (q.trim() === "") return [];
	return CATALOGUE.filter((c) => c.keywords.some((k) => q.includes(` ${k} `) || q.includes(` ${k}s `))).map(({ keywords: _k, ...c }) => c);
}
// ../../packages/specter-library/src/search.ts
var cache = /* @__PURE__ */ new Map();
var CACHE_TTL = 6e5;
/** Read a key, tolerating stray quotes or backticks pasted around it. */
function key(k) {
	const v = (k ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "");
	return v ? v : void 0;
}
/** Which libraries are usable with the current keys (for the UI). */
function availableProviders(env) {
	const p = ["catalogue", "polyhaven"];
	if (key(env.POLY_PIZZA_API_KEY)) p.push("polypizza");
	if (key(env.SMITHSONIAN_API_KEY)) p.push("smithsonian");
	return p;
}
async function withTimeout(ms, fn) {
	const ctl = new AbortController();
	const t = setTimeout(() => ctl.abort(), ms);
	try {
		return await fn(ctl.signal);
	} finally {
		clearTimeout(t);
	}
}
/**
* Search every available library in parallel. One slow or failing library never blocks the others.
* Results are ordered: catalogue, then Poly Pizza (low-poly, best for scenes), Poly Haven, Smithsonian.
* Search results are cached for 10 minutes per server instance only; models are never re-hosted.
*/
async function searchLibraries(query, env, opts = {}) {
	const q = query.trim().slice(0, 80);
	const notes = [];
	if (!q) return {
		query: q,
		candidates: [],
		notes: ["Empty query"]
	};
	if (isBlocked(q)) return {
		query: q,
		candidates: [],
		notes: ["That kind of object is not available"]
	};
	const limit = Math.max(1, Math.min(12, opts.limit ?? 8));
	const enabled = (opts.providers ?? availableProviders(env)).filter((p) => availableProviders(env).includes(p));
	const cacheKey = `${q.toLowerCase()}|${limit}|${enabled.join(",")}`;
	const hit = cache.get(cacheKey);
	if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;
	const fetchImpl = opts.fetchImpl ?? fetch;
	const timeoutMs = opts.timeoutMs ?? 6e3;
	const per = Math.max(2, Math.ceil(limit / 2));
	const run = async (p) => {
		try {
			return await withTimeout(timeoutMs, (signal) => {
				const c = {
					fetchImpl,
					signal,
					limit: per
				};
				if (p === "catalogue") return Promise.resolve(searchCatalogue(q));
				if (p === "polyhaven") return searchPolyHaven(q, c);
				if (p === "polypizza") return searchPolyPizza(q, key(env.POLY_PIZZA_API_KEY), c);
				if (p === "smithsonian") return searchSmithsonian(q, key(env.SMITHSONIAN_API_KEY), c);
				return Promise.resolve([]);
			});
		} catch (e) {
			notes.push(`${p}: ${e instanceof Error && e.name === "AbortError" ? "timed out" : "unavailable"}`);
			return [];
		}
	};
	const lists = await Promise.all([
		"catalogue",
		"polypizza",
		"polyhaven",
		"smithsonian"
	].filter((p) => enabled.includes(p)).map(run));
	const seen = /* @__PURE__ */ new Set();
	const candidates = [];
	for (const list of lists) for (const c of list) {
		const id = `${c.provider}:${c.assetId}`;
		if (seen.has(id)) continue;
		seen.add(id);
		candidates.push(c);
	}
	const result = {
		query: q,
		candidates: candidates.slice(0, limit),
		notes
	};
	if (candidates.length) cache.set(cacheKey, {
		at: Date.now(),
		result
	});
	if (cache.size > 500) cache.clear();
	return result;
}
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
var one = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
var PROVIDERS = [
	"catalogue",
	"polyhaven",
	"polypizza",
	"smithsonian"
];
/** GET /api/assets?q=lantern[&providers=polyhaven,polypizza][&limit=8]  or GET /api/assets (capabilities) */
async function handleAssetsRequest(req, env, deps = {}) {
	if (req.method !== "GET") return {
		status: 405,
		body: { error: "Use GET" }
	};
	const q = one(req.query.q).trim();
	if (!q) return {
		status: 200,
		body: {
			providers: availableProviders(env),
			generate: Boolean(env.MESHY_API_KEY?.trim())
		}
	};
	if (q.length > 80) return {
		status: 400,
		body: { error: "Query too long" }
	};
	if (limited(req.ip, 60)) return {
		status: 429,
		body: { error: "Too many searches. Try again in a minute." }
	};
	const providers = one(req.query.providers).split(",").map((s) => s.trim()).filter((s) => PROVIDERS.includes(s));
	return {
		status: 200,
		body: await searchLibraries(q, env, {
			limit: Number(one(req.query.limit)) || 8,
			providers: providers.length ? providers : void 0,
			fetchImpl: deps.fetchImpl
		})
	};
}
// server/assets.ts
/** Vercel serverless function: GET /api/assets?q=... searches free model libraries. Keys come from env only. */
async function handler(req, res) {
	const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
	const out = await handleAssetsRequest({
		method: req.method,
		query: req.query ?? {},
		ip: fwd || req.socket?.remoteAddress
	}, process.env);
	res.setHeader("cache-control", req.query?.q ? "public, max-age=300" : "no-store");
	res.status(out.status).json(out.body);
}
export { handler as default };
