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
    const rows = (await st.get(`lists/${idp}`, { type: 'json' })) || [];
    const f = rows.filter(r => r._erro === sit && (!uso || r._uso)).slice(0, 10000).map(({ _erro, _uso, ...r }) => r);
    return json({ total: rows.filter(r => r._erro === sit && (!uso || r._uso)).length, rows: f });
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
