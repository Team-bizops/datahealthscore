// Revisão de grupos de duplicidade feita no painel (BizOps).
// GET    /api/revisao                          → todas as decisões
// GET    /api/revisao?idp=UNI-01&grupo=<grupo> → empresa real do grupo (todos os registros do UNI-01/UNI-03) + decisão atual
// POST   /api/revisao  { por, tipo: 'grupo', principal_id, registros: [ids], valores: {campo: valor}, separar: [{ id, novo_nome }] }
// DELETE /api/revisao?id=<chave>
// Gravar e desfazer exigem o código de revisão no cabeçalho x-dhs-revisao (DHS_REVISAO_CODIGO, ou DHS_AUTOMACAO_TOKEN se não houver).
import { store } from './lib/run.mjs';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const CAMPOS = ['porte', 'funcionarios', 'segmento', 'pais', 'abrangencia', 'cnpj', 'linkedin', 'website', 'telefone'];

const carregar = async (st) => (await st.get('revisoes', { type: 'json' })) || { decisoes: {}, log: [] };

export default async (req) => {
  const url = new URL(req.url), q = url.searchParams, st = store();

  if (req.method === 'GET') {
    const rev = await carregar(st);
    const idp = q.get('idp'), grupo = q.get('grupo');
    if (!idp) return json({ decisoes: rev.decisoes, log: (rev.log || []).slice(-50) });
    if (!['UNI-01', 'UNI-02', 'UNI-03'].includes(idp)) return json({ erro: 'Revisão só para UNI-01, UNI-02 e UNI-03.' }, 400);
    const latest = await st.get('latest', { type: 'json' });
    const tab = (await st.get('tab/E', { type: 'json' })) || [];
    const ix = await st.get(`idx/${idp}`, { type: 'json' });
    if (!ix || !ix.grp) return json({ erro: 'Lista não encontrada. Rode uma medição.' }, 404);
    const doGrupo = ix.e.filter(i => String(ix.grp[i]) === String(grupo));
    if (!doGrupo.length) return json({ erro: 'Grupo não encontrado na última medição.' }, 404);
    // UNI-01 e UNI-03: a empresa real junta os dois IDPs pelo principal; UNI-02 fica no próprio grupo
    const regs = new Map();
    const pegar = (ixx, i, origem) => {
      const r = tab[i]; if (!r) return;
      const atual = regs.get(i); if (atual) { if (!atual.regras.includes(origem)) atual.regras.push(origem); return; }
      regs.set(i, {
        id: String(r.record_id), nome: r.nome || '', dominio: r.dominio || '', regras: [origem], grupo: ixx.grp[i],
        principal: String(ixx.pid[i]) === String(r.record_id), acao: ixx.acao ? ixx.acao[i] : '', faixa: ixx.faixa ? ixx.faixa[i] : '', motivo: ixx.motivo ? ixx.motivo[i] : '',
        divergencias: ixx.diverg ? ixx.diverg[i] || '' : '', campos_a_copiar: ixx.copiar ? ixx.copiar[i] || '' : '',
        ...Object.fromEntries(CAMPOS.map(k => [k, r[k] || ''])), industria_breeze: r.industria_breeze || '',
        n_negocios: r.n_negocios || 0, n_contatos: r.n_contatos || 0, n_leads: r.n_leads || 0, em_uso: r.em_uso === 'sim', lifecycle: r.lifecycle || '',
        contatos_emails: r.contatos_emails || '', link: r.link_hubspot || ''
      });
    };
    if (idp === 'UNI-02') doGrupo.forEach(i => pegar(ix, i, idp));
    else {
      const pids = new Set(doGrupo.map(i => String(ix.pid[i])));
      for (const outro of ['UNI-01', 'UNI-03']) {
        const ixx = outro === idp ? ix : await st.get(`idx/${outro}`, { type: 'json' });
        if (ixx && ixx.pid) ixx.e.forEach(i => { if (pids.has(String(ixx.pid[i]))) pegar(ixx, i, outro); });
      }
    }
    const registros = [...regs.values()].sort((a, b) => (b.principal - a.principal) || a.nome.localeCompare(b.nome));
    const ids = new Set(registros.map(r => r.id));
    const decisao = Object.entries(rev.decisoes).find(([, d]) => d.tipo === 'grupo' && (d.registros || []).some(id => ids.has(String(id))));
    const separadas = Object.entries(rev.decisoes).filter(([, d]) => d.tipo === 'separar' && ids.has(String(d.id))).map(([k, d]) => ({ chave: k, ...d }));
    return json({ idp, grupo, medicao: latest ? latest.gerado_em : null, registros, decisao: decisao ? { chave: decisao[0], ...decisao[1] } : null, separadas });
  }

  // gravar e desfazer
  const codigo = process.env.DHS_REVISAO_CODIGO || process.env.DHS_AUTOMACAO_TOKEN;
  if (!codigo || req.headers.get('x-dhs-revisao') !== codigo) return json({ erro: 'Código de revisão inválido.' }, 401);

  if (req.method === 'DELETE') {
    const chave = q.get('id');
    const rev = await carregar(st);
    if (!rev.decisoes[chave]) return json({ erro: 'Decisão não encontrada.' }, 404);
    const d = rev.decisoes[chave]; delete rev.decisoes[chave];
    rev.log = [...(rev.log || []), { em: new Date().toISOString(), por: q.get('por') || '', acao: 'desfez', chave, tipo: d.tipo }].slice(-500);
    await st.setJSON('revisoes', rev);
    return json({ ok: true });
  }

  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
    const por = String(b.por || '').trim().slice(0, 60);
    if (!por) return json({ erro: 'Informe quem está revisando.' }, 400);
    const registros = (b.registros || []).map(String).filter(Boolean);
    const separar = (b.separar || []).filter(s => s && s.id && String(s.novo_nome || '').trim()).map(s => ({ id: String(s.id), novo_nome: String(s.novo_nome).trim().slice(0, 200), nome_atual: String(s.nome_atual || '') }));
    if ((b.separar || []).length !== separar.length) return json({ erro: 'Todo registro marcado como "não é a mesma empresa" precisa do nome novo.' }, 400);
    const valores = {};
    for (const [k, v] of Object.entries(b.valores || {})) if (CAMPOS.includes(k) && String(v ?? '').trim()) valores[k] = String(v).trim();
    const principal = String(b.principal_id || '');
    if (registros.length && !registros.includes(principal)) return json({ erro: 'O principal precisa estar entre os registros aprovados.' }, 400);
    if (!registros.length && !separar.length) return json({ erro: 'Nada para gravar.' }, 400);

    const rev = await carregar(st), em = new Date().toISOString();
    const todos = new Set([...registros, ...separar.map(s => s.id)]);
    // substitui decisões anteriores que envolvem os mesmos registros
    for (const [k, d] of Object.entries(rev.decisoes)) {
      if (d.tipo === 'grupo' && (d.registros || []).some(id => todos.has(String(id)))) delete rev.decisoes[k];
      if (d.tipo === 'separar' && todos.has(String(d.id))) delete rev.decisoes[k];
    }
    if (registros.length > 1) rev.decisoes[`g:${principal}`] = { tipo: 'grupo', principal_id: principal, registros, valores, grupo: String(b.grupo || ''), idp: String(b.idp || ''), por, em };
    separar.forEach(s => { rev.decisoes[`s:${s.id}`] = { tipo: 'separar', ...s, grupo: String(b.grupo || ''), por, em }; });
    rev.log = [...(rev.log || []), { em, por, acao: 'aprovou', grupo: String(b.grupo || ''), principal, registros: registros.length, separados: separar.length, valores }].slice(-500);
    await st.setJSON('revisoes', rev);
    return json({ ok: true, msg: 'Revisão gravada. Vale a partir da próxima medição do DHS.' });
  }
  return json({ erro: 'Método não suportado.' }, 405);
};

export const config = { path: ['/api/revisao'] };
