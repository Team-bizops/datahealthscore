// API de automação: plano de correção da duplicidade de EMPRESAS (UNI-01 e UNI-03), agrupado por empresa real.
// GET /api/duplicidade?faixa=Auto excluir,Auto mesclar&acao=&regra=UNI-01,UNI-03&origem=&fonte=&criado_de=&criado_ate=&limite=50&cursor=0
// Cabeçalho obrigatório quando a variável DHS_AUTOMACAO_TOKEN estiver configurada: x-dhs-token
import { store } from './lib/run.mjs';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lista = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const num = (v) => Number(v) || 0;

export default async (req) => {
  const token = process.env.DHS_AUTOMACAO_TOKEN;
  if (token && req.headers.get('x-dhs-token') !== token) return json({ erro: 'Token inválido ou ausente (cabeçalho x-dhs-token).' }, 401);
  const url = new URL(req.url), q = url.searchParams;
  const regras = lista(q.get('regra')).length ? lista(q.get('regra')) : ['UNI-01', 'UNI-03'];
  if (regras.some(r => !['UNI-01', 'UNI-03'].includes(r))) return json({ erro: 'Só UNI-01 e UNI-03 (empresas) estão liberados para automação.' }, 400);
  const faixas = lista(q.get('faixa')), acoes = lista(q.get('acao')), origens = lista(q.get('origem'));
  const fonte = (q.get('fonte') || '').toLowerCase(), de = q.get('criado_de') || '', ate = q.get('criado_ate') || '';
  const limite = Math.min(Math.max(num(q.get('limite')) || 50, 1), 500), cursor = num(q.get('cursor'));

  const st = store();
  const resumo = await st.get('latest', { type: 'json' });
  const tab = (await st.get('tab/E', { type: 'json' })) || [];
  const reg = new Map(); // índice da empresa → registro consolidado
  for (const idp of regras) {
    const ix = await st.get(`idx/${idp}`, { type: 'json' });
    if (!ix || !ix.acao) continue;
    for (const i of ix.e) {
      const r = tab[i]; if (!r) continue;
      const atual = reg.get(i);
      if (atual) { atual.regras.push(idp); continue; }
      reg.set(i, {
        id: String(r.record_id), nome: r.nome || '', dominio: r.dominio || '', regras: [idp], grupo: ix.grp[i],
        acao: ix.acao[i], faixa_risco: ix.faixa ? ix.faixa[i] : '', motivo: ix.motivo[i],
        principal_id: String(ix.pid[i]), principal_nome: ix.pnome[i],
        campos_a_copiar: (ix.copiarJ && ix.copiarJ[i]) || [],
        divergencias: ix.diverg ? ix.diverg[i] || '' : '',
        vinculos_na_medicao: { negocios: num(r.n_negocios), contatos: num(r.n_contatos), leads: num(r.n_leads) },
        cliente: String(r.lifecycle || '').toLowerCase() === 'customer', em_uso: r.em_uso === 'sim',
        origem: r.origem || '', fonte_detalhe: r.fonte_detalhe || '', data_criacao: r.data_criacao || '', link_hubspot: r.link_hubspot || ''
      });
    }
  }
  // agrupa por empresa real (principal) e aplica os filtros nos registros que não são o principal
  const ents = new Map();
  for (const r of reg.values()) {
    if (!ents.has(r.principal_id)) ents.set(r.principal_id, { entidade_id: r.principal_id, principal: null, registros: [] });
    const e = ents.get(r.principal_id);
    if (r.id === r.principal_id) { e.principal = r; continue; }
    if (faixas.length && !faixas.includes(r.faixa_risco)) continue;
    if (acoes.length && !acoes.includes(r.acao)) continue;
    if (origens.length && !origens.includes(r.origem)) continue;
    if (fonte && !r.fonte_detalhe.toLowerCase().includes(fonte)) continue;
    if (de && r.data_criacao < de) continue;
    if (ate && r.data_criacao > ate) continue;
    e.registros.push(r);
  }
  const ordem = { 'Copiar campos e excluir': 1, 'Mesclar no principal': 2, 'Excluir': 3 };
  const todas = [...ents.values()].filter(e => e.principal && e.principal.acao === 'Manter (principal)' && e.registros.length)
    .map(e => ({ ...e, registros: e.registros.sort((a, b) => (ordem[a.acao] || 9) - (ordem[b.acao] || 9)) }))
    .sort((a, b) => b.registros.length - a.registros.length || a.entidade_id.localeCompare(b.entidade_id));
  const pagina = todas.slice(cursor, cursor + limite);
  return json({
    medicao: resumo ? resumo.gerado_em : null, versao_regras: resumo ? resumo.metodologia : null,
    filtros: { regras, faixas, acoes, origens, fonte, criado_de: de, criado_ate: ate },
    total_entidades: todas.length, total_registros: todas.reduce((s, e) => s + e.registros.length, 0),
    cursor, proximo_cursor: cursor + limite < todas.length ? cursor + limite : null,
    ordem_de_execucao: ['1. copiar campos para o principal', '2. mesclar no principal', '3. excluir (vai para a lixeira)'],
    entidades: pagina
  });
};

export const config = { path: ['/api/duplicidade'] };
