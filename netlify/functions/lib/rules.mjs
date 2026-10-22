import { PESOS, LEAD_PIPELINES, LEAD_AGENDADO, LEAD_FECHADO, DEAL_PIPE_RMAPP, CLIENTE_ATIVO, CONTRATO_VIGENTE, PORTAL } from './config.mjs';
import { assoc } from './hubspot.mjs';

const PUB = /^(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\./;
const vazio = (v) => v == null || String(v).trim() === '';
const normDom = (d) => (d || '').trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
const rootKey = (dom) => { let m = dom.match(/([a-z0-9-]+)\.(?:com|net|org|gov|edu|co)\.[a-z]{2}$/); if (m) return m[1]; m = dom.match(/([a-z0-9-]+)\.[a-z]{2,}$/); return m ? m[1] : dom; };
const normName = (s) => (s || '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const digits = (s) => (s || '').replace(/\D/g, '');
const num = (v) => (vazio(v) ? null : Number(v));

function cnpjValido(cn) {
  if (cn.length !== 14 || /^(\d)\1{13}$/.test(cn)) return false;
  const dv = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(cn[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(cn[12]) && dv(13) === Number(cn[13]);
}
// Faixas oficiais: Micro 1–9, Pequena 10–49, Média 50–99, Grande 100–999, Enterprise 1000+
function porteCoerente(porte, n) {
  const p = (porte || '').toLowerCase();
  if (p.startsWith('micro')) return n >= 1 && n <= 9;
  if (p.startsWith('pequena')) return n >= 10 && n <= 49;
  if (p.startsWith('m') && p.includes('dia')) return n >= 50 && n <= 99;
  if (p.startsWith('grande')) return n >= 100 && n <= 999;
  if (p.startsWith('enterprise')) return n >= 1000;
  return true;
}
const link = (typeId, id) => `https://app.hubspot.com/contacts/${PORTAL}/record/${typeId}/${id}`;

export function computeAll(d) {
  const { companies, contacts, deals, leads, clientes, contratos, grupos, P, T } = d;
  const g = (rec, obj, k) => { const name = P[obj][k]; return name ? rec.p[name] : undefined; };

  // ---------- índices ----------
  const comp = new Map(companies.map(c => [c.id, c]));
  const contactCompanies = new Map(contacts.map(c => [c.id, assoc(c, 'compan')]));
  const leadsF = leads.filter(l => LEAD_PIPELINES.includes(String(g(l, 'leads', 'pipeline'))));
  const leadAberto = (l) => !LEAD_FECHADO.includes(String(g(l, 'leads', 'etapa')));
  const empLeadAberto = new Set(), ctLead = new Set();
  for (const l of leadsF) { assoc(l, 'contact').forEach(i => ctLead.add(i)); if (leadAberto(l)) assoc(l, 'compan').forEach(i => empLeadAberto.add(i)); }
  const ganhoEmp = new Set();
  for (const dl of deals) if (String(g(dl, 'deals', 'ganho')) === 'true') assoc(dl, 'compan').forEach(i => ganhoEmp.add(i));
  const cliEmp = new Set();
  for (const c of clientes) assoc(c, 'compan').forEach(i => cliEmp.add(i));

  // ---------- empresas ----------
  const isInternal = (c) => normName(g(c, 'companies', 'nome')).startsWith('rankmyapp') || normDom(g(c, 'companies', 'dominio')).includes('rankmyapp');
  const emps = companies.filter(c => !isInternal(c));
  const byRoot = new Map(), byName = new Map();
  for (const c of emps) {
    const dom = normDom(g(c, 'companies', 'dominio'));
    if (dom && !PUB.test(dom)) { const k = rootKey(dom); byRoot.set(k, (byRoot.get(k) || 0) + 1); }
    const nm = normName(g(c, 'companies', 'nome'));
    if (nm.length >= 3) byName.set(nm, (byName.get(nm) || 0) + 1);
  }
  const E = emps.map(c => {
    const dom = normDom(g(c, 'companies', 'dominio')), nm = normName(g(c, 'companies', 'nome'));
    const porte = g(c, 'companies', 'porte'), func = num(g(c, 'companies', 'funcionarios'));
    const pais = (g(c, 'companies', 'pais') || '').trim().toLowerCase();
    const cn = digits(g(c, 'companies', 'cnpj'));
    const life = (g(c, 'companies', 'lifecycle') || '').toLowerCase();
    const rk = dom && !PUB.test(dom) ? rootKey(dom) : null;
    const dupKey = (rk && byRoot.get(rk) > 1) ? rk : (nm.length >= 3 && byName.get(nm) > 1 ? nm : null);
    const f = {
      porte_base: !vazio(porte) && func != null, cnpj_base: cn !== '' && ['', 'brasil', 'brazil', 'br'].includes(pais), ganho_base: ganhoEmp.has(c.id),
      sem_func: func == null, sem_abrang: vazio(g(c, 'companies', 'abrangencia')), sem_pais: vazio(pais), sem_segmento: vazio(g(c, 'companies', 'segmento')),
      sem_porte: vazio(porte), sem_dominio: vazio(dom), dup: !!dupKey, sem_contato: (num(g(c, 'companies', 'n_contatos')) || 0) === 0
    };
    f.porte_err = f.porte_base && !porteCoerente(porte, func);
    f.cnpj_err = f.cnpj_base && !cnpjValido(cn);
    f.ganho_err = f.ganho_base && !['customer', 'evangelist', 'other'].includes(life);
    f.acu = f.porte_err || f.cnpj_err; f.con = f.ganho_err;
    f.com = f.sem_func || f.sem_abrang || f.sem_pais || f.sem_segmento || f.sem_porte || f.sem_dominio;
    f.saudavel = !(f.acu || f.con || f.com || f.dup || f.sem_contato);
    const uso = (num(g(c, 'companies', 'n_negocios')) || 0) > 0 || life === 'customer' || empLeadAberto.has(c.id);
    const row = { record_id: c.id, nome: g(c, 'companies', 'nome') || '', dominio: g(c, 'companies', 'dominio') || '', grupo_duplicidade: dupKey || '',
      porte: porte || '', funcionarios: func == null ? '' : String(func), segmento: g(c, 'companies', 'segmento') || '', pais: g(c, 'companies', 'pais') || '',
      abrangencia: g(c, 'companies', 'abrangencia') || '', cnpj: g(c, 'companies', 'cnpj') || '', lifecycle: life, origem: g(c, 'companies', 'origem') || '(vazio)',
      em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-2', c.id) };
    return { id: c.id, uso, origem: row.origem, f, row };
  });

  // ---------- contatos ----------
  const cts = contacts.filter(c => !/@rankmyapp/i.test(g(c, 'contacts', 'email') || ''));
  const dupCt = new Map();
  const ctKey = (c) => { const n = (g(c, 'contacts', 'nome') || '').trim().toLowerCase(), s = (g(c, 'contacts', 'sobrenome') || '').trim().toLowerCase(), e = (g(c, 'contacts', 'empresa') || '').trim().toLowerCase(); return n && e ? `${n} ${s} · ${e}` : null; };
  for (const c of cts) { const k = ctKey(c); if (k) dupCt.set(k, (dupCt.get(k) || 0) + 1); }
  const C = cts.map(c => {
    const email = (g(c, 'contacts', 'email') || '').toLowerCase(), dEmail = email.includes('@') ? email.split('@')[1] : '';
    const pub = PUB.test(dEmail);
    const empIds = (contactCompanies.get(c.id) || []).filter(i => comp.has(i));
    const doms = empIds.map(i => normDom(g(comp.get(i), 'companies', 'dominio'))).filter(Boolean);
    const nNeg = num(g(c, 'contacts', 'n_negocios')) || 0;
    const k = ctKey(c);
    const f = { dominio_base: doms.length > 0 && !!dEmail && !pub, sem_cargo: vazio(g(c, 'contacts', 'cargo')), sem_area: vazio(g(c, 'contacts', 'area_poc')),
      dup: !!(k && dupCt.get(k) > 1), com_negocio: nNeg > 0, neg_sem_emp: nNeg > 0 && empIds.length === 0 };
    f.dominio_div = f.dominio_base && !doms.some(dm => dEmail === dm || dEmail.endsWith('.' + dm) || dm.endsWith('.' + dEmail));
    f.con = f.dominio_div; f.com = f.sem_cargo || f.sem_area; f.intg = f.neg_sem_emp;
    f.saudavel = !(f.con || f.com || f.intg);
    const uso = nNeg > 0 || ctLead.has(c.id) || !vazio(g(c, 'contacts', 'mql'));
    const row = { record_id: c.id, nome: g(c, 'contacts', 'nome') || '', sobrenome: g(c, 'contacts', 'sobrenome') || '', email, empresa: g(c, 'contacts', 'empresa') || '',
      grupo_duplicidade: f.dup ? k : '', cargo: g(c, 'contacts', 'cargo') || '', area_poc: g(c, 'contacts', 'area_poc') || '', origem: g(c, 'contacts', 'origem') || '(vazio)',
      em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-1', c.id) };
    return { id: c.id, uso, origem: row.origem, f, row };
  });

  // ---------- negócios ----------
  const minCli = clientes.map(c => g(c, 'clientes', 'criado')).filter(Boolean).sort()[0] || '9999';
  const N = deals.map(dl => {
    const emps2 = assoc(dl, 'compan').filter(i => comp.has(i)), cts2 = assoc(dl, 'contact');
    const cn = digits(g(dl, 'deals', 'cnpj'));
    const cnEmp = emps2.map(i => digits(g(comp.get(i), 'companies', 'cnpj'))).filter(x => x.length === 14);
    const won = String(g(dl, 'deals', 'ganho')) === 'true';
    const f = {
      cnpj_base: cn.length === 14 && cnEmp.length > 0,
      assoc_base: emps2.length > 0 && cts2.length > 0,
      ganho_base: won && String(g(dl, 'deals', 'pipeline')) === DEAL_PIPE_RMAPP && (g(dl, 'deals', 'fechamento') || '') >= minCli && emps2.length > 0,
      intg: emps2.length === 0 || cts2.length === 0
    };
    f.cnpj_div = f.cnpj_base && cnEmp.every(x => x.slice(0, 8) !== cn.slice(0, 8));
    f.contato_fora = f.assoc_base && cts2.some(ci => !(contactCompanies.get(ci) || []).some(e => emps2.includes(e)));
    f.ganho_sem_cliente = f.ganho_base && !emps2.some(e => cliEmp.has(e));
    return { id: dl.id, f, nome: g(dl, 'deals', 'nome') || '', cnpj: g(dl, 'deals', 'cnpj') || '', etapa: g(dl, 'deals', 'etapa') || '', fechamento: g(dl, 'deals', 'fechamento') || '' };
  });

  // ---------- contratos ----------
  const ctrById = new Map(contratos.map(x => [x.id, x]));
  const contratoCliente = new Map();
  for (const c of clientes) assoc(c, 'contrato', T.contratos).forEach(k => { if (!contratoCliente.has(k)) contratoCliente.set(k, c.id); });
  for (const x of contratos) assoc(x, 'cliente', T.clientes).forEach(k => { if (!contratoCliente.has(x.id)) contratoCliente.set(x.id, k); });
  const dupGrp = new Map();
  const ctrKey = (x) => { const ini = g(x, 'contratos', 'inicio'), mrr = num(g(x, 'contratos', 'mrr')); if (!ini || !(mrr > 0) || !contratoCliente.has(x.id)) return null;
    return [contratoCliente.get(x.id), ini, g(x, 'contratos', 'fim') || '', mrr.toFixed(2), g(x, 'contratos', 'store') || '', (g(x, 'contratos', 'apps') || '').toLowerCase(), g(x, 'contratos', 'numero') || ''].join('|'); };
  for (const x of contratos) { const k = ctrKey(x); if (k) dupGrp.set(k, (dupGrp.get(k) || 0) + 1); }
  const K = contratos.map(x => { const k = ctrKey(x); const f = { dup: !!(k && dupGrp.get(k) > 1), sem_cliente: !contratoCliente.has(x.id), vigente: CONTRATO_VIGENTE.includes(String(g(x, 'contratos', 'etapa'))) };
    f.saudavel = !(f.dup || f.sem_cliente); return { id: x.id, f, nome: g(x, 'contratos', 'nome') || '', chave: f.dup ? k : '', mrr: num(g(x, 'contratos', 'mrr')) || 0 }; });
  const Kmap = new Map(K.map(k => [k.id, k]));

  // ---------- clientes ----------
  const L = clientes.map(c => {
    const emps2 = assoc(c, 'compan').filter(i => comp.has(i)), cts2 = assoc(c, 'contact');
    const ctrs = [...new Set([...assoc(c, 'contrato', T.contratos), ...[...contratoCliente.entries()].filter(([, v]) => v === c.id).map(([k]) => k)])].filter(k => Kmap.has(k));
    const vig = ctrs.map(k => Kmap.get(k)).filter(k => k.f.vigente);
    const ativo = CLIENTE_ATIVO.includes(String(g(c, 'clientes', 'etapa')));
    const mrrCli = num(g(c, 'clientes', 'mrr')) || 0, mrrVig = vig.reduce((s, k) => s + k.mrr, 0);
    const cnC = digits(g(c, 'clientes', 'cnpj')), porteC = g(c, 'clientes', 'porte'), segC = g(c, 'clientes', 'segmento');
    const f = { ativo, tem_emp: emps2.length > 0, tem_ct: cts2.length > 0, n_vig: vig.length };
    f.lifecycle_err = ativo && f.tem_emp && !emps2.some(i => ['customer', 'evangelist'].includes((g(comp.get(i), 'companies', 'lifecycle') || '').toLowerCase()));
    f.sem_contrato = ativo && vig.length === 0;
    f.mrr_div = ativo && vig.length > 0 && Math.abs(mrrCli - mrrVig) > 1;
    f.dados_div = f.tem_emp && emps2.some(i => { const e = comp.get(i); const cnE = digits(g(e, 'companies', 'cnpj'));
      return (cnC && cnE && cnC.slice(0, 8) !== cnE.slice(0, 8)) || (!vazio(porteC) && !vazio(g(e, 'companies', 'porte')) && porteC !== g(e, 'companies', 'porte')) || (!vazio(segC) && !vazio(g(e, 'companies', 'segmento')) && segC !== g(e, 'companies', 'segmento')); });
    f.contato_fora = f.tem_emp && f.tem_ct && cts2.some(ci => !(contactCompanies.get(ci) || []).some(e => emps2.includes(e)));
    f.saudavel = !(f.lifecycle_err || f.sem_contrato || f.mrr_div || f.dados_div || f.contato_fora || !f.tem_emp || !f.tem_ct);
    return { id: c.id, f, nome: g(c, 'clientes', 'nome') || '', mrrCli, mrrVig };
  });

  // ---------- grupos ----------
  const G = grupos.map(x => { const emps2 = assoc(x, 'compan').filter(i => comp.has(i)), cts2 = assoc(x, 'contact');
    const f = { assoc_base: emps2.length > 0 && cts2.length > 0, intg: emps2.length === 0 || cts2.length === 0 };
    f.contato_fora = f.assoc_base && cts2.some(ci => !(contactCompanies.get(ci) || []).some(e => emps2.includes(e)));
    f.saudavel = !(f.intg || f.contato_fora); return { id: x.id, f, nome: g(x, 'grupos', 'nome') || '', status: g(x, 'grupos', 'status') || '' }; });

  // ---------- leads ----------
  const LD = leadsF.map(l => { const etapa = String(g(l, 'leads', 'etapa')); const f = { agendado: LEAD_AGENDADO.includes(etapa), aberto: leadAberto(l) };
    f.agendado_sem_neg = f.agendado && assoc(l, 'deal').length === 0; f.sem_assoc = assoc(l, 'contact').length === 0 || assoc(l, 'compan').length === 0;
    f.saudavel = !(f.agendado_sem_neg || f.sem_assoc); return { id: l.id, f, nome: g(l, 'leads', 'nome') || '', etapa }; });

  // ---------- IDPs ----------
  const cnt = (arr, pred) => arr.reduce((s, x) => s + (pred(x) ? 1 : 0), 0);
  const sc = (arr, base, err) => ({ tb: cnt(arr, base), te: cnt(arr, x => base(x) && err(x)), ub: cnt(arr, x => x.uso && base(x)), ue: cnt(arr, x => x.uso && base(x) && err(x)) });
  const same = (arr, base, err) => { const r = sc(arr.map(x => ({ ...x, uso: true })), base, err); return r; };
  const all = () => true;
  const lists = {};
  const IDP = [];
  const add = (idp, dim, regra, objeto, status, s, como, lista) => {
    IDP.push({ idp, dimensao: dim, regra, objeto, status, como, nota: status === 'Oficial' || status === 'Em validação', lista: !!lista,
      total_base: s ? s.tb : null, total: s ? s.te : null, total_ok: s ? s.tb - s.te : null, total_pct: s && s.tb ? s.te / s.tb : null,
      uso_base: s ? s.ub : null, uso: s ? s.ue : null, uso_ok: s ? s.ub - s.ue : null, uso_pct: s && s.ub ? s.ue / s.ub : null });
    if (lista) lists[idp] = lista;
  };
  const listE = (base, err) => E.filter(x => base(x)).map(x => ({ ...x.row, _erro: !!err(x), _uso: x.uso }));
  const listC = (base, err) => C.filter(x => base(x)).map(x => ({ ...x.row, _erro: !!err(x), _uso: x.uso }));
  const listO = (arr, base, err, objeto, typeId, det) => arr.filter(base).map(x => ({ objeto, record_id: x.id, nome: x.nome, detalhe: det(x), link_hubspot: link(typeId, x.id), _erro: !!err(x), _uso: true }));

  add('ACU-01', 'acuracia', 'Porte incoerente com o nº de funcionários', 'Empresa', 'Oficial', sc(E, x => x.f.porte_base, x => x.f.porte_err), 'Faixa do porte (Micro 1–9, Pequena 10–49, Média 50–99, Grande 100–999, Enterprise 1000+) × nº de funcionários.', listE(x => x.f.porte_base, x => x.f.porte_err));
  add('ACU-02', 'acuracia', 'CNPJ inválido', 'Empresa', 'Oficial', sc(E, x => x.f.cnpj_base, x => x.f.cnpj_err), 'CNPJ de empresa do Brasil sem 14 dígitos, repetido ou com dígito verificador errado.', listE(x => x.f.cnpj_base, x => x.f.cnpj_err));
  add('CON-01', 'consistencia', 'CNPJ do negócio diferente do da empresa', 'Negócio', 'Oficial', same(N, x => x.f.cnpj_base, x => x.f.cnpj_div), 'Raiz do CNPJ (8 dígitos) do negócio × empresas associadas; filial passa.', listO(N, x => x.f.cnpj_base, x => x.f.cnpj_div, 'Negócio', '0-3', x => `CNPJ do negócio: ${x.cnpj}`));
  add('CON-02', 'consistencia', 'Negócio ganho, mas a empresa não está como cliente', 'Empresa', 'Oficial', sc(E, x => x.f.ganho_base, x => x.f.ganho_err), 'Empresa com negócio ganho cujo lifecycle não é cliente.', listE(x => x.f.ganho_base, x => x.f.ganho_err));
  add('CON-03', 'consistencia', 'E-mail corporativo de domínio diferente da empresa', 'Contato', 'Em validação', sc(C, x => x.f.dominio_base, x => x.f.dominio_div), 'E-mail corporativo cujo domínio não bate com nenhuma empresa associada ao contato.', listC(x => x.f.dominio_base, x => x.f.dominio_div));
  add('CON-04', 'consistencia', 'Cliente ativo cuja empresa não está como cliente', 'Cliente RMApp', 'Oficial', same(L, x => x.f.ativo && x.f.tem_emp, x => x.f.lifecycle_err), 'Cliente na etapa Ativo cuja empresa associada não está no lifecycle de cliente.', listO(L, x => x.f.ativo && x.f.tem_emp, x => x.f.lifecycle_err, 'Cliente RMApp', T.clientesId, () => 'Lifecycle da empresa associada'));
  add('CON-05', 'consistencia', 'Cliente ativo sem contrato vigente', 'Cliente RMApp', 'Oficial', same(L, x => x.f.ativo, x => x.f.sem_contrato), 'Cliente na etapa Ativo sem contrato em etapa aberta (inclui Contrato estendido).', listO(L, x => x.f.ativo, x => x.f.sem_contrato, 'Cliente RMApp', T.clientesId, x => `Contratos vigentes: ${x.f.n_vig}`));
  add('CON-06', 'consistencia', 'MRR do cliente ≠ soma dos contratos vigentes', 'Cliente RMApp', 'Oficial', same(L, x => x.f.ativo && x.f.n_vig > 0, x => x.f.mrr_div), 'MRR do cliente ativo diferente (mais de R$ 1) da soma do MRR dos contratos em etapa aberta.', listO(L, x => x.f.ativo && x.f.n_vig > 0, x => x.f.mrr_div, 'Cliente RMApp', T.clientesId, x => `MRR do cliente: ${Math.round(x.mrrCli)} · contratos vigentes: ${Math.round(x.mrrVig)}`));
  add('CON-07', 'consistencia', 'Cliente com CNPJ, porte ou segmento ≠ empresa', 'Cliente RMApp', 'Em validação', same(L, x => x.f.tem_emp, x => x.f.dados_div), 'Raiz do CNPJ, porte ou segmento do cliente diferente da empresa associada.', listO(L, x => x.f.tem_emp, x => x.f.dados_div, 'Cliente RMApp', T.clientesId, () => 'CNPJ, porte ou segmento × empresa'));
  add('CON-08', 'consistencia', 'Contato do grupo fora da empresa do grupo', 'Grupo RMAds', 'Oficial', same(G, x => x.f.assoc_base, x => x.f.contato_fora), 'Contato do grupo RMAds que não está associado a nenhuma empresa do grupo.', listO(G, x => x.f.assoc_base, x => x.f.contato_fora, 'Grupo RMAds', T.gruposId, x => `Status: ${x.status}`));
  add('CON-09', 'consistencia', 'Contato do negócio fora da empresa do negócio', 'Negócio', 'Em validação', same(N, x => x.f.assoc_base, x => x.f.contato_fora), 'Contato do negócio que não está associado a nenhuma empresa do negócio.', listO(N, x => x.f.assoc_base, x => x.f.contato_fora, 'Negócio', '0-3', x => `Etapa: ${x.etapa}`));
  add('CON-10', 'consistencia', 'Ganho RankMyApp sem cliente RMApp na empresa', 'Negócio', 'Oficial', same(N, x => x.f.ganho_base, x => x.f.ganho_sem_cliente), 'Negócio ganho do pipeline RMApp, fechado depois da criação do objeto de clientes, sem cliente RMApp na empresa.', listO(N, x => x.f.ganho_base, x => x.f.ganho_sem_cliente, 'Negócio', '0-3', x => `Fechado em ${String(x.fechamento).slice(0, 10)}`));
  add('CON-11', 'consistencia', 'Contato do cliente fora da empresa do cliente', 'Cliente RMApp', 'Oficial', same(L, x => x.f.tem_emp && x.f.tem_ct, x => x.f.contato_fora), 'Contato do cliente RMApp que não está associado a nenhuma empresa do cliente.', listO(L, x => x.f.tem_emp && x.f.tem_ct, x => x.f.contato_fora, 'Cliente RMApp', T.clientesId, () => 'Contatos × empresa do cliente'));
  add('COM-01', 'completude', 'Empresa com algum campo crítico vazio', 'Empresa', 'Oficial', sc(E, all, x => x.f.com), 'Registro inteiro conta como erro se faltar: nº de funcionários, abrangência, país, segmento, porte ou domínio.', listE(all, x => x.f.com));
  const camposE = [['COM-01.1', 'sem_func', 'Sem nº de funcionários'], ['COM-01.2', 'sem_abrang', 'Sem abrangência'], ['COM-01.3', 'sem_pais', 'Sem país'], ['COM-01.4', 'sem_segmento', 'Sem segmento'], ['COM-01.5', 'sem_porte', 'Sem porte'], ['COM-01.6', 'sem_dominio', 'Sem domínio']];
  for (const [id, k, t] of camposE) add(id, 'completude', '↳ ' + t, 'Empresa', 'Detalhe', sc(E, all, x => x.f[k]), 'Detalhe do COM-01, fora da nota.', listE(all, x => x.f[k]));
  add('COM-02', 'completude', 'Contato com cargo ou área do POC vazio', 'Contato', 'Oficial', sc(C, all, x => x.f.com), 'Registro inteiro conta como erro se faltar cargo ou área do POC.', listC(all, x => x.f.com));
  add('COM-02.1', 'completude', '↳ Sem cargo', 'Contato', 'Detalhe', sc(C, all, x => x.f.sem_cargo), 'Detalhe do COM-02, fora da nota.', listC(all, x => x.f.sem_cargo));
  add('COM-02.2', 'completude', '↳ Sem área do POC', 'Contato', 'Detalhe', sc(C, all, x => x.f.sem_area), 'Detalhe do COM-02, fora da nota.', listC(all, x => x.f.sem_area));
  add('COM-03', 'completude', 'Levantada de mão incompleta', 'Lead', 'Pendente', null, 'Aguarda definição dos campos obrigatórios.', null);
  add('UNI-01', 'unicidade', 'Empresa com mesmo domínio raiz ou nome de outra', 'Empresa', 'Em validação', sc(E, all, x => x.f.dup), 'Mesmo domínio raiz (ignora subdomínio e terminação) ou mesmo nome sem acento, espaço e pontuação.', listE(all, x => x.f.dup));
  add('UNI-02', 'unicidade', 'Contrato RMApp duplicado', 'Contrato RMApp', 'Em validação', same(K, all, x => x.f.dup), 'Contratos do mesmo cliente com mesmas datas, MRR, app, store e número.', listO(K, all, x => x.f.dup, 'Contrato RMApp', T.contratosId, x => x.chave || '—'));
  add('UNI-03', 'unicidade', 'Contato com mesmo nome, sobrenome e empresa de outro', 'Contato', 'Monitoramento', sc(C, all, x => x.f.dup), 'Fica fora da nota até existir estratégia segura de mesclagem.', listC(all, x => x.f.dup));
  add('INT-01', 'integridade', 'Empresa sem contato', 'Empresa', 'Oficial', sc(E, all, x => x.f.sem_contato), 'Empresa sem nenhum contato associado.', listE(all, x => x.f.sem_contato));
  add('INT-02', 'integridade', 'Contato com negócio, mas sem empresa', 'Contato', 'Oficial', sc(C, x => x.f.com_negocio, x => x.f.neg_sem_emp), 'Contato com negócio que não está associado a nenhuma empresa.', listC(x => x.f.com_negocio, x => x.f.neg_sem_emp));
  add('INT-03', 'integridade', 'Negócio sem empresa ou sem contato', 'Negócio', 'Oficial', same(N, all, x => x.f.intg), 'Negócio sem empresa ou sem contato associado.', listO(N, all, x => x.f.intg, 'Negócio', '0-3', x => `Etapa: ${x.etapa}`));
  add('INT-04', 'integridade', 'Cliente RMApp sem empresa', 'Cliente RMApp', 'Oficial', same(L, all, x => !x.f.tem_emp), 'Cliente RMApp sem empresa associada.', listO(L, all, x => !x.f.tem_emp, 'Cliente RMApp', T.clientesId, () => 'Empresa associada'));
  add('INT-05', 'integridade', 'Grupo sem empresa ou sem contato', 'Grupo RMAds', 'Oficial', same(G, all, x => x.f.intg), 'Grupo RMAds sem empresa ou sem contato associado.', listO(G, all, x => x.f.intg, 'Grupo RMAds', T.gruposId, x => `Status: ${x.status}`));
  add('INT-06', 'integridade', 'Contrato sem cliente', 'Contrato RMApp', 'Oficial', same(K, all, x => x.f.sem_cliente), 'Contrato RMApp sem cliente associado.', listO(K, all, x => x.f.sem_cliente, 'Contrato RMApp', T.contratosId, () => 'Cliente associado'));
  add('INT-07', 'integridade', 'Lead agendado sem negócio', 'Lead', 'Oficial', same(LD, x => x.f.agendado, x => x.f.agendado_sem_neg), 'Lead dos pipelines SDRs (Reunião Agendada) ou Executivos (Agendado) sem negócio associado.', listO(LD, x => x.f.agendado, x => x.f.agendado_sem_neg, 'Lead', '0-136', x => `Etapa: ${x.etapa}`));
  add('INT-08', 'integridade', 'Lead sem contato ou sem empresa', 'Lead', 'Oficial', same(LD, all, x => x.f.sem_assoc), 'Lead dos pipelines SDRs ou Executivos sem contato ou sem empresa.', listO(LD, all, x => x.f.sem_assoc, 'Lead', '0-136', x => `Etapa: ${x.etapa}`));
  add('INT-09', 'integridade', 'Cliente RMApp sem contato', 'Cliente RMApp', 'Oficial', same(L, all, x => !x.f.tem_ct), 'Cliente RMApp sem contato associado.', listO(L, all, x => !x.f.tem_ct, 'Cliente RMApp', T.clientesId, () => 'Contato associado'));

  // ---------- dimensões e DHS ----------
  const nomes = { acuracia: 'Acurácia', consistencia: 'Consistência entre objetos', completude: 'Completude', unicidade: 'Unicidade', integridade: 'Integridade' };
  const dimensoes = Object.keys(PESOS).map(id => {
    const rs = IDP.filter(r => r.dimensao === id && r.nota && r.total_base != null);
    const s = (ok, b) => { const B = rs.reduce((a, r) => a + r[b], 0); return B ? 100 * rs.reduce((a, r) => a + r[ok], 0) / B : 100; };
    const total = s('total_ok', 'total_base'), uso = s('uso_ok', 'uso_base');
    return { dimensao: id, nome: nomes[id], peso: PESOS[id], total, uso, impacto_total: PESOS[id] * (100 - total), impacto_uso: PESOS[id] * (100 - uso) };
  });
  const dhs = ['total', 'uso'].map(esc => {
    const media = dimensoes.reduce((s, x) => s + x.peso * x[esc], 0);
    const pior = dimensoes.reduce((m, x) => x[esc] < m[esc] ? x : m, dimensoes[0]);
    const p = pior[esc];
    const final = p < 50 ? 0.7 * media + 0.3 * p : p < 70 ? 0.85 * media + 0.15 * p : media;
    const status = final <= 50 ? 'Crítico' : final <= 70 ? 'Atenção' : final <= 85 ? 'Bom' : final <= 95 ? 'Saudável' : 'Excelente';
    return { escopo: esc, media, pior: p, pior_dimensao: pior.nome, final, status };
  });
  const pct = (a, b) => (b ? a / b : null);
  const objN = L.length + K.length + G.length;
  const saudaveis = {
    empresas_pct: pct(cnt(E, x => x.f.saudavel), E.length), empresas_uso_pct: pct(cnt(E, x => x.uso && x.f.saudavel), cnt(E, x => x.uso)), empresas_n: E.length, empresas_uso_n: cnt(E, x => x.uso),
    contatos_pct: pct(cnt(C, x => x.f.saudavel), C.length), contatos_uso_pct: pct(cnt(C, x => x.uso && x.f.saudavel), cnt(C, x => x.uso)), contatos_n: C.length, contatos_uso_n: cnt(C, x => x.uso),
    leads_pct: pct(cnt(LD, x => x.f.saudavel), LD.length), leads_abertos_pct: pct(cnt(LD, x => x.f.aberto && x.f.saudavel), cnt(LD, x => x.f.aberto)), leads_n: LD.length,
    objetos_pct: pct(cnt(L, x => x.f.saudavel) + cnt(K, x => x.f.saudavel) + cnt(G, x => x.f.saudavel), objN), objetos_n: objN,
    clientes_pct: pct(cnt(L, x => x.f.saudavel), L.length), contratos_pct: pct(cnt(K, x => x.f.saudavel), K.length), grupos_pct: pct(cnt(G, x => x.f.saudavel), G.length)
  };
  // ---------- origens ofensoras ----------
  const origemNome = { CRM_UI: 'UI de CRM', IMPORT: 'Importação', INTEGRATION: 'Integração', FORM: 'Formulários', CRM_SETTING: 'Configuração do CRM', EXTENSION: 'Extensão', EMAIL_INTEGRATION: 'Integração de e-mail', BCC_TO_CRM: 'BCC para o CRM', INTERNAL_PROCESSING: 'Processamento interno', AUTOMATION_PLATFORM: 'Automação da plataforma', API: 'API', MOBILE_IOS: 'App iOS', MOBILE_ANDROID: 'App Android', '(vazio)': 'Sem origem' };
  const errDim = { acuracia: (x, t) => t === 'E' && x.f.acu, consistencia: (x) => x.f.con, completude: (x) => x.f.com, unicidade: (x, t) => t === 'E' && x.f.dup, integridade: (x, t) => (t === 'E' ? x.f.sem_contato : x.f.intg) };
  const origens = [];
  for (const [dim, fn] of Object.entries(errDim)) {
    const acc = {};
    E.forEach(x => { if (fn(x, 'E')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    C.forEach(x => { if (fn(x, 'C')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    const tot = Object.values(acc).reduce((a, b) => a + b, 0);
    Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([o, n], i) => origens.push({ dimensao: dim, rank: i + 1, origem: origemNome[o] || o, erros: n, share: tot ? n / tot : 0 }));
  }
  const volumes = { empresas: E.length, contatos: C.length, negocios: N.length, leads: LD.length, clientes: L.length, contratos: K.length, grupos: G.length };
  return { summary: { idps: IDP, dimensoes, dhs, saudaveis, origens, volumes }, lists };
}
