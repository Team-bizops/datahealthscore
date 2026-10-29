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
    const t0 = Date.now();
    const [companies, contacts, leads] = await Promise.all([
      hs.listAll('companies', props('companies')),
      hs.listAll('contacts', props('contacts'), ['companies']),
      hs.listAll('leads', props('leads'), ['contacts', 'companies'])
    ]);
    console.log(`HubSpot lido em ${Math.round((Date.now() - t0) / 1000)}s: ${companies.length} empresas, ${contacts.length} contatos, ${leads.length} leads`);
    const { summary, lists, tabelas } = computeAll({ companies, contacts, leads, P });
    const mp = computeMapa({ companies, contacts, leads, P });
    summary.mapa = mp.mapa;
    const fim = new Date();
    const out = { ...summary, gerado_em: fim.toISOString(), duracao_s: Math.round((fim - inicio) / 1000), propriedades_faltando: faltando };
    const st2 = store(); // token novo para gravar no fim da medição
    await st2.setJSON('latest', out);
    const dia = fim.toISOString().slice(0, 10);
    await st2.setJSON(`history/${dia}`, { data: dia, gerado_em: out.gerado_em, dhs: out.dhs, dimensoes: out.dimensoes.map(d => ({ dimensao: d.dimensao, nome: d.nome, total: d.total, uso: d.uso })) });
    for (const [t, rows] of Object.entries(tabelas)) await st2.setJSON(`tab/${t}`, rows);
    await Promise.all(Object.entries(lists).map(([idp, ix]) => st2.setJSON(`idx/${idp}`, ix)));
    await Promise.all(Object.entries(mp.lists).map(([idp, rows]) => st2.setJSON(`lists/${idp}`, rows)));
    console.log(`Gravado em ${Math.round((Date.now() - fim) / 1000)}s`);
    await store().setJSON('status', { estado: 'ok', inicio: inicio.toISOString(), fim: new Date().toISOString() });
  } catch (e) {
    try { await store().setJSON('status', { estado: 'erro', inicio: inicio.toISOString(), fim: new Date().toISOString(), erro: String(e && e.message || e) }); } catch (e2) { console.log('status não gravado', e2); }
    throw e;
  }
}
