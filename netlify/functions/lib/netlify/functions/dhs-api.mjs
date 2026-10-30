import { store } from './lib/run.mjs';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/api\//, '');
  const st = store();

  if (rota === 'data') {
    const d = await st.get('latest', { type: 'json' });
    return d ? json(d) : json({ vazio: true }, 404);
  }
  if (rota === 'status') return json((await st.get('status', { type: 'json' })) || { estado: 'nunca' });
  if (rota === 'history') {
    const { blobs } = await st.list({ prefix: 'history/' });
    const itens = [];
    for (const b of blobs.sort((a, c) => a.key.localeCompare(c.key))) itens.push(await st.get(b.key, { type: 'json' }));
    return json(itens.filter(Boolean));
  }
  if (rota === 'lista') {
    const idp = url.searchParams.get('idp') || '';
    if (!/^[A-Z]{3}-\d{2}(\.\d)?$/.test(idp)) return json({ erro: 'IDP inválido' }, 400);
    const sit = url.searchParams.get('situacao') === 'ok' ? false : true;
    const uso = url.searchParams.get('escopo') === 'uso';
    let rows;
    const ix = await st.get(`idx/${idp}`, { type: 'json' });
    if (ix) {
      const tab = (await st.get(`tab/${ix.t}`, { type: 'json' })) || [];
      const err = new Set(ix.e);
      rows = ix.b.map(i => (ix.grp && ix.grp[i] != null
        ? { grupo_duplicidade: ix.grp[i], qtd_no_grupo: ix.qtd[ix.grp[i]], ...tab[i], _erro: err.has(i), _g: ix.grp[i] }
        : { ...tab[i], _erro: err.has(i) }));
    } else rows = (await st.get(`lists/${idp}`, { type: 'json' })) || [];
    let sel = rows.filter(r => r._erro === sit && (!uso || r._uso));
    if (ix && ix.grp && sit) sel = sel.sort((a, b) => (b.qtd_no_grupo - a.qtd_no_grupo) || String(a._g).localeCompare(String(b._g)) || String(a.nome).localeCompare(String(b.nome))).map(({ _g, ...r }) => r);
    return json({ total: sel.length, rows: sel.slice(0, 10000).map(({ _erro, _uso, ...r }) => r) });
  }
  if (rota === 'run' && req.method === 'POST') {
    const s = await st.get('status', { type: 'json' });
    if (s && s.estado === 'rodando' && Date.now() - new Date(s.inicio).getTime() < 16 * 60 * 1000) return json({ ok: false, msg: 'Já existe uma medição rodando.' }, 409);
    await fetch(new URL('/api/run-bg', req.url), { method: 'POST', headers: { cookie: req.headers.get('cookie') || '', authorization: req.headers.get('authorization') || '' } });
    return json({ ok: true, msg: 'Medição iniciada.' }, 202);
  }
  return json({ erro: 'Rota não encontrada' }, 404);
};

export const config = { path: ['/api/data', '/api/status', '/api/history', '/api/lista', '/api/run'] };
