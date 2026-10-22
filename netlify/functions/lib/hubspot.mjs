const BASE = 'https://api.hubapi.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function hubspot(token) {
  let last = 0;
  async function req(path, opts = {}) {
    for (let attempt = 0; attempt < 7; attempt++) {
      const wait = Math.max(0, last + 115 - Date.now());
      if (wait) await sleep(wait);
      last = Date.now();
      const r = await fetch(BASE + path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) { const ra = Number(r.headers.get('retry-after')) || 2; await sleep(ra * 1000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`HubSpot ${r.status} em ${path.split('?')[0]}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    }
    throw new Error(`HubSpot: limite de tentativas em ${path.split('?')[0]}`);
  }
  // Resolve, para cada campo lógico, a primeira propriedade que existe no objeto.
  async function resolveProps(type, wanted) {
    const j = await req(`/crm/v3/properties/${type}`);
    const names = new Set(j.results.map(p => p.name));
    const map = {}, missing = [];
    for (const [k, cands] of Object.entries(wanted)) {
      const hit = cands.find(c => names.has(c));
      if (hit) map[k] = hit; else missing.push(`${type}.${k}`);
    }
    return { map, missing };
  }
  async function listAll(type, propNames, assocs = []) {
    const out = [];
    let after;
    do {
      const q = new URLSearchParams({ limit: '100', archived: 'false' });
      if (propNames.length) q.set('properties', propNames.join(','));
      if (assocs.length) q.set('associations', assocs.join(','));
      if (after) q.set('after', after);
      const j = await req(`/crm/v3/objects/${type}?${q}`);
      for (const r of j.results) out.push({ id: String(r.id), p: r.properties || {}, a: normAssoc(r.associations) });
      after = j.paging && j.paging.next && j.paging.next.after;
    } while (after);
    return out;
  }
  async function schemas() {
    const j = await req('/crm/v3/schemas');
    const map = {};
    for (const s of j.results || []) { map[s.fullyQualifiedName] = s.objectTypeId; map[s.name] = s.objectTypeId; }
    return map;
  }
  return { req, resolveProps, listAll, schemas };
}

function normAssoc(a) {
  const o = {};
  if (!a) return o;
  for (const [k, v] of Object.entries(a)) o[k.toLowerCase()] = [...new Set((v.results || []).map(x => String(x.id)))];
  return o;
}

// Ids associados a um tipo, procurando a chave pelo trecho do nome (ex.: 'compan', 'contact', 'contratos').
export function assoc(rec, ...needles) {
  const ids = new Set();
  const ns = needles.filter(Boolean).map(n => String(n).toLowerCase());
  for (const [k, v] of Object.entries(rec.a)) if (ns.some(n => k.includes(n))) v.forEach(i => ids.add(i));
  return [...ids];
}
