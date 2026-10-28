// Mapa de campos: para cada informação, quanto está na propriedade oficial,
// quanto está vazio na oficial mas preenchido em outra propriedade, e quanto está vazio em tudo.
import { PORTAL, LEAD_PIPELINES } from './config.mjs';
import { assoc } from './hubspot.mjs';

const vazio = (v) => v == null || String(v).trim() === '';
const normName = (s) => (s || '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const link = (t, id) => `https://app.hubspot.com/contacts/${PORTAL}/record/${t}/${id}`;

export function computeMapa({ companies, contacts, leads, P }) {
  const g = (rec, obj, k) => { const n = P[obj][k]; return n ? rec.p[n] : undefined; };
  const tem = (obj, k) => !!P[obj][k];
  const emps = companies.filter(c => !normName(g(c, 'companies', 'nome')).startsWith('rankmyapp') && !String(g(c, 'companies', 'dominio') || '').toLowerCase().includes('rankmyapp'));
  const cts = contacts.filter(c => !/@rankmyapp/i.test(g(c, 'contacts', 'email') || ''));
  const lds = leads.filter(l => LEAD_PIPELINES.includes(String(g(l, 'leads', 'pipeline'))));
  const linhas = [], lists = {};
  let n = 0;
  const add = (objeto, informacao, arr, obj, oficial, alternativas, nomeFn, linkFn, extra) => {
    if (!tem(obj, oficial)) return;
    n += 1;
    const id = `MAP-${String(n).padStart(2, '0')}`;
    const alts = alternativas.filter(a => tem(obj, a.k));
    const ofVal = (r) => extra && extra.oficial ? extra.oficial(r) : g(r, obj, oficial);
    let vazioOf = 0, naAlt = 0, vazioTudo = 0;
    const lAlt = [], lVazio = [];
    for (const r of arr) {
      if (!vazio(ofVal(r))) continue;
      vazioOf += 1;
      const hit = alts.find(a => !vazio(a.get ? a.get(r) : g(r, obj, a.k)));
      const base = { record_id: r.id, nome: nomeFn(r) };
      if (hit) { naAlt += 1; lAlt.push({ ...base, propriedade_oficial: extra && extra.rotulo || P[obj][oficial], propriedade_com_valor: hit.rotulo || P[obj][hit.k], valor_encontrado: String(hit.get ? hit.get(r) : g(r, obj, hit.k)), link_hubspot: linkFn(r), _erro: true, _uso: true }); }
      else { vazioTudo += 1; lVazio.push({ ...base, propriedade_oficial: extra && extra.rotulo || P[obj][oficial], link_hubspot: linkFn(r), _erro: true, _uso: true }); }
    }
    lists[`${id}.1`] = lAlt; lists[`${id}.2`] = lVazio;
    linhas.push({ id, objeto, informacao, oficial: extra && extra.rotulo || P[obj][oficial], alternativas: alts.map(a => a.rotulo || P[obj][a.k]), total: arr.length,
      preenchido: arr.length - vazioOf, vazio_oficial: vazioOf, na_alternativa: naAlt, vazio_tudo: vazioTudo });
  };
  const nE = (r) => g(r, 'companies', 'nome') || '', lE = (r) => link('0-2', r.id);
  const nC = (r) => [g(r, 'contacts', 'nome'), g(r, 'contacts', 'sobrenome')].filter(Boolean).join(' ') || (g(r, 'contacts', 'email') || ''), lC = (r) => link('0-1', r.id);
  const nL = (r) => g(r, 'leads', 'nome') || '', lL = (r) => link('0-136', r.id);

  add('Empresa', 'Porte', emps, 'companies', 'porte', [{ k: 'funcionarios' }], nE, lE);
  add('Empresa', 'Nº de funcionários', emps, 'companies', 'funcionarios', [], nE, lE);
  add('Empresa', 'Segmento', emps, 'companies', 'segmento', [{ k: 'industry' }], nE, lE);
  add('Empresa', 'País', emps, 'companies', 'pais', [{ k: 'country' }], nE, lE);
  add('Empresa', 'Abrangência', emps, 'companies', 'abrangencia', [], nE, lE);
  add('Empresa', 'Domínio', emps, 'companies', 'dominio', [{ k: 'website' }], nE, lE);
  add('Empresa', 'LinkedIn', emps, 'companies', 'linkedin', [{ k: 'linkedin_alt' }], nE, lE);
  add('Empresa', 'CNPJ', emps, 'companies', 'cnpj', [], nE, lE);
  add('Contato', 'Cargo', cts, 'contacts', 'cargo', [{ k: 'jobtitle' }, { k: 'seniority' }], nC, lC);
  add('Contato', 'Área do POC', cts, 'contacts', 'area_poc', [{ k: 'role' }, { k: 'subrole' }, { k: 'jobtitle' }], nC, lC);
  add('Contato', 'LinkedIn', cts, 'contacts', 'linkedin', [{ k: 'linkedin_alt' }], nC, lC);
  add('Contato', 'E-mail', cts, 'contacts', 'email', [], nC, lC);
  add('Contato', 'Empresa associada', cts, 'contacts', 'empresa', [{ k: 'empresa', rotulo: 'company (texto)', get: (r) => g(r, 'contacts', 'empresa') }], nC, lC,
    { rotulo: 'associação com empresa', oficial: (r) => (assoc(r, 'compan').length ? 'sim' : '') });
  for (const [pid, pnome] of [['739923376', 'SDRs'], ['916004981', 'Executivos']]) {
    const arr = lds.filter(l => String(g(l, 'leads', 'pipeline')) === pid);
    add(`Lead · ${pnome}`, 'Origem', arr, 'leads', 'origem', [], nL, lL);
    add(`Lead · ${pnome}`, 'Fonte de entrada', arr, 'leads', 'fonte_de_entrada', [], nL, lL);
    add(`Lead · ${pnome}`, 'Operação', arr, 'leads', 'operacao', [], nL, lL);
    add(`Lead · ${pnome}`, 'Contato associado', arr, 'leads', 'email', [{ k: 'email', rotulo: 'e-mail do lead', get: (r) => g(r, 'leads', 'email') }], nL, lL,
      { rotulo: 'associação com contato', oficial: (r) => (assoc(r, 'contact').length ? 'sim' : '') });
    add(`Lead · ${pnome}`, 'Empresa associada', arr, 'leads', 'nome', [], nL, lL,
      { rotulo: 'associação com empresa', oficial: (r) => (assoc(r, 'compan').length ? 'sim' : '') });
  }
  return { mapa: linhas, lists };
}
