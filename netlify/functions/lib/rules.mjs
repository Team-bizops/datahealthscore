// Regras do Data Health Score — escopo: Empresas, Contatos e Leads (SDRs e Executivos).
import { PESOS, LEAD_PIPELINES, LEAD_FECHADO, PORTAL } from './config.mjs';
import { assoc } from './hubspot.mjs';

const PUB = /^(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\./;
const vazio = (v) => v == null || String(v).trim() === '';
const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const normDom = (d) => (d || '').trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/[/?#].*$/, '');
const rootKey = (dom) => { let m = dom.match(/([a-z0-9-]+)\.(?:com|net|org|gov|edu|co)\.[a-z]{2}$/); if (m) return m[1]; m = dom.match(/([a-z0-9-]+)\.[a-z]{2,}$/); return m ? m[1] : dom; };
const normName = (s) => (s || '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const digits = (s) => (s || '').replace(/\D/g, '');
const num = (v) => (vazio(v) ? null : Number(v));
const link = (t, id) => `https://app.hubspot.com/contacts/${PORTAL}/record/${t}/${id}`;
const liSlug = (u, tipo) => { const m = String(u || '').toLowerCase().match(new RegExp(`linkedin\\.com/${tipo}/([^/?#]+)`)); return m ? decodeURIComponent(m[1]).replace(/\/$/, '') : null; };

function cnpjValido(cn) {
  if (cn.length !== 14 || /^(\d)\1{13}$/.test(cn)) return false;
  const dv = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(cn[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(cn[12]) && dv(13) === Number(cn[13]);
}
// Faixas oficiais: Micro 1–9, Pequena 10–49, Média 50–99, Grande 100–999, Enterprise 1000+
function porteCoerente(porte, n) {
  const p = sem(porte);
  if (p.startsWith('micro')) return n >= 1 && n <= 9;
  if (p.startsWith('pequena')) return n >= 10 && n <= 49;
  if (p.startsWith('media')) return n >= 50 && n <= 99;
  if (p.startsWith('grande')) return n >= 100 && n <= 999;
  if (p.startsWith('enterprise')) return n >= 1000;
  return true;
}
// País: nomes em português e inglês para a mesma chave
const PAISES = { brasil: 'br', brazil: 'br', br: 'br', 'estados unidos': 'us', 'united states': 'us', usa: 'us', eua: 'us', us: 'us', mexico: 'mx', mx: 'mx', argentina: 'ar', chile: 'cl', colombia: 'co', peru: 'pe',
  portugal: 'pt', espanha: 'es', spain: 'es', uruguai: 'uy', uruguay: 'uy', paraguai: 'py', paraguay: 'py', equador: 'ec', ecuador: 'ec', bolivia: 'bo', venezuela: 've', canada: 'ca',
  'reino unido': 'gb', 'united kingdom': 'gb', inglaterra: 'gb', alemanha: 'de', germany: 'de', franca: 'fr', france: 'fr', italia: 'it', italy: 'it', india: 'in', china: 'cn', japao: 'jp', japan: 'jp',
  'panama': 'pa', 'costa rica': 'cr', guatemala: 'gt', 'republica dominicana': 'do', 'dominican republic': 'do', israel: 'il', holanda: 'nl', netherlands: 'nl', 'paises baixos': 'nl', irlanda: 'ie', ireland: 'ie' };
const paisKey = (v) => { const k = sem(v); return PAISES[k] || k; };
// De-para do skill de enriquecimento
const SENIORITY_CARGO = { c_suite: 'ceo', vp: 'ceo', director: 'diretor', manager: 'gerente', senior: 'especialista', entry_level: 'analista', junior: 'analista', intern: 'estagiario', trainee: 'estagiario' };
const ROLE_AREA = { marketing: 'marketing', sales: 'vendas', product: 'produto', design: 'produto', engineering: 'tecnologia', it: 'tecnologia', technology: 'tecnologia', customer_success: 'customer success',
  support: 'customer success', service: 'customer success', legal: 'juridico', compliance: 'juridico', finance: 'financeiro', accounting: 'financeiro', crm: 'crm', operations_crm: 'crm',
  business_intelligence: 'bi', analytics: 'bi', data: 'bi', ecommerce: 'e-commerce', hr: 'recursos humanos', people: 'recursos humanos', recruiting: 'recursos humanos', operations: 'operacoes' };
const bate = (oficial, esperado) => sem(oficial).startsWith(esperado) || sem(oficial).includes(esperado);

export function computeAll(d) {
  const { companies, contacts, leads, P } = d;
  const g = (rec, obj, k) => { const name = P[obj][k]; return name ? rec.p[name] : undefined; };

  // ---------- leads (SDRs e Executivos) ----------
  const leadsF = leads.filter(l => LEAD_PIPELINES.includes(String(g(l, 'leads', 'pipeline'))));
  const leadAberto = (l) => !LEAD_FECHADO.includes(String(g(l, 'leads', 'etapa')));
  const empLeadAberto = new Set(), ctLead = new Set();
  for (const l of leadsF) { assoc(l, 'contact').forEach(i => ctLead.add(i)); if (leadAberto(l)) assoc(l, 'compan').forEach(i => empLeadAberto.add(i)); }

  // ---------- empresas ----------
  const isInternal = (c) => normName(g(c, 'companies', 'nome')).startsWith('rankmyapp') || normDom(g(c, 'companies', 'dominio')).includes('rankmyapp');
  const emps = companies.filter(c => !isInternal(c));
  const comp = new Map(emps.map(c => [c.id, c]));
  const byDom = new Map(), byRoot = new Map(), byName = new Map();
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const c of emps) {
    const dom = normDom(g(c, 'companies', 'dominio'));
    if (dom && !PUB.test(dom)) { inc(byDom, dom); inc(byRoot, rootKey(dom)); }
    const nm = normName(g(c, 'companies', 'nome')); if (nm.length >= 3) inc(byName, nm);
  }
  const E = emps.map(c => {
    const dom = normDom(g(c, 'companies', 'dominio')), nm = normName(g(c, 'companies', 'nome'));
    const porte = g(c, 'companies', 'porte'), func = num(g(c, 'companies', 'funcionarios'));
    const pais = g(c, 'companies', 'pais'), country = g(c, 'companies', 'country');
    const cn = digits(g(c, 'companies', 'cnpj'));
    const site = normDom(g(c, 'companies', 'website'));
    const li = g(c, 'companies', 'linkedin');
    const life = (g(c, 'companies', 'lifecycle') || '').toLowerCase();
    const okDom = dom && !PUB.test(dom);
    const f = {
      porte_base: !vazio(porte) && func != null, cnpj_base: cn !== '' && ['', 'br'].includes(vazio(pais) ? '' : paisKey(pais)),
      pais_base: !vazio(pais) && !vazio(country), site_base: !!dom && !!site, li_base: !vazio(li),
      sem_func: func == null, sem_abrang: vazio(g(c, 'companies', 'abrangencia')), sem_pais: vazio(pais), sem_segmento: vazio(g(c, 'companies', 'segmento')),
      sem_porte: vazio(porte), sem_dominio: vazio(dom),
      dup_dom: okDom && byDom.get(dom) > 1,
      sem_contato: (num(g(c, 'companies', 'n_contatos')) || 0) === 0
    };
    f.dup_root = okDom && !f.dup_dom && byRoot.get(rootKey(dom)) > 1;
    f.dup_nome = !f.dup_dom && !f.dup_root && nm.length >= 3 && byName.get(nm) > 1;
    f.porte_err = f.porte_base && !porteCoerente(porte, func);
    f.cnpj_err = f.cnpj_base && !cnpjValido(cn);
    f.pais_err = f.pais_base && paisKey(pais) !== paisKey(country);
    f.site_err = f.site_base && rootKey(dom) !== rootKey(site);
    f.li_err = f.li_base && !liSlug(li, 'company') && !liSlug(li, 'school') && !liSlug(li, 'showcase');
    f.acu = f.porte_err || f.cnpj_err || f.pais_err || f.site_err || f.li_err;
    f.com = f.sem_func || f.sem_abrang || f.sem_pais || f.sem_segmento || f.sem_porte || f.sem_dominio;
    f.dup = f.dup_dom || f.dup_root || f.dup_nome;
    f.saudavel = !(f.acu || f.com || f.dup || f.sem_contato);
    const uso = (num(g(c, 'companies', 'n_negocios')) || 0) > 0 || life === 'customer' || empLeadAberto.has(c.id);
    const grupo = f.dup_dom ? dom : f.dup_root ? rootKey(dom) : f.dup_nome ? nm : '';
    const row = { record_id: c.id, nome: g(c, 'companies', 'nome') || '', dominio: g(c, 'companies', 'dominio') || '', website: g(c, 'companies', 'website') || '', grupo_duplicidade: grupo,
      porte: porte || '', funcionarios: func == null ? '' : String(func), segmento: g(c, 'companies', 'segmento') || '', pais: pais || '', country: country || '',
      abrangencia: g(c, 'companies', 'abrangencia') || '', cnpj: g(c, 'companies', 'cnpj') || '', linkedin: li || '', origem: g(c, 'companies', 'origem') || '(vazio)',
      em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-2', c.id) };
    return { id: c.id, uso, origem: row.origem, f, row };
  });

  // ---------- contatos ----------
  const cts = contacts.filter(c => !/@rankmyapp/i.test(g(c, 'contacts', 'email') || ''));
  const ctById = new Map(cts.map(c => [c.id, c]));
  const contactCompanies = new Map(cts.map(c => [c.id, assoc(c, 'compan').filter(i => comp.has(i))]));
  const dupNome = new Map(), dupLi = new Map();
  const ctKey = (c) => { const n = sem(g(c, 'contacts', 'nome')), s = sem(g(c, 'contacts', 'sobrenome')), e = sem(g(c, 'contacts', 'empresa')); return n && e ? `${n} ${s} · ${e}` : null; };
  for (const c of cts) { const k = ctKey(c); if (k) inc(dupNome, k); const li = liSlug(g(c, 'contacts', 'linkedin'), 'in'); if (li) inc(dupLi, li); }
  const C = cts.map(c => {
    const email = (g(c, 'contacts', 'email') || '').toLowerCase(), dEmail = email.includes('@') ? email.split('@')[1] : '';
    const pub = PUB.test(dEmail);
    const empIds = contactCompanies.get(c.id) || [];
    const doms = empIds.map(i => normDom(g(comp.get(i), 'companies', 'dominio'))).filter(Boolean);
    const nomesEmp = empIds.map(i => normName(g(comp.get(i), 'companies', 'nome'))).filter(Boolean);
    const cargo = g(c, 'contacts', 'cargo'), sen = sem(g(c, 'contacts', 'seniority')), area = g(c, 'contacts', 'area_poc'), role = sem(g(c, 'contacts', 'role'));
    const li = g(c, 'contacts', 'linkedin'), liAlt = g(c, 'contacts', 'linkedin_alt');
    const empTxt = normName(g(c, 'contacts', 'empresa'));
    const k = ctKey(c), slug = liSlug(li, 'in');
    const f = {
      dominio_base: doms.length > 0 && !!dEmail && !pub,
      empresa_base: empTxt.length >= 3 && nomesEmp.length > 0,
      cargo_base: !vazio(cargo) && !!SENIORITY_CARGO[sen], area_base: !vazio(area) && !!ROLE_AREA[role],
      li_base: !vazio(li) && !vazio(liAlt),
      sem_cargo: vazio(cargo), sem_area: vazio(area), sem_linkedin: vazio(li),
      dup_li: !!(slug && dupLi.get(slug) > 1), dup_nome: !!(k && dupNome.get(k) > 1),
      sem_empresa: empIds.length === 0
    };
    f.dominio_div = f.dominio_base && !doms.some(dm => dEmail === dm || dEmail.endsWith('.' + dm) || dm.endsWith('.' + dEmail) || rootKey(dEmail) === rootKey(dm));
    f.empresa_div = f.empresa_base && !nomesEmp.some(n => n.includes(empTxt) || empTxt.includes(n));
    f.cargo_err = f.cargo_base && !bate(cargo, SENIORITY_CARGO[sen]);
    f.area_err = f.area_base && !bate(area, ROLE_AREA[role]);
    f.li_err = f.li_base && liSlug(li, 'in') !== liSlug(liAlt, 'in');
    f.acu = f.cargo_err || f.area_err || f.li_err;
    f.con = f.dominio_div || f.empresa_div;
    f.com = f.sem_cargo || f.sem_area || f.sem_linkedin;
    f.saudavel = !(f.acu || f.con || f.com || f.dup_li || f.sem_empresa);
    const uso = (num(g(c, 'contacts', 'n_negocios')) || 0) > 0 || ctLead.has(c.id) || !vazio(g(c, 'contacts', 'mql'));
    const row = { record_id: c.id, nome: g(c, 'contacts', 'nome') || '', sobrenome: g(c, 'contacts', 'sobrenome') || '', email, empresa: g(c, 'contacts', 'empresa') || '',
      grupo_duplicidade: f.dup_li ? `linkedin.com/in/${slug}` : (f.dup_nome ? k : ''), cargo: cargo || '', hs_seniority: g(c, 'contacts', 'seniority') || '', area_poc: area || '', hs_role: g(c, 'contacts', 'role') || '',
      linkedin: li || '', hs_linkedin_url: liAlt || '', origem: g(c, 'contacts', 'origem') || '(vazio)', em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-1', c.id) };
    return { id: c.id, uso, origem: row.origem, f, row };
  });

  // ---------- leads ----------
  const abertosPorContato = new Map();
  for (const l of leadsF) if (leadAberto(l)) for (const ci of assoc(l, 'contact')) { const k = `${g(l, 'leads', 'pipeline')}|${ci}`; inc(abertosPorContato, k); }
  const LD = leadsF.map(l => {
    const pipe = String(g(l, 'leads', 'pipeline')), sdr = pipe === '739923376';
    const ctIds = assoc(l, 'contact'), empIds = assoc(l, 'compan');
    const ct = ctIds.map(i => ctById.get(i)).find(Boolean);
    const emailL = sem(g(l, 'leads', 'email')), cargoL = g(l, 'leads', 'cargo'), telL = digits(g(l, 'leads', 'telefone'));
    const f = { aberto: leadAberto(l), sem_contato: ctIds.length === 0, sem_empresa: empIds.length === 0,
      sem_origem: vazio(g(l, 'leads', 'origem')), sem_fonte: sdr && vazio(g(l, 'leads', 'fonte_de_entrada')),
      email_base: !!ct && !!emailL && !vazio(g(ct, 'contacts', 'email')),
      cargo_base: !!ct && !vazio(cargoL) && !vazio(g(ct, 'contacts', 'cargo')),
      tel_base: !!ct && telL.length >= 8 && digits(g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular')).length >= 8,
      emp_base: !!ct && empIds.length > 0 && (contactCompanies.get(ct.id) || []).length > 0,
      dup: leadAberto(l) && ctIds.some(ci => abertosPorContato.get(`${pipe}|${ci}`) > 1) };
    f.email_div = f.email_base && emailL !== sem(g(ct, 'contacts', 'email'));
    f.cargo_div = f.cargo_base && sem(cargoL) !== sem(g(ct, 'contacts', 'cargo'));
    f.tel_div = f.tel_base && telL.slice(-8) !== digits(g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular')).slice(-8);
    f.emp_div = f.emp_base && !empIds.some(e => (contactCompanies.get(ct.id) || []).includes(e));
    f.con = f.email_div || f.cargo_div || f.tel_div || f.emp_div;
    f.com = f.sem_origem || f.sem_fonte;
    f.saudavel = !(f.con || f.com || f.sem_contato || f.sem_empresa || f.dup);
    return { id: l.id, f, nome: g(l, 'leads', 'nome') || '', pipeline: sdr ? 'SDRs' : 'Executivos', etapa: g(l, 'leads', 'etapa') || '',
      email_lead: g(l, 'leads', 'email') || '', email_contato: ct ? g(ct, 'contacts', 'email') || '' : '', cargo_lead: cargoL || '', cargo_contato: ct ? g(ct, 'contacts', 'cargo') || '' : '',
      tel_lead: g(l, 'leads', 'telefone') || '', tel_contato: ct ? (g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular') || '') : '' };
  });

  // ---------- IDPs ----------
  const cnt = (arr, pred) => arr.reduce((s, x) => s + (pred(x) ? 1 : 0), 0);
  const sc = (arr, base, err) => ({ tb: cnt(arr, base), te: cnt(arr, x => base(x) && err(x)), ub: cnt(arr, x => x.uso && base(x)), ue: cnt(arr, x => x.uso && base(x) && err(x)) });
  const scL = (base, err) => sc(LD.map(x => ({ ...x, uso: x.f.aberto })), base, err);
  const all = () => true;
  const lists = {}, IDP = [];
  const add = (idp, dim, regra, objeto, status, s, como, lista) => {
    IDP.push({ idp, dimensao: dim, regra, objeto, status, como, nota: status === 'Oficial' || status === 'Em validação', lista: !!lista,
      total_base: s ? s.tb : null, total: s ? s.te : null, total_ok: s ? s.tb - s.te : null, total_pct: s && s.tb ? s.te / s.tb : null,
      uso_base: s ? s.ub : null, uso: s ? s.ue : null, uso_ok: s ? s.ub - s.ue : null, uso_pct: s && s.ub ? s.ue / s.ub : null });
    if (lista) lists[idp] = lista;
  };
  // Listas compactas: uma tabela por objeto (gravada uma vez) + índices de cada IDP
  const TAB = {
    E: E.map(x => ({ ...x.row, _uso: x.uso })),
    C: C.map(x => ({ ...x.row, _uso: x.uso })),
    L: LD.map(x => ({ record_id: x.id, nome: x.nome, pipeline: x.pipeline, email_lead: x.email_lead, email_contato: x.email_contato, cargo_lead: x.cargo_lead, cargo_contato: x.cargo_contato,
      tel_lead: x.tel_lead, tel_contato: x.tel_contato, link_hubspot: link('0-136', x.id), _uso: x.f.aberto }))
  };
  const idx = (t, arr, base, err) => { const b = [], e = []; arr.forEach((x, i) => { if (base(x)) { b.push(i); if (err(x)) e.push(i); } }); return { t, b, e }; };
  const listE = (base, err) => idx('E', E, base, err);
  const listC = (base, err) => idx('C', C, base, err);
  const listL = (base, err) => idx('L', LD, base, err);
  const pE = (k) => [x => x.f[k + '_base'], x => x.f[k + '_err']];
  const pC = (k, e = '_err') => [x => x.f[k + '_base'], x => x.f[k + e]];

  // Acurácia
  add('ACU-01', 'acuracia', 'Porte incoerente com o nº de funcionários', 'Empresa', 'Oficial', sc(E, ...pE('porte')), 'Faixa do porte (Micro 1–9, Pequena 10–49, Média 50–99, Grande 100–999, Enterprise 1000+) × numberofemployees.', listE(...pE('porte')));
  add('ACU-02', 'acuracia', 'CNPJ inválido', 'Empresa', 'Oficial', sc(E, ...pE('cnpj')), 'CNPJ de empresa do Brasil sem 14 dígitos, repetido ou com dígito verificador errado.', listE(...pE('cnpj')));
  add('ACU-03', 'acuracia', 'País diferente do country (Breeze)', 'Empresa', 'Em validação', sc(E, ...pE('pais')), 'pais × country, com nomes em português e inglês tratados como o mesmo país. Avalia empresas com os dois campos.', listE(...pE('pais')));
  add('ACU-04', 'acuracia', 'Domínio diferente do site', 'Empresa', 'Em validação', sc(E, ...pE('site')), 'Domínio raiz de domain × domínio raiz de website. Avalia empresas com os dois campos.', listE(...pE('site')));
  add('ACU-05', 'acuracia', 'LinkedIn da empresa não é página de empresa', 'Empresa', 'Oficial', sc(E, ...pE('li')), 'linkedin_company_page preenchido que não é um endereço linkedin.com/company (ou school/showcase).', listE(...pE('li')));
  add('ACU-06', 'acuracia', 'Cargo diferente da senioridade (Breeze)', 'Contato', 'Em validação', sc(C, ...pC('cargo')), 'cargo × hs_seniority pelo de-para do enriquecimento (c_suite/vp → CEO, director → Diretor, manager → Gerente, senior → Especialista, junior → Analista, intern → Estagiário).', listC(...pC('cargo')));
  add('ACU-07', 'acuracia', 'Área do POC diferente da função (Breeze)', 'Contato', 'Em validação', sc(C, ...pC('area')), 'area_do_poc × hs_role pelo de-para do enriquecimento (marketing → Marketing / Growth, sales → Vendas, engineering → Tecnologia…).', listC(...pC('area')));
  add('ACU-08', 'acuracia', 'LinkedIn diferente do LinkedIn do Breeze', 'Contato', 'Em validação', sc(C, ...pC('li')), 'Perfil (linkedin.com/in/…) de linkedin × hs_linkedin_url. Avalia contatos com os dois campos.', listC(...pC('li')));
  add('ACU-09', 'acuracia', 'Segmento diferente da indústria (Breeze)', 'Empresa', 'Pendente', null, 'A propriedade industry está oculta no HubSpot. Volta quando for liberada e o de-para industry → segmento for validado.', null);
  // Consistência
  add('CON-01', 'consistencia', 'E-mail corporativo de domínio diferente da empresa', 'Contato', 'Em validação', sc(C, x => x.f.dominio_base, x => x.f.dominio_div), 'Domínio do e-mail do contato × domínio das empresas associadas.', listC(x => x.f.dominio_base, x => x.f.dominio_div));
  add('CON-02', 'consistencia', 'Campo "Empresa" diferente da empresa associada', 'Contato', 'Em validação', sc(C, x => x.f.empresa_base, x => x.f.empresa_div), 'Texto de company × nome das empresas associadas (sem acento, espaço e pontuação; um contido no outro passa).', listC(x => x.f.empresa_base, x => x.f.empresa_div));
  add('CON-03', 'consistencia', 'E-mail do lead diferente do contato', 'Lead', 'Oficial', scL(x => x.f.email_base, x => x.f.email_div), 'email do lead × email do contato associado.', listL(x => x.f.email_base, x => x.f.email_div, ['email_lead', 'email_contato']));
  add('CON-04', 'consistencia', 'Cargo do lead diferente do contato', 'Lead', 'Em validação', scL(x => x.f.cargo_base, x => x.f.cargo_div), 'cargo do lead × cargo do contato associado.', listL(x => x.f.cargo_base, x => x.f.cargo_div, ['cargo_lead', 'cargo_contato']));
  add('CON-05', 'consistencia', 'Telefone do lead diferente do contato', 'Lead', 'Em validação', scL(x => x.f.tel_base, x => x.f.tel_div), 'Últimos 8 dígitos do telefone do lead × telefone ou celular do contato.', listL(x => x.f.tel_base, x => x.f.tel_div, ['tel_lead', 'tel_contato']));
  add('CON-06', 'consistencia', 'Empresa do lead diferente da empresa do contato', 'Lead', 'Oficial', scL(x => x.f.emp_base, x => x.f.emp_div), 'Empresa associada ao lead × empresas associadas ao contato do lead.', listL(x => x.f.emp_base, x => x.f.emp_div));
  // Completude
  add('COM-01', 'completude', 'Empresa com algum campo vazio', 'Empresa', 'Oficial', sc(E, all, x => x.f.com), 'Conta como erro se faltar: nº de funcionários, abrangência, país, segmento, porte ou domínio.', listE(all, x => x.f.com));
  for (const [id, k, t] of [['COM-01.1', 'sem_func', 'Sem nº de funcionários'], ['COM-01.2', 'sem_abrang', 'Sem abrangência'], ['COM-01.3', 'sem_pais', 'Sem país'], ['COM-01.4', 'sem_segmento', 'Sem segmento'], ['COM-01.5', 'sem_porte', 'Sem porte'], ['COM-01.6', 'sem_dominio', 'Sem domínio']])
    add(id, 'completude', '↳ ' + t, 'Empresa', 'Detalhe', sc(E, all, x => x.f[k]), 'Detalhe do COM-01, fora da nota.', listE(all, x => x.f[k]));
  add('COM-02', 'completude', 'Contato com algum campo vazio', 'Contato', 'Oficial', sc(C, all, x => x.f.com), 'Conta como erro se faltar: cargo, área do POC ou LinkedIn.', listC(all, x => x.f.com));
  for (const [id, k, t] of [['COM-02.1', 'sem_cargo', 'Sem cargo'], ['COM-02.2', 'sem_area', 'Sem área do POC'], ['COM-02.3', 'sem_linkedin', 'Sem LinkedIn']])
    add(id, 'completude', '↳ ' + t, 'Contato', 'Detalhe', sc(C, all, x => x.f[k]), 'Detalhe do COM-02, fora da nota.', listC(all, x => x.f[k]));
  add('COM-03', 'completude', 'Lead com algum campo vazio', 'Lead', 'Em validação', scL(all, x => x.f.com), 'Conta como erro se faltar origem (SDRs e Executivos) ou fonte de entrada (só SDRs).', listL(all, x => x.f.com));
  add('COM-03.1', 'completude', '↳ Sem origem', 'Lead', 'Detalhe', scL(all, x => x.f.sem_origem), 'Detalhe do COM-03, fora da nota.', listL(all, x => x.f.sem_origem));
  add('COM-03.2', 'completude', '↳ Sem fonte de entrada (SDRs)', 'Lead', 'Detalhe', scL(x => x.pipeline === 'SDRs', x => x.f.sem_fonte), 'Detalhe do COM-03, fora da nota.', listL(x => x.pipeline === 'SDRs', x => x.f.sem_fonte));
  // Duplicidade
  add('UNI-01', 'unicidade', 'Empresas com o mesmo domínio', 'Empresa', 'Oficial', sc(E, all, x => x.f.dup_dom), 'Domínio idêntico (sem www e protocolo). Conta todos os registros do grupo.', listE(all, x => x.f.dup_dom));
  add('UNI-02', 'unicidade', 'Empresas com o mesmo domínio raiz', 'Empresa', 'Em validação', sc(E, all, x => x.f.dup_root), 'Mesmo domínio raiz com terminação ou subdomínio diferente (vivara.com × carreiras.vivara.com.br). Não repete os casos do UNI-01.', listE(all, x => x.f.dup_root));
  add('UNI-03', 'unicidade', 'Empresas com o mesmo nome', 'Empresa', 'Em validação', sc(E, all, x => x.f.dup_nome), 'Mesmo nome sem acento, espaço e pontuação, com domínios diferentes. Não repete UNI-01 e UNI-02.', listE(all, x => x.f.dup_nome));
  add('UNI-04', 'unicidade', 'Contatos com o mesmo LinkedIn', 'Contato', 'Oficial', sc(C, all, x => x.f.dup_li), 'Mesmo perfil linkedin.com/in/… em mais de um contato.', listC(all, x => x.f.dup_li));
  add('UNI-05', 'unicidade', 'Contatos com mesmo nome, sobrenome e empresa', 'Contato', 'Monitoramento', sc(C, all, x => x.f.dup_nome), 'Fica fora da nota até existir estratégia segura de mesclagem.', listC(all, x => x.f.dup_nome));
  add('UNI-06', 'unicidade', 'Contato com mais de um lead aberto no mesmo pipeline', 'Lead', 'Em validação', scL(x => x.f.aberto, x => x.f.dup), 'Leads abertos do mesmo contato no mesmo pipeline (SDRs ou Executivos).', listL(x => x.f.aberto, x => x.f.dup));
  // Integridade
  add('INT-01', 'integridade', 'Empresa sem contato', 'Empresa', 'Oficial', sc(E, all, x => x.f.sem_contato), 'Empresa sem nenhum contato associado.', listE(all, x => x.f.sem_contato));
  add('INT-02', 'integridade', 'Contato sem empresa', 'Contato', 'Oficial', sc(C, all, x => x.f.sem_empresa), 'Contato sem nenhuma empresa associada.', listC(all, x => x.f.sem_empresa));
  add('INT-03', 'integridade', 'Lead sem contato', 'Lead', 'Oficial', scL(all, x => x.f.sem_contato), 'Lead sem contato associado.', listL(all, x => x.f.sem_contato));
  add('INT-04', 'integridade', 'Lead sem empresa', 'Lead', 'Oficial', scL(all, x => x.f.sem_empresa), 'Lead sem empresa associada.', listL(all, x => x.f.sem_empresa));

  // ---------- dimensões e DHS ----------
  const nomes = { acuracia: 'Acurácia', consistencia: 'Consistência entre objetos', completude: 'Completude', unicidade: 'Duplicidade', integridade: 'Integridade' };
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
  const saudaveis = {
    empresas_pct: pct(cnt(E, x => x.f.saudavel), E.length), empresas_uso_pct: pct(cnt(E, x => x.uso && x.f.saudavel), cnt(E, x => x.uso)), empresas_n: E.length, empresas_uso_n: cnt(E, x => x.uso),
    contatos_pct: pct(cnt(C, x => x.f.saudavel), C.length), contatos_uso_pct: pct(cnt(C, x => x.uso && x.f.saudavel), cnt(C, x => x.uso)), contatos_n: C.length, contatos_uso_n: cnt(C, x => x.uso),
    leads_pct: pct(cnt(LD, x => x.f.saudavel), LD.length), leads_abertos_pct: pct(cnt(LD, x => x.f.aberto && x.f.saudavel), cnt(LD, x => x.f.aberto)), leads_n: LD.length, leads_abertos_n: cnt(LD, x => x.f.aberto)
  };
  // ---------- origens ofensoras (empresas e contatos) ----------
  const origemNome = { CRM_UI: 'UI de CRM', IMPORT: 'Importação', INTEGRATION: 'Integração', FORM: 'Formulários', CRM_SETTING: 'Configuração do CRM', EXTENSION: 'Extensão', EMAIL_INTEGRATION: 'Integração de e-mail', BCC_TO_CRM: 'BCC para o CRM', INTERNAL_PROCESSING: 'Processamento interno', AUTOMATION_PLATFORM: 'Automação da plataforma', API: 'API', MOBILE_IOS: 'App iOS', MOBILE_ANDROID: 'App Android', '(vazio)': 'Sem origem' };
  const errDim = { acuracia: (x) => x.f.acu, consistencia: (x) => x.f.con, completude: (x) => x.f.com, unicidade: (x, t) => (t === 'E' ? x.f.dup : x.f.dup_li), integridade: (x, t) => (t === 'E' ? x.f.sem_contato : x.f.sem_empresa) };
  const origens = [];
  for (const [dim, fn] of Object.entries(errDim)) {
    const acc = {};
    E.forEach(x => { if (fn(x, 'E')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    C.forEach(x => { if (fn(x, 'C')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    const tot = Object.values(acc).reduce((a, b) => a + b, 0);
    Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([o, n], i) => origens.push({ dimensao: dim, rank: i + 1, origem: origemNome[o] || o, erros: n, share: tot ? n / tot : 0 }));
  }
  const volumes = { empresas: E.length, contatos: C.length, leads: LD.length };
  return { summary: { idps: IDP, dimensoes, dhs, saudaveis, origens, volumes }, lists, tabelas: TAB };
}
