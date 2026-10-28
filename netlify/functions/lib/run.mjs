import { getStore } from '@netlify/blobs';
import { hubspot } from './hubspot.mjs';
import { computeAll } from './rules.mjs';
import { computeMapa } from './mapa.mjs';
import { PROPS } from './config.mjs';

export const store = () => getStore({ name: 'dhs', consistency: 'strong' });

export async function runMedicao() {
  const st = store();
  const inicio = new Date();
  await st.setJSON('status', { estado: 'rodando', inicio: inicio.toISOString() });
  try {
    const token = Netlify.env.get('HUBSPOT_TOKEN');
    if (!token) throw new Error('Variável de ambiente HUBSPOT_TOKEN não configurada.');
    const hs = hubspot(token);
    const types = { companies: 'companies', contacts: 'contacts', leads: 'leads' };
    const P = {}, faltando = [];
    for (const [k, type] of Object.entries(types)) { const r = await hs.resolveProps(type, PROPS[k]); P[k] = r.map; faltando.push(...r.missing); }
    const props = (k) => Object.values(P[k]);
    const companies = await hs.listAll('companies', props('companies'));
    const contacts = await hs.listAll('contacts', props('contacts'), ['companies']);
    const leads = await hs.listAll('leads', props('leads'), ['contacts', 'companies']);
    const { summary, lists } = computeAll({ companies, contacts, leads, P });
    const mp = computeMapa({ companies, contacts, leads, P });
    summary.mapa = mp.mapa; Object.assign(lists, mp.lists);
    const fim = new Date();
    const out = { ...summary, gerado_em: fim.toISOString(), duracao_s: Math.round((fim - inicio) / 1000), propriedades_faltando: faltando };
    for (const [idp, rows] of Object.entries(lists)) await st.setJSON(`lists/${idp}`, rows);
    await st.setJSON('latest', out);
    const dia = fim.toISOString().slice(0, 10);
    await st.setJSON(`history/${dia}`, { data: dia, gerado_em: out.gerado_em, dhs: out.dhs, dimensoes: out.dimensoes.map(d => ({ dimensao: d.dimensao, nome: d.nome, total: d.total, uso: d.uso })) });
    await st.setJSON('status', { estado: 'ok', inicio: inicio.toISOString(), fim: fim.toISOString() });
  } catch (e) {
    await st.setJSON('status', { estado: 'erro', inicio: inicio.toISOString(), fim: new Date().toISOString(), erro: String(e && e.message || e) });
    throw e;
  }
}
