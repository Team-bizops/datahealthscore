// Mapa de campos: para cada informação, quanto está na propriedade oficial,
// quanto está vazio na oficial mas preenchido em outra propriedade, e quanto está vazio em tudo.
import { PORTAL, LEAD_PIPELINES, LEAD_AGENDADO } from './config.mjs';
import { assoc } from './hubspot.mjs';

const vazio = (v) => v == null || String(v).trim() === '';
const normName = (s) => (s || '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const link = (t, id) => `https://app.hubspot.com/contacts/${PORTAL}/record/${t}/${id}`;
const PUB = /^(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\./;

export function computeMapa({ companies, contacts, leads, P }) {
  const g = (rec, obj, k) => { const n = P[obj][k]; return n ? rec.p[n] : undefined; };
  const tem = (obj, k) => !!P[obj][k];
  const emps = companies.filter(c => !normName(g(c, 'companies', 'nome')).startsWith('rankmyapp') && !String(g(c, 'companies', 'dominio') || '').toLowerCase().includes('rankmyapp'));
  const cts = contacts.filter(c => !/@rankmyapp/i.test(g(c, 'contacts', 'email') || ''));
  const lds = leads.filter(l => LEAD_PIPELINES.includes(String(g(l, 'leads', 'pipeline'))));
  const linhas = [], lists = {};
  let n = 0;
  const novoId = () => { n += 1; return `MAP-${String(n).padStart(2, '0')}`; };
  const add = (objeto, informacao, arr, obj, oficial, alternativas, nomeFn, linkFn, extra) => {
    if (!tem(obj, oficial) && !(extra && extra.oficial)) return;
    const id = novoId();
    const alts = alternativas.filter(a => a.get || tem(obj, a.k));
    const ofVal = (r) => extra && extra.oficial ? extra.oficial(r) : g(r, obj, oficial);
    const rot = extra && extra.rotulo || P[obj][oficial];
    let vazioOf = 0, naAlt = 0, vazioTudo = 0;
    const lAlt = [], lVazio = [];
    for (const r of arr) {
      if (!vazio(ofVal(r))) continue;
      vazioOf += 1;
      const hit = alts.find(a => !vazio(a.get ? a.get(r) : g(r, obj, a.k)));
      const base = { record_id: r.id, nome: nomeFn(r) };
      if (hit) { naAlt += 1; lAlt.push({ ...base, propriedade_oficial: rot, propriedade_com_valor: hit.rotulo || P[obj][hit.k], valor_encontrado: String(hit.get ? hit.get(r) : g(r, obj, hit.k)), link_hubspot: linkFn(r), _erro: true, _uso: true }); }
      else { vazioTudo += 1; lVazio.push({ ...base, propriedade_oficial: rot, link_hubspot: linkFn(r), _erro: true, _uso: true }); }
    }
    lists[`${id}.1`] = lAlt; lists[`${id}.2`] = lVazio;
    linhas.push({ id, objeto, informacao, oficial: rot, alternativas: alts.map(a => a.rotulo || P[obj][a.k]), total: arr.length,
      preenchido: arr.length - vazioOf, vazio_oficial: vazioOf, na_alternativa: naAlt, vazio_tudo: vazioTudo, nota: extra && extra.nota || '' });
  };
  const nE = (r) => g(r, 'companies', 'nome') || '', lE = (r) => link('0-2', r.id);
  const nC = (r) => [g(r, 'contacts', 'nome'), g(r, 'contacts', 'sobrenome')].filter(Boolean).join(' ') || (g(r, 'contacts', 'email') || ''), lC = (r) => link('0-1', r.id);
  const nL = (r) => g(r, 'leads', 'nome') || '', lL = (r) => link('0-136', r.id);

  // Empresas
  add('Empresa', 'Nome da empresa', emps, 'companies', 'nome', [], nE, lE);
  add('Empresa', 'Porte', emps, 'companies', 'porte', [{ k: 'funcionarios' }], nE, lE);
  add('Empresa', 'Segmento', emps, 'companies', 'segmento', [{ k: 'industry' }], nE, lE);
  add('Empresa', 'País', emps, 'companies', 'pais', [{ k: 'country' }], nE, lE);
  add('Empresa', 'Abrangência', emps, 'companies', 'abrangencia', [], nE, lE);
  add('Empresa', 'Domínio', emps, 'companies', 'dominio', [{ k: 'website' }], nE, lE);
  add('Empresa', 'CNPJ (só Cliente)', emps.filter(c => String(g(c, 'companies', 'lifecycle') || '').toLowerCase() === 'customer'), 'companies', 'cnpj', [], nE, lE, { nota: 'Avalia só empresas com lifecycle Cliente' });
  add('Empresa', 'LinkedIn', emps, 'companies', 'linkedin', [{ k: 'linkedin_alt' }], nE, lE, { nota: 'Informativo' });
  // Contatos
  add('Contato', 'Nome', cts, 'contacts', 'nome', [], nC, lC);
  add('Contato', 'Sobrenome', cts, 'contacts', 'sobrenome', [], nC, lC, { nota: 'Informativo' });
  {
    const id = novoId(), cat = { corporativo: [], publico: [], sem: [] };
    for (const r of cts) { const e = String(g(r, 'contacts', 'email') || '').toLowerCase(), d = e.includes('@') ? e.split('@')[1] : '';
      const k = !e ? 'sem' : PUB.test(d) ? 'publico' : 'corporativo';
      cat[k].push({ record_id: r.id, nome: nC(r), email: e, tipo: k === 'sem' ? 'Sem e-mail' : k === 'publico' ? 'Público' : 'Corporativo', link_hubspot: lC(r), _erro: true, _uso: true }); }
    lists[`${id}.1`] = cat.corporativo; lists[`${id}.2`] = cat.publico; lists[`${id}.3`] = cat.sem;
    linhas.push({ id, objeto: 'Contato', informacao: 'E-mail', tipo: 'categorias', oficial: P.contacts.email, alternativas: [], total: cts.length,
      categorias: [{ rotulo: 'Corporativo', n: cat.corporativo.length, lista: `${id}.1`, cor: 'ok' }, { rotulo: 'Público', n: cat.publico.length, lista: `${id}.2`, cor: 'alt' }, { rotulo: 'Sem e-mail', n: cat.sem.length, lista: `${id}.3`, cor: 'vazio' }] });
  }
  add('Contato', 'Hierarquia do cargo', cts, 'contacts', 'cargo', [{ k: 'jobtitle' }, { k: 'seniority' }], nC, lC, { nota: 'Comparável com a senioridade do Breeze (hs_seniority)' });
  add('Contato', 'Área do POC', cts, 'contacts', 'area_poc', [{ k: 'role' }, { k: 'subrole' }], nC, lC);
  add('Contato', 'LinkedIn', cts, 'contacts', 'linkedin', [{ k: 'linkedin_alt' }], nC, lC);
  add('Contato', 'Empresa associada', cts, 'contacts', 'empresa', [{ k: 'empresa', rotulo: 'company (texto)', get: (r) => g(r, 'contacts', 'empresa') }], nC, lC,
    { rotulo: 'associação com empresa', oficial: (r) => (assoc(r, 'compan').length ? 'sim' : '') });
  // Leads
  const eleg = (l) => LEAD_AGENDADO.includes(String(g(l, 'leads', 'etapa'))) || !vazio(g(l, 'leads', 'agendamento')) || !vazio(g(l, 'leads', 'entrou_sdr')) || !vazio(g(l, 'leads', 'entrou_exec'));
  for (const [pid, pnome] of [['739923376', 'SDRs'], ['916004981', 'Executivos']]) {
    const arr = lds.filter(l => String(g(l, 'leads', 'pipeline')) === pid);
    const ag = arr.filter(eleg);
    add(`Lead · ${pnome}`, 'Origem', arr, 'leads', 'origem', [], nL, lL);
    add(`Lead · ${pnome}`, 'Contato associado', arr, 'leads', 'nome', [{ k: 'email', rotulo: 'e-mail do lead', get: (r) => g(r, 'leads', 'email') }], nL, lL,
      { rotulo: 'associação com contato', oficial: (r) => (assoc(r, 'contact').length ? 'sim' : '') });
    add(`Lead · ${pnome}`, 'Empresa associada', arr, 'leads', 'nome', [], nL, lL,
      { rotulo: 'associação com empresa', oficial: (r) => (assoc(r, 'compan').length ? 'sim' : '') });
    add(`Lead · ${pnome}`, 'Operação (agendados)', ag, 'leads', 'operacao', [], nL, lL, { nota: 'Só leads que estão ou passaram por Reunião Agendada/Agendado' });
    add(`Lead · ${pnome}`, 'Intenção de compra (agendados)', ag, 'leads', 'intencao', [], nL, lL, { nota: 'Só leads que estão ou passaram por Reunião Agendada/Agendado' });
  }
  return { mapa: linhas, lists };
}
