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
    // lê as decisões da revisão antes da leitura do HubSpot: o acesso ao Blobs expira poucos minutos depois do início
    const revisoes = (await st.get('revisoes', { type: 'json' })) || { decisoes: {} };
    const types = { companies: 'companies', contacts: 'contacts', leads: 'leads', deals: 'deals' };
    const P = {}, faltando = [];
    for (const [k, type] of Object.entries(types)) { const r = await hs.resolveProps(type, PROPS[k]); P[k] = r.map; faltando.push(...r.missing); }
    const props = (k) => Object.values(P[k]);
    // Leitura e cálculo numa função à parte: os dados brutos do HubSpot (a maior parte da memória) ficam livres
    // antes da gravação. Sem isso, a gravação das tabelas grandes estourava a memória e a medição reiniciava.
    const calcular = async () => {
      const t0 = Date.now();
      const [companies, contacts, leads, deals] = await Promise.all([
        hs.listAll('companies', props('companies')),
        hs.listAll('contacts', props('contacts'), ['companies']),
        hs.listAll('leads', props('leads'), ['contacts', 'companies', 'deals']),
        hs.listAll('deals', props('deals'))
      ]);
      console.log(`HubSpot lido em ${Math.round((Date.now() - t0) / 1000)}s: ${companies.length} empresas, ${contacts.length} contatos, ${leads.length} leads`);
      const r = computeAll({ companies, contacts, leads, deals, P, revisoes });
      const mp = computeMapa({ companies, contacts, leads, P });
      return { ...r, mp };
    };
    const { summary, lists, tabelas, mp } = await calcular();
    summary.revisoes = { aplicadas_em: new Date().toISOString(), total: Object.keys(revisoes.decisoes || {}).length };
    summary.mapa = mp.mapa;
    const fim = new Date();
    console.log(`Calculado em ${Math.round((fim - inicio) / 1000)}s desde o início`);
    const out = { ...summary, gerado_em: fim.toISOString(), duracao_s: Math.round((fim - inicio) / 1000), propriedades_faltando: faltando };
    const st2 = store(); // token novo para gravar no fim da medição
    const dia = fim.toISOString().slice(0, 10);
    // grava uma de cada vez (menos memória): tabelas, listas e o resumo por último:
    // o painel só muda quando as listas já estão gravadas
    const gravar = async (k, v) => { try { await st2.setJSON(k, v); } catch (e) { throw new Error(`gravando ${k}: ${e && e.message || e}`); } };
    for (const t of Object.keys(tabelas)) { await gravar(`tab/${t}`, tabelas[t]); tabelas[t] = null; }
    for (const [idp, ix] of Object.entries(lists)) await gravar(`idx/${idp}`, ix);
    for (const [idp, rows] of Object.entries(mp.lists)) await gravar(`lists/${idp}`, rows);
    await gravar(`history/${dia}`, { data: dia, gerado_em: out.gerado_em, versao: '2.0', dhs: out.dhs, dimensoes: out.dimensoes.map(d => ({ dimensao: d.dimensao, nome: d.nome, total: d.total, uso: d.uso })) });
    await gravar('latest', out);
    console.log(`Gravado em ${Math.round((Date.now() - fim) / 1000)}s`);
    await store().setJSON('status', { estado: 'ok', inicio: inicio.toISOString(), fim: new Date().toISOString() });
  } catch (e) {
    console.error('Medição falhou:', e && e.stack || e);
    try { await store().setJSON('status', { estado: 'erro', inicio: inicio.toISOString(), fim: new Date().toISOString(), erro: String(e && e.message || e) }); } catch (e2) { console.log('status não gravado', e2); }
    throw e;
  }
}
