// Regras do Data Health Score — escopo: Empresas, Contatos e Leads (SDRs e Executivos).
import { PESOS, LEAD_PIPELINES, LEAD_FECHADO, LEAD_AGENDADO, PORTAL, TETO_OBJETO } from './config.mjs';
import { assoc } from './hubspot.mjs';

const PUB = /^(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\./;
// Domínios que não identificam a empresa: redes sociais, encurtadores e links de perfil usados no lugar do site
const NAO_ID = /^(instagram|facebook|fb|linkedin|lnkd|youtube|youtu|twitter|x|tiktok|linktr|wa|whatsapp|api\.whatsapp|bit|t|sites\.google|google|forms\.gle|linktree)\./;
const domEmpresaOk = (d) => !!d && d.includes('.') && !PUB.test(d) && !NAO_ID.test(d);
const vazio = (v) => v == null || String(v).trim() === '';
const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const normDom = (d) => (d || '').trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/[/?#].*$/, '');
// Domínio raiz: a parte que identifica a empresa, sem subdomínio nem sufixo (vivara.com.br, loja.vivara.com e vivara.com → vivara;
// ype.ind.br → ype). Sufixos de 2º nível de país (com.br, ind.br, net.br, co.uk…) são tratados como parte do sufixo.
const SLD = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'ind', 'art', 'adv', 'agr', 'eco', 'emp', 'eng', 'esp', 'etc', 'far', 'imb', 'inf', 'jor', 'med', 'mus', 'nom', 'not', 'odo', 'pro', 'psi', 'rec', 'srv', 'tmp', 'tur', 'vet', 'ac', 'tv', 'coop', 'blog', 'app', 'dev', 'log', 'seg', 'ong', 'leg', 'jus', 'mil', 'bet', 'tec', 'wiki', 'ws', 'b', 'gob', 'fin', 'gub', 'nic', 'int']);
// Plataformas que hospedam várias empresas em subdomínios (caedu.gupy.io, loja.myshopify.com): a raiz é o subdomínio.
const PLATAFORMAS = ['gupy.io', 'myshopify.com', 'wixsite.com', 'github.io', 'blogspot.com', 'wordpress.com', 'herokuapp.com', 'netlify.app', 'vercel.app', 'webflow.io', 'sharepoint.com', 'notion.site', 'vtexcommercestable.com.br', 'hubspotpagebuilder.com', 'onmicrosoft.com'];
const rootKey = (dom) => { const d = String(dom || ''); const plat = PLATAFORMAS.find(x => d.endsWith('.' + x)); if (plat) return d.slice(0, -plat.length - 1).split('.')[0] + '@' + plat; const p = d.split('.').filter(Boolean); if (p.length < 2) return dom; const tld = p[p.length - 1], sld = p[p.length - 2]; if (p.length >= 3 && tld.length === 2 && (SLD.has(sld) || sld.length <= 2)) { const r = p[p.length - 3]; return (sld === 'gov' && r.length === 2 && p.length >= 4) ? p[p.length - 4] : r; } return sld; };
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
// País deduzido pelo sufixo do domínio (só quando o campo país está vazio). Sufixos usados como genéricos (.io, .ai, .co…) não contam.
const CC_GENERICO = new Set(['io', 'ai', 'me', 'tv', 'co', 'ly', 'gg', 'so', 'to', 'cc', 'ws', 'fm', 'la', 'is', 'it', 'us', 'eu', 'vc', 'ag', 'im', 'sh', 'app']);
const paisDoDominio = (d) => { const p = String(d || '').split('.').filter(Boolean); if (p.length < 2) return ''; const t = p[p.length - 1]; if (t.length !== 2) return ''; if (CC_GENERICO.has(t) && !(p.length >= 3 && SLD.has(p[p.length - 2]))) return ''; return t === 'uk' ? 'gb' : t; };
// Domínio raiz sem o marcador de plataforma, só letras e números
const raizLimpa = (d) => String(rootKey(d) || '').split('@')[0].replace(/[^a-z0-9]/g, '');
// O nome da empresa corresponde ao domínio? (contém a raiz, a raiz contém o nome, uma palavra relevante ou as iniciais)
const STOP_NOME = new Set(['grupo', 'group', 'brasil', 'brazil', 'the', 'inc', 'ltda', 'eireli', 'holding', 'cia', 'companhia', 'company', 'corp', 'corporation', 'industria', 'industrias', 'comercio', 'servicos', 'and', 'international', 'internacional', 'global', 'latam', 'america', 'south', 'mexico', 'argentina', 'chile', 'colombia', 'peru', 'digital', 'tecnologia', 'tech', 'solucoes', 'participacoes', 'oficial', 'sas', 'spa', 'ltd', 'llc', 'gmbh']);
// Raiz curta (até 3 letras, ex.: bp, cea) é ambígua: só entra no domínio raiz se o nome da empresa corresponder a ela
const raizElegivel = (nome, dom) => { const r = raizLimpa(dom); return r.length > 3 || nomeBateDominio(nome, r); };
const nomeBateDominio = (nome, raiz) => {
  if (!raiz) return true; const nk = normName(nome); if (!nk) return true;
  if (nk.includes(raiz) || raiz.includes(nk)) return true;
  const pal = sem(nome).split(/[^a-z0-9]+/).filter(Boolean);
  if (pal.filter(t => t.length >= 3 && !STOP_NOME.has(t)).some(t => raiz.includes(t) || t.includes(raiz))) return true;
  const ini = pal.filter(t => !['de', 'da', 'do', 'dos', 'das', 'e', 'y', 'la', 'el', 'of'].includes(t)).map(t => t[0]).join('');
  return ini.length >= 2 && (ini === raiz || raiz.startsWith(ini));
};
// De-para do skill de enriquecimento
const SENIORITY_CARGO = { c_suite: 'ceo', vp: 'ceo', director: 'diretor', manager: 'gerente', senior: 'especialista', entry_level: 'analista', junior: 'analista', intern: 'estagiario', trainee: 'estagiario' };
const ROLE_AREA = { marketing: 'marketing', sales: 'vendas', product: 'produto', design: 'produto', engineering: 'tecnologia', it: 'tecnologia', technology: 'tecnologia', customer_success: 'customer success',
  support: 'customer success', service: 'customer success', legal: 'juridico', compliance: 'juridico', finance: 'financeiro', accounting: 'financeiro', crm: 'crm', operations_crm: 'crm',
  business_intelligence: 'bi', analytics: 'bi', data: 'bi', ecommerce: 'e-commerce', hr: 'recursos humanos', people: 'recursos humanos', recruiting: 'recursos humanos', operations: 'operacoes' };
// De-para indústria (Breeze / industry do HubSpot) → segmentos aceitos
const IND_SEG = (() => {
  const m = {};
  const put = (inds, segs) => inds.split(' ').forEach(i => { m[i] = segs; });
  put('BANKING FINANCIAL_SERVICES CAPITAL_MARKETS INVESTMENT_BANKING INVESTMENT_MANAGEMENT VENTURE_CAPITAL_PRIVATE_EQUITY ACCOUNTING', ['financas', 'beneficios e pagamentos', 'seguros']);
  put('INSURANCE', ['seguros', 'financas']);
  put('COMPUTER_SOFTWARE INFORMATION_TECHNOLOGY_AND_SERVICES COMPUTER_HARDWARE COMPUTER_NETWORKING COMPUTER_NETWORK_SECURITY SEMICONDUCTORS INFORMATION_SERVICES PROGRAM_DEVELOPMENT NANOTECHNOLOGY', ['tecnologia']);
  put('INTERNET', ['tecnologia', 'e-commerce', 'midia', 'delivery', 'marketing', 'comunicacao']);
  put('COMPUTER_GAMES MOBILE_GAMES', ['tecnologia', 'midia', 'turismo e lazer', 'mercado de apostas']);
  put('TELECOMMUNICATIONS WIRELESS', ['telefonia', 'tecnologia']);
  put('RETAIL SUPERMARKETS CONSUMER_GOODS APPAREL_FASHION LUXURY_GOODS_JEWELRY SPORTING_GOODS COSMETICS CONSUMER_ELECTRONICS FURNITURE WHOLESALE', ['varejo', 'e-commerce', 'industria']);
  put('FOOD_BEVERAGES FOOD_PRODUCTION RESTAURANTS DAIRY WINE_AND_SPIRITS', ['alimentos', 'delivery', 'varejo', 'industria']);
  put('EDUCATION_MANAGEMENT E_LEARNING HIGHER_EDUCATION PRIMARY_SECONDARY_EDUCATION PROFESSIONAL_TRAINING_COACHING', ['educacao']);
  put('HOSPITAL_HEALTH_CARE HEALTH_WELLNESS_AND_FITNESS MEDICAL_PRACTICE MEDICAL_DEVICES PHARMACEUTICALS MENTAL_HEALTH_CARE BIOTECHNOLOGY ALTERNATIVE_MEDICINE VETERINARY', ['saude e fitness', 'industria']);
  put('BROADCAST_MEDIA MEDIA_PRODUCTION ONLINE_MEDIA NEWSPAPERS PUBLISHING MOTION_PICTURES_AND_FILM MUSIC ENTERTAINMENT ANIMATION', ['midia', 'comunicacao', 'eventos', 'turismo e lazer']);
  put('MARKETING_AND_ADVERTISING PUBLIC_RELATIONS_AND_COMMUNICATIONS MARKET_RESEARCH', ['marketing', 'comunicacao', 'midia', 'prestacao de servicos']);
  put('EVENTS_SERVICES', ['eventos', 'turismo e lazer']);
  put('LEISURE_TRAVEL_TOURISM HOSPITALITY AIRLINES_AVIATION RECREATIONAL_FACILITIES_AND_SERVICES SPORTS', ['turismo e lazer', 'eventos', 'saude e fitness']);
  put('GAMBLING_CASINOS', ['mercado de apostas', 'turismo e lazer']);
  put('AUTOMOTIVE', ['veiculos', 'industria', 'varejo']);
  put('LOGISTICS_AND_SUPPLY_CHAIN PACKAGE_FREIGHT_DELIVERY TRANSPORTATION_TRUCKING_RAILROAD WAREHOUSING MARITIME', ['logistica', 'delivery']);
  put('REAL_ESTATE COMMERCIAL_REAL_ESTATE', ['imobiliario', 'construcao civil']);
  put('CONSTRUCTION CIVIL_ENGINEERING BUILDING_MATERIALS ARCHITECTURE_PLANNING', ['construcao civil', 'imobiliario', 'industria']);
  put('OIL_ENERGY RENEWABLES_ENVIRONMENT', ['energia', 'utilidades', 'industria']);
  put('UTILITIES', ['utilidades', 'energia', 'servicos publicos']);
  put('FARMING RANCHING FISHERY', ['agro', 'alimentos', 'industria']);
  put('CHEMICALS MACHINERY INDUSTRIAL_AUTOMATION ELECTRICAL_ELECTRONIC_MANUFACTURING MECHANICAL_OR_INDUSTRIAL_ENGINEERING MINING_METALS PLASTICS PACKAGING_AND_CONTAINERS PAPER_FOREST_PRODUCTS TEXTILES GLASS_CERAMICS_CONCRETE AVIATION_AEROSPACE DEFENSE_SPACE SHIPBUILDING RAILROAD_MANUFACTURE TOBACCO PRINTING', ['industria']);
  put('GOVERNMENT_ADMINISTRATION LEGISLATIVE_OFFICE JUDICIARY LAW_ENFORCEMENT PUBLIC_SAFETY MILITARY PUBLIC_POLICY GOVERNMENT_RELATIONS', ['servicos publicos']);
  put('HUMAN_RESOURCES STAFFING_AND_RECRUITING MANAGEMENT_CONSULTING', ['servicos de rh e consultoria', 'prestacao de servicos']);
  put('LEGAL_SERVICES LAW_PRACTICE OUTSOURCING_OFFSHORING FACILITIES_SERVICES CONSUMER_SERVICES BUSINESS_SUPPLIES_AND_EQUIPMENT SECURITY_AND_INVESTIGATIONS TRANSLATION_AND_LOCALIZATION DESIGN GRAPHIC_DESIGN ENVIRONMENTAL_SERVICES IMPORT_AND_EXPORT', ['prestacao de servicos', 'servicos de rh e consultoria', 'marketing']);
  return m;
})();
// Intenção de compra (valor interno) → Operação esperada no negócio (valor interno): 'RMApp - …' (MI, RI, DataRank…) e 'MI + DataRank' = RankMyApp; 'RMAds' = MP (RankMyAds).
// Valores sem correspondência definida (RankMyGeo, DI, MP + DataRank) não são avaliados.
const intencaoParaOperacao = (k) => (k === 'rmads' ? 'mp' : (k.startsWith('rmapp') || k === 'midatarank') ? 'rankmyapp' : null);
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
    if (domEmpresaOk(dom)) { inc(byDom, dom); if (raizElegivel(g(c, 'companies', 'nome'), dom)) inc(byRoot, rootKey(dom)); }
    const nm = normName(g(c, 'companies', 'nome')); if (nm.length >= 3) inc(byName, nm);
  }
  const rootDoms = new Map(), nameDoms = new Map();
  for (const c of emps) {
    const dom = normDom(g(c, 'companies', 'dominio')), nm = normName(g(c, 'companies', 'nome'));
    const okd = domEmpresaOk(dom);
    if (okd && raizElegivel(g(c, 'companies', 'nome'), dom)) { const r = rootKey(dom); if (!rootDoms.has(r)) rootDoms.set(r, new Set()); rootDoms.get(r).add(dom); }
    if (nm.length >= 3) { if (!nameDoms.has(nm)) nameDoms.set(nm, new Set()); nameDoms.get(nm).add(okd ? dom : ''); }
  }
  // Mesmo nome com certeza de ser a mesma empresa: mesmo país (país vazio acompanha o grupo) e sem domínio próprio diferente.
  // Registros de outro país ou com outro domínio raiz ficam de fora (podem ser filial ou outra empresa).
  const nomeCerto = new Map(); // id → [grupo, tamanho]
  {
    const porNome = new Map();
    for (const c of emps) { const nm = normName(g(c, 'companies', 'nome')); if (nm.length < 3) continue; if (!porNome.has(nm)) porNome.set(nm, []); porNome.get(nm).push(c); }
    for (const [nm, ms] of porNome) {
      if (ms.length < 2) continue;
      const pk = (c) => (vazio(g(c, 'companies', 'pais')) ? paisDoDominio(normDom(g(c, 'companies', 'dominio'))) : paisKey(g(c, 'companies', 'pais')));
      const pc = new Map(); ms.forEach(c => { const k = pk(c); if (k) pc.set(k, (pc.get(k) || 0) + 1); });
      const paisDom = [...pc.entries()].sort((a, b) => b[1] - a[1])[0];
      const mesmoPais = ms.filter(c => !paisDom || !pk(c) || pk(c) === paisDom[0]);
      const rk = (c) => { const d = normDom(g(c, 'companies', 'dominio')); return domEmpresaOk(d) ? rootKey(d) : ''; };
      const rc = new Map(); mesmoPais.forEach(c => { const r = rk(c); if (r) rc.set(r, (rc.get(r) || 0) + 1); });
      const raizDom = [...rc.entries()].sort((a, b) => b[1] - a[1])[0];
      const certos = mesmoPais.filter(c => !rk(c) || !raizDom || rk(c) === raizDom[0]);
      if (certos.length < 2) continue;
      const rot = `${g(certos[0], 'companies', 'nome') || nm}${paisDom ? ' · ' + paisDom[0].toUpperCase() : ''}${raizDom ? ' · ' + raizDom[0] : ''}`;
      certos.forEach(c => nomeCerto.set(c.id, [rot, certos.length]));
    }
  }
  const E = emps.map(c => {
    const dom = normDom(g(c, 'companies', 'dominio')), nm = normName(g(c, 'companies', 'nome'));
    const porte = g(c, 'companies', 'porte'), func = num(g(c, 'companies', 'funcionarios'));
    const pais = g(c, 'companies', 'pais'), country = g(c, 'companies', 'country');
    const cn = digits(g(c, 'companies', 'cnpj'));
    const site = normDom(g(c, 'companies', 'website'));
    const li = g(c, 'companies', 'linkedin');
    const seg = sem(g(c, 'companies', 'segmento')), ind = String(g(c, 'companies', 'industry') || '').toUpperCase();
    const life = (g(c, 'companies', 'lifecycle') || '').toLowerCase();
    const okDom = domEmpresaOk(dom);
    const f = {
      porte_base: !vazio(porte) && func != null, cnpj_base: cn !== '' && ['', 'br'].includes(vazio(pais) ? '' : paisKey(pais)),
      pais_base: !vazio(pais) && !vazio(country), site_base: !!dom && !!site, seg_base: !!seg && seg !== 'outros' && !!IND_SEG[ind],
      sem_func: func == null, sem_abrang: vazio(g(c, 'companies', 'abrangencia')), sem_pais: vazio(pais), sem_segmento: vazio(g(c, 'companies', 'segmento')),
      sem_porte: vazio(porte), sem_dominio: vazio(dom),
      dup_dom: okDom && byDom.get(dom) > 1,
      sem_contato: (num(g(c, 'companies', 'n_contatos')) || 0) === 0
    };
    f.dup_root = okDom && raizElegivel(g(c, 'companies', 'nome'), dom) && byRoot.get(rootKey(dom)) > 1 && rootDoms.get(rootKey(dom)).size > 1;
    f.dup_nome = nomeCerto.has(c.id);
    f.porte_err = f.porte_base && !porteCoerente(porte, func);
    f.cnpj_err = f.cnpj_base && !cnpjValido(cn);
    f.pais_err = f.pais_base && paisKey(pais) !== paisKey(country);
    f.site_err = f.site_base && rootKey(dom) !== rootKey(site);
    f.seg_err = f.seg_base && !IND_SEG[ind].includes(seg);
    f.acu_base = f.porte_base || f.cnpj_base || f.pais_base || f.site_base || f.seg_base;
    f.acu = f.porte_err || f.cnpj_err || f.pais_err || f.site_err || f.seg_err;
    f.sem_nome = vazio(g(c, 'companies', 'nome'));
    f.sem_cnpj_cli = life === 'customer' && cn === '';
    f.com = f.sem_nome || f.sem_abrang || f.sem_pais || f.sem_segmento || f.sem_porte || f.sem_dominio || f.sem_cnpj_cli;
    f.dup = f.dup_dom || f.dup_root || f.dup_nome;
    f.saudavel = !(f.acu || f.com || f.dup || f.sem_contato);
    const uso = (num(g(c, 'companies', 'n_negocios')) || 0) > 0 || life === 'customer' || empLeadAberto.has(c.id);
    const grupo = f.dup_dom ? dom : f.dup_root ? rootKey(dom) : f.dup_nome ? nm : '';
    const grupos = { dom: okDom ? dom : '', dom_n: okDom ? byDom.get(dom) : 0, raiz: okDom ? rootKey(dom) : '', raiz_n: okDom ? byRoot.get(rootKey(dom)) : 0, nome: nomeCerto.has(c.id) ? nomeCerto.get(c.id)[0] : nm, nome_n: nomeCerto.has(c.id) ? nomeCerto.get(c.id)[1] : 0 };
    const row = { record_id: c.id, nome: g(c, 'companies', 'nome') || '', dominio: g(c, 'companies', 'dominio') || '', website: g(c, 'companies', 'website') || '', grupo_duplicidade: grupo,
      porte: porte || '', funcionarios: func == null ? '' : String(func), segmento: g(c, 'companies', 'segmento') || '', pais: pais || '', country: country || '',
      abrangencia: g(c, 'companies', 'abrangencia') || '', cnpj: g(c, 'companies', 'cnpj') || '', linkedin: li || '', origem: g(c, 'companies', 'origem') || '(vazio)',
      em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-2', c.id) };
    row.industria_breeze = ind;
    return { id: c.id, uso, origem: row.origem, f, row, grupos };
  });

  // ---------- contatos ----------
  const cts = contacts.filter(c => !/@rankmyapp/i.test(g(c, 'contacts', 'email') || ''));
  const ctById = new Map(cts.map(c => [c.id, c]));
  const contactCompanies = new Map(cts.map(c => [c.id, assoc(c, 'compan').filter(i => comp.has(i))]));
  const dupNome = new Map(), dupLi = new Map();
  const ctKey = (c) => { const n = sem(g(c, 'contacts', 'nome')), s = sem(g(c, 'contacts', 'sobrenome')), e = sem(g(c, 'contacts', 'empresa')); return n && e ? `${n} ${s} · ${e}` : null; };
  for (const c of cts) { const k = ctKey(c); if (k) inc(dupNome, k); const li = liSlug(g(c, 'contacts', 'linkedin'), 'in'); if (li) inc(dupLi, li); }
  // Empresa de referência por domínio raiz (a que tem mais contatos), para sugerir a associação correta
  const empPorRaiz = new Map();
  for (const c of emps) {
    const d = normDom(g(c, 'companies', 'dominio')); if (!domEmpresaOk(d)) continue;
    const r = raizLimpa(d), n = num(g(c, 'companies', 'n_contatos')) || 0, atual = empPorRaiz.get(r);
    if (!atual || n > atual.n) empPorRaiz.set(r, { id: c.id, nome: g(c, 'companies', 'nome') || '', n, seg: sem(g(c, 'companies', 'segmento')) });
  }
  const AGENCIA = /agencia|publicidade|propaganda|marketing|comunicacao|midia/;
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
    const dominioIgual = doms.some(dm => dEmail === dm || dEmail.endsWith('.' + dm) || dm.endsWith('.' + dEmail) || rootKey(dEmail) === rootKey(dm));
    // Mesma empresa com outro domínio de e-mail (Itaú × itau-unibanco.com.br): não é erro de associação
    const nomesEmpRaw = empIds.map(i => g(comp.get(i), 'companies', 'nome') || '');
    f.dominio_alt = f.dominio_base && !dominioIgual && nomesEmpRaw.some(n => nomeBateDominio(n, raizLimpa(dEmail)));
    f.dominio_div = f.dominio_base && !dominioIgual && !f.dominio_alt;
    f.empresa_div = f.empresa_base && !nomesEmp.some(n => n.includes(empTxt) || empTxt.includes(n));
    f.li_err = f.li_base && liSlug(li, 'in') !== liSlug(liAlt, 'in');
    // e-mail público e e-mail inválido (hard bounce)
    f.pub_base = !!email; f.pub_err = f.pub_base && pub;
    f.bounce_base = !!email; f.bounce_err = f.bounce_base && !vazio(g(c, 'contacts', 'bounce'));
    f.acu_base = f.li_base || f.pub_base || f.bounce_base;
    f.acu = f.li_err || f.pub_err || f.bounce_err;
    f.con = f.dominio_div || f.empresa_div;
    f.sem_nome = vazio(g(c, 'contacts', 'nome')); f.sem_email = !email;
    f.email_tipo = !email ? 'sem' : pub ? 'publico' : 'corporativo';
    f.com = f.sem_nome || f.sem_email || f.sem_cargo || f.sem_area || f.sem_linkedin;
    f.saudavel = !(f.acu || f.con || f.com || f.dup_li || f.sem_empresa);
    const uso = (num(g(c, 'contacts', 'n_negocios')) || 0) > 0 || ctLead.has(c.id) || !vazio(g(c, 'contacts', 'mql'));
    const row = { record_id: c.id, nome: g(c, 'contacts', 'nome') || '', sobrenome: g(c, 'contacts', 'sobrenome') || '', email, email_tipo: f.email_tipo, hard_bounce: g(c, 'contacts', 'bounce') || '', empresa: g(c, 'contacts', 'empresa') || '',
      grupo_duplicidade: f.dup_li ? `linkedin.com/in/${slug}` : (f.dup_nome ? k : ''), cargo: cargo || '', hs_seniority: g(c, 'contacts', 'seniority') || '', area_poc: area || '', hs_role: g(c, 'contacts', 'role') || '',
      linkedin: li || '', hs_linkedin_url: liAlt || '', origem: g(c, 'contacts', 'origem') || '(vazio)', em_uso: uso ? 'sim' : 'não', link_hubspot: link('0-1', c.id) };
    const emp0 = empIds.length ? comp.get(empIds[0]) : null;
    const grupo_emp = emp0 ? `${g(emp0, 'companies', 'nome') || 'Empresa'} (ID ${emp0.id})` : '(sem empresa)';
    row.empresa_associada = grupo_emp;
    if (f.dominio_div) {
      const rz = raizLimpa(dEmail), alvo = empPorRaiz.get(rz), segEmp = sem(g(emp0, 'companies', 'segmento')) + ' ' + sem(g(emp0, 'companies', 'nome'));
      if (AGENCIA.test(segEmp)) { row.correcao_sugerida = 'Revisar: agência com contato de cliente'; row.empresa_sugerida = alvo ? `${alvo.nome} (ID ${alvo.id})` : `@${dEmail}`; }
      else if (alvo) { row.correcao_sugerida = 'Associar à empresa do e-mail'; row.empresa_sugerida = `${alvo.nome} (ID ${alvo.id})`; }
      else { row.correcao_sugerida = 'Criar ou enriquecer a empresa do domínio do e-mail'; row.empresa_sugerida = `@${dEmail}`; }
      row.correcao_sugerida += ' · se for grupo, holding ou nome antigo, manter e revisar';
    } else if (f.dominio_alt) { row.correcao_sugerida = 'Domínio alternativo da mesma empresa: incluir @' + dEmail + ' como domínio da empresa'; row.empresa_sugerida = ''; }
    return { id: c.id, uso, origem: row.origem, f, row, grupo_emp, grupos: { li: slug || '', li_n: slug ? dupLi.get(slug) : 0, nome: k || '', nome_n: k ? dupNome.get(k) : 0 } };
  });

  // ---------- leads ----------
  const abertosPorContato = new Map();
  for (const l of leadsF) if (leadAberto(l)) for (const ci of assoc(l, 'contact')) { const k = `${g(l, 'leads', 'pipeline')}|${ci}`; inc(abertosPorContato, k); }
  const dealById = new Map((d.deals || []).map(x => [x.id, x]));
  const LD = leadsF.map(l => {
    const pipe = String(g(l, 'leads', 'pipeline')), sdr = pipe === '739923376';
    const ctIds = assoc(l, 'contact'), empIds = assoc(l, 'compan');
    const ct = ctIds.map(i => ctById.get(i)).find(Boolean);
    const emailL = sem(g(l, 'leads', 'email')), cargoL = g(l, 'leads', 'cargo'), telL = digits(g(l, 'leads', 'telefone'));
    const f = { aberto: leadAberto(l), sem_contato: ctIds.length === 0, sem_empresa: empIds.length === 0,
      sem_origem: vazio(g(l, 'leads', 'origem')),
      email_base: !!ct && !!emailL && !vazio(g(ct, 'contacts', 'email')),
      cargo_base: !!ct && !vazio(cargoL) && !vazio(g(ct, 'contacts', 'cargo')),
      tel_base: !!ct && telL.length >= 8 && digits(g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular')).length >= 8,
      emp_base: !!ct && empIds.length > 0 && (contactCompanies.get(ct.id) || []).length > 0,
      dup: leadAberto(l) && ctIds.some(ci => abertosPorContato.get(`${pipe}|${ci}`) > 1) };
    f.email_div = f.email_base && emailL !== sem(g(ct, 'contacts', 'email'));
    f.cargo_div = f.cargo_base && sem(cargoL) !== sem(g(ct, 'contacts', 'cargo'));
    f.tel_div = f.tel_base && telL.slice(-8) !== digits(g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular')).slice(-8);
    f.emp_div = f.emp_base && !empIds.some(e => (contactCompanies.get(ct.id) || []).includes(e));
    // Elegível: está ou passou por Reunião Agendada (SDRs) / Agendado (Executivos)
    f.eleg = LEAD_AGENDADO.includes(String(g(l, 'leads', 'etapa'))) || !vazio(g(l, 'leads', 'agendamento')) || !vazio(g(l, 'leads', 'entrou_sdr')) || !vazio(g(l, 'leads', 'entrou_exec'));
    const opL = sem(g(l, 'leads', 'operacao')), inL = sem(g(l, 'leads', 'intencao'));
    const dls = assoc(l, 'deal').map(i => dealById.get(i)).filter(Boolean);
    f.tem_negocio = assoc(l, 'deal').length > 0;
    f.sem_operacao = f.eleg && !opL; f.sem_intencao = f.eleg && !inL;
    const opD = dls.map(d => sem(g(d, 'deals', 'operacao'))).filter(Boolean), inD = dls.map(d => sem(g(d, 'deals', 'intencao'))).filter(Boolean);
    // Comparações com o negócio: só leads na etapa Reunião Agendada (SDRs) / Agendado (Executivos)
    f.na_etapa = LEAD_AGENDADO.includes(String(g(l, 'leads', 'etapa')));
    const opDn = opD.map(v => v.replace(/[^a-z0-9]/g, ''));
    f.op_base = f.na_etapa && !!opL && opD.length > 0; f.op_div = f.op_base && !opD.includes(opL);
    // Intenção de compra do lead × Operação do negócio (MI, RI e RMApp = RankMyApp; RMAds = RankMyAds)
    const intEsperada = intencaoParaOperacao(inL.replace(/[^a-z0-9]/g, ''));
    f.int_base = f.na_etapa && !!intEsperada && opDn.length > 0; f.int_div = f.int_base && !opDn.includes(intEsperada);
    f.agend_sem_neg = f.eleg && !f.tem_negocio;
    f.con_base = f.tel_base || f.op_base || f.int_base;
    f.con = f.tel_div || f.op_div || f.int_div;
    f.com = f.sem_origem || f.sem_operacao || f.sem_intencao;
    f.saudavel = !(f.con || f.com || f.sem_contato || f.sem_empresa);
    return { id: l.id, f, nome: g(l, 'leads', 'nome') || '', pipeline: sdr ? 'SDRs' : 'Executivos', etapa: g(l, 'leads', 'etapa') || '', operacao_lead: g(l, 'leads', 'operacao') || '', operacao_negocio: opD.join(' / '), intencao_lead: g(l, 'leads', 'intencao') || '', intencao_negocio: opD.join(' / '),
      email_lead: g(l, 'leads', 'email') || '', email_contato: ct ? g(ct, 'contacts', 'email') || '' : '', cargo_lead: cargoL || '', cargo_contato: ct ? g(ct, 'contacts', 'cargo') || '' : '',
      tel_lead: g(l, 'leads', 'telefone') || '', tel_contato: ct ? (g(ct, 'contacts', 'telefone') || g(ct, 'contacts', 'celular') || '') : '' };
  });

  // contatos com campo Empresa divergente, contados por empresa associada (para agrupar a lista do CON-02)
  const ctDivPorEmpresa = new Map();
  for (const x of C) if (x.f.empresa_div) ctDivPorEmpresa.set(x.grupo_emp, (ctDivPorEmpresa.get(x.grupo_emp) || 0) + 1);
  // ---------- consistência do lado da empresa (CON-08, CON-10, CON-11) ----------
  const RANK = { subscriber: 1, lead: 2, marketingqualifiedlead: 3, salesqualifiedlead: 4, opportunity: 5, customer: 6, evangelist: 7 };
  const ctsDaEmpresa = new Map();
  for (const x of C) for (const e of (contactCompanies.get(x.id) || [])) { if (!ctsDaEmpresa.has(e)) ctsDaEmpresa.set(e, []); ctsDaEmpresa.get(e).push(x.id); }
  const leadBase = new Set(), leadErr = new Set(), leadDet = new Map();
  for (const l of leadsF) {
    const ct = assoc(l, 'contact').map(i => ctById.get(i)).find(Boolean); if (!ct) continue;
    const ctEmps = contactCompanies.get(ct.id) || [];
    for (const e of assoc(l, 'compan')) { if (!comp.has(e)) continue; leadBase.add(e); if (!ctEmps.includes(e)) { leadErr.add(e); if (!leadDet.has(e)) leadDet.set(e, []); leadDet.get(e).push(`${g(l, 'leads', 'nome') || 'Lead ' + l.id} (lead ${l.id}) · contato ${g(ct, 'contacts', 'email') || ct.id}`); } }
  }
  for (const x of E) {
    const c = comp.get(x.id), nm = normName(g(c, 'companies', 'nome')), lifeE = RANK[(g(c, 'companies', 'lifecycle') || '').toLowerCase()];
    const cs = (ctsDaEmpresa.get(x.id) || []).map(i => ctById.get(i));
    const txts = cs.map(k => normName(g(k, 'contacts', 'empresa'))).filter(t => t.length >= 3);
    const ranks = cs.map(k => RANK[(g(k, 'contacts', 'lifecycle') || '').toLowerCase()]).filter(Boolean);
    x.f.nome_base = nm.length >= 3 && txts.length > 0;
    x.f.nome_err = x.f.nome_base && !txts.some(t => t.includes(nm) || nm.includes(t));
    x.f.lead_base = leadBase.has(x.id); x.f.lead_err = leadErr.has(x.id);
    x.f.life_base = !!lifeE && ranks.length > 0;
    x.f.life_err = x.f.life_base && lifeE !== Math.max(...ranks);
    x.f.con_base = x.f.lead_base || x.f.life_base;
    x.f.con = x.f.lead_err || x.f.life_err;
    x.row.leads_divergentes = (leadDet.get(x.id) || []).join(' | ');
    x.f.saudavel = x.f.saudavel && !x.f.con;
    x.row.lifecycle_contatos = ranks.length ? Object.keys(RANK).find(k => RANK[k] === Math.max(...ranks)) : '';
  }

  // ---------- IDPs ----------
  const cnt = (arr, pred) => arr.reduce((s, x) => s + (pred(x) ? 1 : 0), 0);
  const sc = (arr, base, err) => ({ tb: cnt(arr, base), te: cnt(arr, x => base(x) && err(x)), ub: cnt(arr, x => x.uso && base(x)), ue: cnt(arr, x => x.uso && base(x) && err(x)) });
  const scL = (base, err) => sc(LD.map(x => ({ ...x, uso: x.f.aberto })), base, err);
  const all = () => true;
  const lists = {}, IDP = [], acoesDup = {};
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
      tel_lead: x.tel_lead, tel_contato: x.tel_contato, operacao_lead: x.operacao_lead, operacao_negocio: x.operacao_negocio, intencao_lead: x.intencao_lead, intencao_negocio: x.intencao_negocio, link_hubspot: link('0-136', x.id), _uso: x.f.aberto }))
  };
  const idx = (t, arr, base, err) => { const b = [], e = []; arr.forEach((x, i) => { if (base(x)) { b.push(i); if (err(x)) e.push(i); } }); return { t, b, e }; };
  const listE = (base, err) => idx('E', E, base, err);
  const listC = (base, err) => idx('C', C, base, err);
  const listL = (base, err) => idx('L', LD, base, err);
  // Listas de duplicidade: todos os registros do grupo, com a chave e o tamanho do grupo
  const idxG = (t, arr, err, key, size) => { const r = idx(t, arr, () => true, err); r.grp = {}; r.qtd = {}; r.e.forEach(i => { const k = key(arr[i]); r.grp[i] = k; r.qtd[k] = size(arr[i]); }); return r; };
  const pE = (k) => [x => x.f[k + '_base'], x => x.f[k + '_err']];
  const pC = (k, e = '_err') => [x => x.f[k + '_base'], x => x.f[k + e]];

  // Acurácia
  // Acurácia
  add('ACU-01', 'acuracia', 'Porte incoerente com o nº de funcionários', 'Empresa', 'Oficial', sc(E, ...pE('porte')), 'Faixa do porte (Micro 1–9, Pequena 10–49, Média 50–99, Grande 100–999, Enterprise 1000+) × numberofemployees.', listE(...pE('porte')));
  add('ACU-02', 'acuracia', 'CNPJ inválido', 'Empresa', 'Oficial', sc(E, ...pE('cnpj')), 'CNPJ preenchido de empresa do Brasil sem 14 dígitos, repetido ou com dígito verificador errado.', listE(...pE('cnpj')));
  add('ACU-03', 'acuracia', 'País diferente do country (Breeze)', 'Empresa', 'Oficial', sc(E, ...pE('pais')), 'pais × country, com nomes em português e inglês tratados como o mesmo país. Avalia empresas com os dois campos.', listE(...pE('pais')));
  add('ACU-04', 'acuracia', 'Domínio diferente do site', 'Empresa', 'Oficial', sc(E, ...pE('site')), 'Domínio raiz de domain × domínio raiz de website. Avalia empresas com os dois campos.', listE(...pE('site')));
  add('ACU-05', 'acuracia', 'LinkedIn diferente do LinkedIn do Breeze', 'Contato', 'Oficial', sc(C, ...pC('li')), 'Perfil (linkedin.com/in/…) de linkedin × hs_linkedin_url. Avalia contatos com os dois campos.', listC(...pC('li')));
  add('ACU-06', 'acuracia', 'Segmento diferente da indústria (Breeze)', 'Empresa', 'Oficial', sc(E, ...pE('seg')), 'segmento × industry do Breeze por de-para. Não avalia segmento "Outros" nem indústrias sem correspondência.', listE(...pE('seg')));
  add('ACU-07', 'acuracia', 'Contato com e-mail público em vez de corporativo', 'Contato', 'Oficial', sc(C, x => x.f.pub_base, x => x.f.pub_err), 'E-mail de provedor público (gmail, hotmail, outlook, yahoo, icloud, live, bol, uol, terra). Negócios são fechados com POCs de e-mail corporativo.', listC(x => x.f.pub_base, x => x.f.pub_err));
  add('ACU-08', 'acuracia', 'E-mail do contato inválido (hard bounce)', 'Contato', 'Oficial', sc(C, x => x.f.bounce_base, x => x.f.bounce_err), 'O HubSpot tentou entregar e o e-mail voltou como inexistente ou inválido (hard bounce). Normalmente é um contato que saiu da empresa.', listC(x => x.f.bounce_base, x => x.f.bounce_err));
  // Consistência entre objetos
  const ctErrPorEmp = new Map();
  for (const x of C) if (x.f.dominio_div) ctErrPorEmp.set(x.grupo_emp, (ctErrPorEmp.get(x.grupo_emp) || 0) + 1);
  add('CON-01', 'consistencia', 'Contato associado à empresa errada (e-mail de outra empresa)', 'Contato', 'Oficial', sc(C, x => x.f.dominio_base, x => x.f.dominio_div), 'Domínio do e-mail do contato × domínio e nome das empresas associadas. Quando o nome da empresa corresponde ao domínio do e-mail (Itaú × itau-unibanco.com.br), é domínio alternativo da mesma empresa e não conta como erro. A lista agrupa por empresa associada e sugere a correção: associar à empresa do e-mail, criar a empresa ou revisar (agência, grupo ou nome antigo).', idxG('C', C, x => x.f.dominio_div, x => x.grupo_emp, x => ctErrPorEmp.get(x.grupo_emp) || 0));
  add('CON-02', 'consistencia', 'Campo "Empresa" diferente da empresa associada', 'Contato', 'Oficial', sc(C, x => x.f.empresa_base, x => x.f.empresa_div), 'Texto de company × nome das empresas associadas (sem acento, espaço e pontuação; um contido no outro passa). A lista agrupa os contatos por empresa associada, da que tem mais casos para a que tem menos.', idxG('C', C, x => x.f.empresa_div, x => x.grupo_emp, x => ctDivPorEmpresa.get(x.grupo_emp) || 0));
  add('CON-03', 'consistencia', 'Telefone do lead diferente do contato', 'Lead', 'Oficial', scL(x => x.f.tel_base, x => x.f.tel_div), 'Últimos 8 dígitos do telefone do lead × telefone ou celular do contato.', listL(x => x.f.tel_base, x => x.f.tel_div));
  add('CON-04', 'consistencia', 'Empresa dos leads diferente da empresa dos contatos', 'Empresa', 'Oficial', sc(E, x => x.f.lead_base, x => x.f.lead_err), 'A empresa está associada a pelo menos um lead cujo contato não está associado a ela. A lista mostra, em cada empresa, os leads e contatos envolvidos.', listE(x => x.f.lead_base, x => x.f.lead_err));
  add('CON-05', 'consistencia', 'Lifecycle da empresa diferente do dos contatos', 'Empresa', 'Oficial', sc(E, x => x.f.life_base, x => x.f.life_err), 'Lifecycle da empresa diferente do lifecycle mais avançado entre os seus contatos.', listE(x => x.f.life_base, x => x.f.life_err));
  add('CON-06', 'consistencia', 'Operação do lead diferente da do negócio', 'Lead', 'Oficial', scL(x => x.f.op_base, x => x.f.op_div), 'Leads na etapa Reunião Agendada (SDRs) ou Agendado (Executivos), com negócio associado e Operação preenchida nos dois: Operação do lead × Operação do negócio.', listL(x => x.f.op_base, x => x.f.op_div));
  add('CON-07', 'consistencia', 'Intenção de compra do lead diferente da Operação do negócio', 'Lead', 'Oficial', scL(x => x.f.int_base, x => x.f.int_div), 'Leads na etapa Reunião Agendada/Agendado com negócio: Intenção de compra do lead × Operação do negócio (RMApp – MI, RI, DataRank e demais RMApp = RankMyApp; RMAds = RankMyAds). RankMyGeo, DI e MP + DataRank ainda não são avaliados.', listL(x => x.f.int_base, x => x.f.int_div));
  // Completude
  add('COM-01', 'completude', 'Empresa com algum campo vazio', 'Empresa', 'Oficial', sc(E, all, x => x.f.com), 'Conta como erro se faltar: nome, porte, segmento, país, abrangência, domínio ou CNPJ (este só para empresas Cliente).', listE(all, x => x.f.com));
  for (const [id, k, t, base] of [['COM-01.1', 'sem_nome', 'Sem nome da empresa'], ['COM-01.2', 'sem_porte', 'Sem porte'], ['COM-01.3', 'sem_segmento', 'Sem segmento'], ['COM-01.4', 'sem_pais', 'Sem país'], ['COM-01.5', 'sem_abrang', 'Sem abrangência'], ['COM-01.6', 'sem_dominio', 'Sem domínio'], ['COM-01.7', 'sem_cnpj_cli', 'Cliente sem CNPJ']])
    add(id, 'completude', '↳ ' + t, 'Empresa', 'Detalhe', sc(E, all, x => x.f[k]), 'Detalhe do COM-01, fora da nota.', listE(all, x => x.f[k]));
  add('COM-02', 'completude', 'Contato com algum campo vazio', 'Contato', 'Oficial', sc(C, all, x => x.f.com), 'Conta como erro se faltar: nome, e-mail, hierarquia do cargo, área do POC ou LinkedIn.', listC(all, x => x.f.com));
  for (const [id, k, t] of [['COM-02.1', 'sem_nome', 'Sem nome'], ['COM-02.2', 'sem_email', 'Sem e-mail'], ['COM-02.3', 'sem_cargo', 'Sem hierarquia do cargo'], ['COM-02.4', 'sem_area', 'Sem área do POC'], ['COM-02.5', 'sem_linkedin', 'Sem LinkedIn']])
    add(id, 'completude', '↳ ' + t, 'Contato', 'Detalhe', sc(C, all, x => x.f[k]), 'Detalhe do COM-02, fora da nota.', listC(all, x => x.f[k]));
  add('COM-03', 'completude', 'Lead com algum campo vazio', 'Lead', 'Oficial', scL(all, x => x.f.com), 'Conta como erro se faltar origem (todos) ou, nos leads que estão ou passaram por Reunião Agendada/Agendado, Operação ou Intenção de compra.', listL(all, x => x.f.com));
  add('COM-03.1', 'completude', '↳ Sem origem', 'Lead', 'Detalhe', scL(all, x => x.f.sem_origem), 'Detalhe do COM-03, fora da nota.', listL(all, x => x.f.sem_origem));
  add('COM-03.2', 'completude', '↳ Agendado sem Operação', 'Lead', 'Detalhe', scL(x => x.f.eleg, x => x.f.sem_operacao), 'Detalhe do COM-03, fora da nota.', listL(x => x.f.eleg, x => x.f.sem_operacao));
  add('COM-03.3', 'completude', '↳ Agendado sem Intenção de compra', 'Lead', 'Detalhe', scL(x => x.f.eleg, x => x.f.sem_intencao), 'Detalhe do COM-03, fora da nota.', listL(x => x.f.eleg, x => x.f.sem_intencao));
  // Duplicidade
  add('UNI-01', 'unicidade', 'Empresas com o mesmo domínio', 'Empresa', 'Oficial', sc(E, all, x => x.f.dup_dom), 'Domínio idêntico (sem www e protocolo). A lista mostra todos os registros de cada domínio juntos.', idxG('E', E, x => x.f.dup_dom, x => x.grupos.dom, x => x.grupos.dom_n));
  add('UNI-02', 'unicidade', 'Empresas com o mesmo domínio raiz', 'Empresa', 'Oficial', sc(E, all, x => x.f.dup_root), 'Mesmo domínio raiz com domínios diferentes, como vivara.com × vivara.com.br × loja.vivara.com (sufixos como com.br e ind.br são ignorados). Pode ser outra unidade ou site de outro país, por isso a ação é Revisar.', idxG('E', E, x => x.f.dup_root, x => x.grupos.raiz, x => x.grupos.raiz_n));
  add('UNI-03', 'unicidade', 'Empresas com o mesmo nome', 'Empresa', 'Oficial', sc(E, all, x => x.f.dup_nome), 'Mesmo nome (sem acento, espaço e pontuação) e mesmo país, sem domínio próprio diferente. Registros do mesmo nome em outro país ou com outro domínio raiz ficam de fora, porque podem ser filial ou outra empresa. A lista traz a ação recomendada em cada grupo.', idxG('E', E, x => x.f.dup_nome, x => x.grupos.nome, x => x.grupos.nome_n));
  add('UNI-04', 'unicidade', 'Contatos com o mesmo LinkedIn', 'Contato', 'Oficial', sc(C, all, x => x.f.dup_li), 'Mesmo perfil linkedin.com/in/… em mais de um contato. A lista mostra os contatos de cada perfil juntos.', idxG('C', C, x => x.f.dup_li, x => 'linkedin.com/in/' + x.grupos.li, x => x.grupos.li_n));
  // ---------- Duplicidade: recomendação de ação (manter, mesclar, excluir ou revisar) ----------
  // Regras de precedência: UNI-01 (mesmo domínio) define o principal; UNI-03 (mesmo nome) se junta à mesma empresa real;
  // UNI-02 (domínio raiz) é sempre revisão. Um registro cujo nome não corresponde ao domínio, ou cujos contatos são de
  // outra empresa, nunca é principal e nunca recebe ação automática.
  {
    const leadsPorEmp = new Map(), leadsPorCt = new Map();
    for (const l of leadsF) { assoc(l, 'compan').forEach(i => leadsPorEmp.set(i, (leadsPorEmp.get(i) || 0) + 1)); assoc(l, 'contact').forEach(i => leadsPorCt.set(i, (leadsPorCt.get(i) || 0) + 1)); }
    const CAMPOS_E = [['nome', 'nome'], ['porte', 'porte'], ['segmento', 'segmento'], ['pais', 'país'], ['abrangencia', 'abrangência'], ['dominio', 'domínio'], ['cnpj', 'CNPJ']];
    const CAMPOS_C = [['nome', 'nome'], ['sobrenome', 'sobrenome'], ['email', 'e-mail'], ['cargo', 'hierarquia do cargo'], ['area_poc', 'área do POC'], ['linkedin', 'LinkedIn']];
    // e-mails corporativos dos contatos associados a cada empresa (domínio raiz → quantidade)
    const emailsPorEmp = new Map();
    for (const c of cts) {
      const em = String(g(c, 'contacts', 'email') || '').toLowerCase(); const d = em.includes('@') ? em.split('@')[1] : '';
      if (!domEmpresaOk(d)) continue; const r = raizLimpa(d);
      for (const e of (contactCompanies.get(c.id) || [])) { if (!emailsPorEmp.has(e)) emailsPorEmp.set(e, new Map()); const m = emailsPorEmp.get(e); m.set(r, (m.get(r) || 0) + 1); }
    }
    const infoE = E.map((x, i) => {
      const c = comp.get(x.id), r = TAB.E[i], dom = normDom(g(c, 'companies', 'dominio'));
      const o = { i, id: x.id, dom, nome: g(c, 'companies', 'nome') || '', cli: String(g(c, 'companies', 'lifecycle') || '').toLowerCase() === 'customer', neg: num(g(c, 'companies', 'n_negocios')) || 0, ct: num(g(c, 'companies', 'n_contatos')) || 0, ld: leadsPorEmp.get(x.id) || 0 };
      o.cheios = CAMPOS_E.filter(([k]) => !vazio(r[k])).map(([k]) => k); o.campos = o.cheios.length;
      o.raiz = domEmpresaOk(dom) ? raizLimpa(dom) : '';
      o.nomeOk = nomeBateDominio(o.nome, o.raiz);
      // contatos: de qual empresa são os e-mails?
      const m = emailsPorEmp.get(x.id); let tot = 0, iguais = 0, outra = '', nOutra = 0;
      if (m) for (const [k, n] of m) { tot += n; if (o.raiz && k === o.raiz) iguais += n; else if (n > nOutra) { outra = k; nOutra = n; } }
      o.ctOutra = tot >= 2 && !!outra && nOutra / tot >= 0.5 && iguais / tot < 0.5 && !nomeBateDominio(o.nome, outra);
      r.contatos_emails = tot ? `${tot} com e-mail corporativo: ${iguais} @${o.raiz || '—'}${nOutra ? `, ${nOutra} @${outra}` : ''}` : '';
      o.confiavel = o.nomeOk && !o.ctOutra;
      o.alerta = !o.nomeOk ? `nome "${o.nome}" não corresponde ao domínio ${dom || '—'}` : (o.ctOutra ? `a maioria dos contatos tem e-mail @${outra}, de outra empresa` : '');
      r.n_negocios = o.neg; r.n_contatos = o.ct; r.n_leads = o.ld; r.campos_preenchidos = `${o.campos} de ${CAMPOS_E.length} campos`;
      return o;
    });
    const infoC = C.map((x, i) => {
      const c = ctById.get(x.id), r = TAB.C[i];
      const o = { i, id: x.id, nome: r.nome || '', valido: !!r.email && !x.f.pub_err && !x.f.bounce_err, neg: num(g(c, 'contacts', 'n_negocios')) || 0, ld: leadsPorCt.get(x.id) || 0, ct: 0, cli: false, confiavel: true, alerta: '' };
      o.cheios = CAMPOS_C.filter(([k]) => !vazio(r[k])).map(([k]) => k); o.campos = o.cheios.length;
      r.n_negocios = o.neg; r.n_leads = o.ld; r.campos_preenchidos = `${o.campos} de ${CAMPOS_C.length} campos`;
      return o;
    });
    const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
    const vinculosE = (o) => [o.cli ? 'cliente' : '', o.neg ? plural(o.neg, 'negócio', 'negócios') : '', o.ct ? plural(o.ct, 'contato', 'contatos') : '', o.ld ? plural(o.ld, 'lead', 'leads') : ''].filter(Boolean);
    const ROT_E = Object.fromEntries(CAMPOS_E);
    const idNum = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    const melhorE = (a, b) => (b.confiavel - a.confiavel) || (b.cli - a.cli) || (b.neg - a.neg) || ((b.ct + b.ld) - (a.ct + a.ld)) || (b.campos - a.campos) || idNum(a, b);
    const melhorC = (a, b) => (b.valido - a.valido) || (b.neg - a.neg) || (b.ld - a.ld) || (b.campos - a.campos) || idNum(a, b);
    const gruposDe = (idp) => { const ix = lists[idp], m = new Map(); if (!ix || !ix.grp) return m; for (const i of ix.e) { const k = ix.grp[i]; if (!m.has(k)) m.set(k, []); m.get(k).push(i); } return m; };

    // Empresa real (entidade): grupos do UNI-01 e do UNI-03 que compartilham registros viram um só conjunto
    const pai = E.map((_, i) => i);
    const raiz = (i) => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
    const une = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) pai[b] = a; };
    const g01 = gruposDe('UNI-01'), g03 = gruposDe('UNI-03');
    for (const ms of [...g01.values(), ...g03.values()]) ms.slice(1).forEach(i => une(ms[0], i));
    const em01 = new Set([].concat(...g01.values()));
    const entidades = new Map();
    for (const i of new Set([].concat(...g01.values(), ...g03.values()))) { const r = raiz(i); if (!entidades.has(r)) entidades.set(r, []); entidades.get(r).push(i); }
    const principalDe = new Map(), semPrincipal = new Set();
    for (const ms of entidades.values()) {
      const info = ms.map(i => infoE[i]);
      // 1º: principal confiável vindo do UNI-01; 2º: qualquer confiável; senão, entidade inteira vai para revisão
      const c01 = info.filter(o => o.confiavel && em01.has(o.i)).sort(melhorE);
      const conf = info.filter(o => o.confiavel).sort(melhorE);
      const p = c01[0] || conf[0] || [...info].sort(melhorE)[0];
      if (!c01.length && !conf.length) ms.forEach(i => semPrincipal.add(i));
      ms.forEach(i => principalDe.set(i, p.i));
    }
    // Ação por empresa real, calculada uma vez: o registro recebe a mesma ação no UNI-01 e no UNI-03
    const acaoEnt = new Map();
    for (const ms of entidades.values()) {
      const p = infoE[principalDe.get(ms[0])], semConf = semPrincipal.has(p.i), cobertos = new Set(p.cheios);
      const outros = ms.filter(i => i !== p.i).map(i => infoE[i]).sort(melhorE);
      const vp = vinculosE(p);
      acaoEnt.set(p.i, semConf ? ['Revisar', `Nenhum registro confiável para ser o principal: ${p.alerta}`] : ['Manter (principal)', `Principal: ${vp.length ? vp.join(', ') + ', ' : 'sem vínculos, '}${p.campos} de ${CAMPOS_E.length} campos`]);
      for (const o of outros) {
        const v = vinculosE(o), novos = o.cheios.filter(k => !cobertos.has(k)).map(k => ROT_E[k]);
        const temAlgo = v.length > 0 || novos.length > 0;
        const det = [v.length ? v.join(', ') : '', novos.length ? `tem ${novos.join(', ')} que falta no principal` : ''].filter(Boolean).join('; ');
        const destino = o.dom && o.dom === p.dom ? 'no principal' : `no principal ${p.nome} (ID ${p.id})`;
        if (semConf) acaoEnt.set(o.i, ['Revisar', `Nenhum registro confiável para ser o principal. ${o.alerta ? 'Este: ' + o.alerta : ''}`.trim()]);
        else if (!o.confiavel) acaoEnt.set(o.i, ['Revisar', `Pode ser marca, unidade ou domínio errado: ${o.alerta}`]);
        else if (temAlgo) { acaoEnt.set(o.i, ['Mesclar no principal', `Mesclar ${destino}: ${det}`]); o.cheios.forEach(k => cobertos.add(k)); }
        else acaoEnt.set(o.i, ['Excluir', `Sem negócios, contatos, leads e nenhum dado que falte no principal (ou que já venha de outro registro mesclado)${o.dom === p.dom ? '' : ` · principal: ${p.nome} (ID ${p.id})`}`]);
      }
    }

    const vinculos = (o, tipo) => [o.cli ? 'cliente' : '', o.neg ? plural(o.neg, 'negócio', 'negócios') : '', tipo === 'E' && o.ct ? plural(o.ct, 'contato', 'contatos') : '', o.ld ? plural(o.ld, 'lead', 'leads') : ''].filter(Boolean);
    const classificar = (idp, tipo, revisar) => {
      const ix = lists[idp]; if (!ix || !ix.grp) return;
      const info = tipo === 'E' ? infoE : infoC, CAMPOS = tipo === 'E' ? CAMPOS_E : CAMPOS_C, rotulo = Object.fromEntries(CAMPOS);
      const melhor = tipo === 'E' ? melhorE : melhorC;
      const grupos = gruposDe(idp);
      ix.acao = {}; ix.motivo = {}; ix.ordem = {}; ix.pid = {}; ix.pnome = {};
      const resumo = { grupos: grupos.size, 'Manter (principal)': 0, 'Mesclar no principal': 0, 'Excluir': 0, 'Revisar': 0 };
      for (const membros of grupos.values()) {
        // principal: o da empresa real (UNI-01/UNI-03) ou, no UNI-02 e nos contatos, o melhor do próprio grupo
        const pIdx = (tipo === 'E' && !revisar && principalDe.has(membros[0])) ? principalDe.get(membros[0]) : [...membros].sort((a, b) => melhor(info[a], info[b]))[0];
        const p = info[pIdx], cobertos = new Set(p.cheios), ordenados = [...membros].sort((a, b) => (a === pIdx ? -1 : b === pIdx ? 1 : melhor(info[a], info[b])));
        const semConf = tipo === 'E' && !revisar && semPrincipal.has(pIdx);
        ordenados.forEach((i, pos) => {
          const o = info[i]; ix.ordem[i] = pos; ix.pid[i] = p.id; ix.pnome[i] = p.nome;
          if (tipo === 'E' && !revisar && acaoEnt.has(i)) { [ix.acao[i], ix.motivo[i]] = acaoEnt.get(i); resumo[ix.acao[i]]++; return; }
          if (i === pIdx) {
            const v = vinculos(o, tipo);
            ix.acao[i] = semConf ? 'Revisar' : 'Manter (principal)';
            ix.motivo[i] = semConf ? `Nenhum registro confiável para ser o principal: ${o.alerta}` : `Principal: ${v.length ? v.join(', ') + ', ' : 'sem vínculos, '}${o.campos} de ${CAMPOS.length} campos${tipo === 'C' ? (o.valido ? ', e-mail corporativo válido' : ', e-mail público ou inválido') : ''}`;
          } else {
            const v = vinculos(o, tipo), novos = o.cheios.filter(k => !cobertos.has(k)).map(k => rotulo[k]);
            const temAlgo = v.length > 0 || novos.length > 0;
            const det = [v.length ? v.join(', ') : '', novos.length ? `tem ${novos.join(', ')} que falta no principal` : ''].filter(Boolean).join('; ');
            const destino = membros.includes(pIdx) ? 'no principal' : `no principal ${p.nome} (ID ${p.id})`;
            if (revisar) { ix.acao[i] = 'Revisar'; ix.motivo[i] = `${o.confiavel ? '' : 'Atenção: ' + o.alerta + '. '}Confirmar se é a mesma empresa. Se for: ${temAlgo ? 'mesclar no principal (' + det + ')' : 'excluir (sem vínculos e sem dado novo)'}`; }
            else if (semConf) { ix.acao[i] = 'Revisar'; ix.motivo[i] = `Nenhum registro confiável para ser o principal. ${o.alerta ? 'Este: ' + o.alerta : ''}`.trim(); }
            else if (!o.confiavel) { ix.acao[i] = 'Revisar'; ix.motivo[i] = `Pode ser marca, unidade ou domínio errado: ${o.alerta}`; }
            else if (temAlgo) { ix.acao[i] = 'Mesclar no principal'; ix.motivo[i] = `Mesclar ${destino}: ${det}`; o.cheios.forEach(k => cobertos.add(k)); }
            else { ix.acao[i] = 'Excluir'; ix.motivo[i] = `Sem negócios, ${tipo === 'E' ? 'contatos, ' : ''}leads e nenhum dado que falte no principal (ou que já venha de outro registro mesclado)`; }
          }
          resumo[ix.acao[i]]++;
        });
      }
      ix.resumo = resumo; acoesDup[idp] = resumo;
    };
    classificar('UNI-01', 'E', false);
    classificar('UNI-02', 'E', true);
    classificar('UNI-03', 'E', false);
    classificar('UNI-04', 'C', false);
  }
  // Integridade
  add('INT-01', 'integridade', 'Empresa sem contato', 'Empresa', 'Oficial', sc(E, all, x => x.f.sem_contato), 'Empresa sem nenhum contato associado.', listE(all, x => x.f.sem_contato));
  add('INT-02', 'integridade', 'Contato sem empresa', 'Contato', 'Oficial', sc(C, all, x => x.f.sem_empresa), 'Contato sem nenhuma empresa associada.', listC(all, x => x.f.sem_empresa));
  add('INT-03', 'integridade', 'Lead sem contato', 'Lead', 'Oficial', scL(all, x => x.f.sem_contato), 'Lead sem contato associado.', listL(all, x => x.f.sem_contato));
  add('INT-04', 'integridade', 'Lead sem empresa', 'Lead', 'Oficial', scL(all, x => x.f.sem_empresa), 'Lead sem empresa associada.', listL(all, x => x.f.sem_empresa));
  add('INT-05', 'integridade', 'Lead agendado sem negócio', 'Lead', 'Monitoramento', scL(x => x.f.eleg, x => x.f.agend_sem_neg), 'Leads dos pipelines SDRs e Executivos que estão ou passaram por Reunião Agendada/Agendado sem negócio associado. Fora da nota.', listL(x => x.f.eleg, x => x.f.agend_sem_neg));

  // ---------- dimensões e DHS ----------
  const all2 = all;
  const nomes = { acuracia: 'Acurácia', consistencia: 'Consistência entre objetos', completude: 'Completude', unicidade: 'Duplicidade', integridade: 'Integridade' };
  // Nota por registro: em cada objeto, o registro conta uma vez e é erro se falhar em qualquer regra da dimensão
  // Nota por objeto = % de registros sem erro na dimensão. Peso do objeto = nº de regras dele na dimensão, com teto.
  const REG = {
    acuracia: [['Empresas', E, x => x.f.acu_base, x => x.f.acu, 5], ['Contatos', C, x => x.f.acu_base, x => x.f.acu, 3]],
    consistencia: [['Empresas', E, x => x.f.con_base, x => x.f.con, 3], ['Contatos', C, x => x.f.dominio_base || x.f.empresa_base, x => x.f.con, 2], ['Leads', LD, x => x.f.con_base, x => x.f.con, 4]],
    completude: [['Empresas', E, all, x => x.f.com, 7], ['Contatos', C, all, x => x.f.com, 5], ['Leads', LD, all, x => x.f.com, 3]],
    unicidade: [['Empresas', E, all, x => x.f.dup, 3], ['Contatos', C, all, x => x.f.dup_li, 1]],
    integridade: [['Empresas', E, all, x => x.f.sem_contato, 1], ['Contatos', C, all, x => x.f.sem_empresa, 1], ['Leads', LD, all, x => x.f.sem_contato || x.f.sem_empresa, 2]]
  };
  const usoDe = (x) => (x.f && x.f.aberto !== undefined ? x.f.aberto : x.uso);
  // Pesos pelo nº de regras, nenhum objeto acima do teto (o excedente vai para os outros, na proporção das regras)
  const pesos = (regras) => {
    if (regras.length === 1) return [1];
    const tot = regras.reduce((a, r) => a + r, 0); if (!tot) return regras.map(() => 0);
    let w = regras.map(r => r / tot);
    for (let i = 0; i < 5; i++) {
      const acima = w.map(v => v > TETO_OBJETO + 1e-9); if (!acima.some(Boolean)) break;
      const sobra = w.reduce((a, v, j) => a + (acima[j] ? v - TETO_OBJETO : 0), 0);
      const baseLivre = regras.reduce((a, r, j) => a + (acima[j] || w[j] >= TETO_OBJETO ? 0 : r), 0);
      w = w.map((v, j) => acima[j] ? TETO_OBJETO : (baseLivre ? v + sobra * regras[j] / baseLivre : v));
    }
    return w;
  };
  // DHS 2.0 híbrido: por objeto e dimensão, nota = 80% conformidade média dos IDPs + 20% saúde dos registros
  const OBJ_IDP = { Empresas: 'Empresa', Contatos: 'Contato', Leads: 'Lead' };
  const conformidade = (dim, objeto, esc) => {
    const b = esc === 'total' ? 'total_base' : 'uso_base', e = esc === 'total' ? 'total' : 'uso';
    const rs = IDP.filter(r => r.nota && r.dimensao === dim && r.objeto === OBJ_IDP[objeto] && r[b] > 0);
    return rs.length ? rs.reduce((a, r) => a + 100 * (r[b] - r[e]) / r[b], 0) / rs.length : null;
  };
  // Penalidade cumulativa: cada dimensão abaixo de 80 desconta de novo o seu déficit (80 − nota) × peso
  const LIMITE = 80;
  const penalidadeDims = (notas) => notas.reduce((a, n) => a + (n.v < LIMITE ? PESOS[n.id] * (LIMITE - n.v) : 0), 0);
  const penalidade = (media, pior) => (pior < 50 ? 0.7 * media + 0.3 * pior : pior < 70 ? 0.85 * media + 0.15 * pior : media);
  const statusDe = (v) => (v <= 50 ? 'Crítico' : v <= 70 ? 'Atenção' : v <= 85 ? 'Bom' : v <= 95 ? 'Saudável' : 'Excelente');
  // Peso dos objetos: fixo (Empresas 45 · Contatos 40 · Leads 15) em Consistência, Completude e Integridade;
  // nas demais, pelo nº de regras com teto de 70%
  const PESO_OBJ = { Empresas: 0.45, Contatos: 0.4, Leads: 0.15 };
  const FIXOS = ['consistencia', 'completude', 'integridade'];
  const pesoObjetos = (id, ok) => {
    if (!FIXOS.includes(id)) return pesos(ok.map(o => o.regras));
    const t = ok.reduce((a, o) => a + PESO_OBJ[o.objeto], 0);
    return ok.map(o => (t ? PESO_OBJ[o.objeto] / t : 0));
  };
  const dimensoes = Object.keys(PESOS).map(id => {
    const objetos = REG[id].map(([objeto, arr, base, err, regras]) => {
      let av = 0, er = 0, avu = 0, eru = 0;
      for (const x of arr) { if (!base(x)) continue; const e = err(x), u = usoDe(x); av++; if (e) er++; if (u) { avu++; if (e) eru++; } }
      const saude = av ? 100 * (av - er) / av : null, saude_uso = avu ? 100 * (avu - eru) / avu : null;
      const conf = conformidade(id, objeto, 'total'), conf_uso = conformidade(id, objeto, 'uso');
      const hib = (c, h) => (h == null ? null : 0.8 * (c == null ? h : c) + 0.2 * h);
      return { objeto, regras, avaliados: av, com_erro: er, avaliados_uso: avu, com_erro_uso: eru,
        saude, saude_uso, conformidade: conf, conformidade_uso: conf_uso, nota: hib(conf, saude), nota_uso: hib(conf_uso, saude_uso) };
    });
    const calc = (k, pk) => { const ok = objetos.filter(o => o[k] != null); const w = pesoObjetos(id, ok); if (pk) ok.forEach((o, i) => { o[pk] = w[i]; }); return ok.reduce((a, o, i) => a + w[i] * o[k], 0); };
    const hibrida = calc('nota', 'peso'), hibrida_uso = calc('nota_uso', 'peso_uso');
    const total = calc('saude'), uso = calc('saude_uso');
    return { dimensao: id, nome: nomes[id], peso: PESOS[id], total, uso, objetos, hibrida, hibrida_uso,
      conformidade: calc('conformidade'), conformidade_uso: calc('conformidade_uso'), saude: total, saude_uso: uso,
      impacto_total: PESOS[id] * (100 - total), impacto_uso: PESOS[id] * (100 - uso) };
  });
  // Regra 50/70 da pior dimensão: ≥ 70 sem penalidade; 50–70: 85% média + 15% pior; < 50: 70% média + 30% pior
  const dhs = ['total', 'uso'].map(esc => {
    const media = dimensoes.reduce((s, x) => s + x.peso * x[esc], 0);
    const pior = dimensoes.reduce((m, x) => x[esc] < m[esc] ? x : m, dimensoes[0]);
    const final = penalidade(media, pior[esc]);
    return { escopo: esc, media, pior: pior[esc], pior_dimensao: pior.nome, final, impacto_penalidade: media - final, penalizou: final < media - 1e-9, status: statusDe(final), versao: '2.0' };
  });
  // Validação: mesmos registros, quatro metodologias
  const PESOS_ANT = { acuracia: 0.25, consistencia: 0.25, completude: 0.20, unicidade: 0.15, integridade: 0.15 };
  const cenario = (campo, campoUso, pesosD, pen) => ['total', 'uso'].map(esc => {
    const notas = dimensoes.map(d => ({ id: d.dimensao, v: esc === 'total' ? d[campo] : d[campoUso] }));
    const media = notas.reduce((a, n) => a + pesosD[n.id] * n.v, 0), pior = Math.min(...notas.map(n => n.v));
    return { escopo: esc, dimensoes: Object.fromEntries(notas.map(n => [n.id, n.v])), media, final: pen ? penalidade(media, pior) : media };
  });
  const comparativo = {
    atual: cenario('saude', 'saude_uso', PESOS_ANT, false),
    cenario2: cenario('saude', 'saude_uso', PESOS, false),
    hibrido_sem_penalidade: cenario('hibrida', 'hibrida_uso', PESOS, false),
    hibrido_com_penalidade: cenario('hibrida', 'hibrida_uso', PESOS, true),
    final_penalidade_cumulativa: ['total', 'uso'].map((esc, i) => ({ escopo: esc, dimensoes: Object.fromEntries(dimensoes.map(d => [d.dimensao, d[esc]])), media: dhs[i].media, final: dhs[i].final }))
  };
  // Cobertura da elegibilidade dos leads (passou por Reunião Agendada/Agendado)
  const elegibilidade = {};
  for (const [pid, pn] of [['739923376', 'SDRs'], ['916004981', 'Executivos']]) {
    const ls = leadsF.filter(l => String(g(l, 'leads', 'pipeline')) === pid);
    const etapa = (l) => LEAD_AGENDADO.includes(String(g(l, 'leads', 'etapa')));
    const kEnt = pn === 'SDRs' ? 'entrou_sdr' : 'entrou_exec';
    elegibilidade[pn] = { leads: ls.length,
      elegiveis: ls.filter(l => etapa(l) || !vazio(g(l, 'leads', 'agendamento')) || !vazio(g(l, 'leads', 'entrou_sdr')) || !vazio(g(l, 'leads', 'entrou_exec'))).length,
      pela_etapa_atual: ls.filter(etapa).length, pela_data_agendamento: ls.filter(l => !vazio(g(l, 'leads', 'agendamento'))).length,
      pela_data_entrada: ls.filter(l => !vazio(g(l, 'leads', kEnt))).length, data_entrada_disponivel: !!P.leads[kEnt] };
  }
  const pct = (a, b) => (b ? a / b : null);
  // ---------- qualidade dos registros: nº de regras (da nota) em que cada registro falha ----------
  const ARR = { E, C, L: LD };
  const falhas = { E: E.map(() => []), C: C.map(() => []), L: LD.map(() => []) };
  for (const r of IDP) { if (!r.nota) continue; const ix = lists[r.idp]; if (!ix || !ix.e) continue; ix.e.forEach(i => falhas[ix.t][i].push(r.idp)); }
  const qualidade = {};
  for (const t of ['E', 'C', 'L']) {
    const usoDeT = (i) => (t === 'L' ? LD[i].f.aberto : ARR[t][i].uso);
    const fx = { 0: [], 1: [], 2: [] }, fxu = { 0: 0, 1: 0, 2: 0 }; let nu = 0;
    falhas[t].forEach((p, i) => { const k = Math.min(p.length, 2); fx[k].push(i); if (usoDeT(i)) { nu++; fxu[k]++; } TAB[t][i].problemas = p.join(', '); });
    const all_i = ARR[t].map((_, i) => i);
    ['0', '1', '2'].forEach(k => { lists[`QL${t}-0${k}`] = { t, b: all_i, e: fx[k] }; });
    qualidade[t] = { n: ARR[t].length, zero: fx[0].length, um: fx[1].length, dois: fx[2].length, n_uso: nu, zero_uso: fxu[0], um_uso: fxu[1], dois_uso: fxu[2] };
  }
  const saudaveis = {
    empresas_pct: pct(qualidade.E.zero, qualidade.E.n), empresas_uso_pct: pct(qualidade.E.zero_uso, qualidade.E.n_uso), empresas_n: E.length, empresas_uso_n: qualidade.E.n_uso,
    contatos_pct: pct(qualidade.C.zero, qualidade.C.n), contatos_uso_pct: pct(qualidade.C.zero_uso, qualidade.C.n_uso), contatos_n: C.length, contatos_uso_n: qualidade.C.n_uso,
    leads_pct: pct(qualidade.L.zero, qualidade.L.n), leads_abertos_pct: pct(qualidade.L.zero_uso, qualidade.L.n_uso), leads_n: LD.length, leads_abertos_n: qualidade.L.n_uso,
    qualidade
  };
  // DHS final = média ponderada das dimensões com a regra 50/70; saúde dos registros é informativa
  dhs.forEach(d => {
    const u = d.escopo === 'uso';
    const sr = ['E', 'C', 'L'].map(t => { const q = qualidade[t]; const n = u ? q.n_uso : q.n, z = u ? q.zero_uso : q.zero; return n ? 100 * z / n : null; }).filter(v => v != null);
    d.nota_dimensoes = d.final;
    d.saude_registros = sr.length ? sr.reduce((a, v) => a + v, 0) / sr.length : 0;
    d.final = d.nota_dimensoes; // 100% dimensões; saúde dos registros fica só como diagnóstico
    d.status = statusDe(d.final);
  });
  // ---------- Contatos na empresa errada (resumo para o card da Consistência) ----------
  const ctErrada = (() => {
    const err = C.filter(x => x.f.dominio_div), alt = C.filter(x => x.f.dominio_alt);
    const porEmp = new Map();
    for (const x of err) {
      const d = (x.row.email.split('@')[1] || ''), k = x.grupo_emp;
      const o = porEmp.get(k) || { empresa: k, contatos: 0, em_uso: 0, dominios: new Map(), sugestao: x.row.correcao_sugerida, empresa_sugerida: x.row.empresa_sugerida };
      o.contatos++; if (x.uso) o.em_uso++; o.dominios.set(d, (o.dominios.get(d) || 0) + 1); porEmp.set(k, o);
    }
    const top = [...porEmp.values()].sort((a, b) => b.contatos - a.contatos).slice(0, 10).map(o => {
      const [dom, n] = [...o.dominios.entries()].sort((a, b) => b[1] - a[1])[0];
      const ex = err.find(x => x.grupo_emp === o.empresa && x.row.email.endsWith('@' + dom));
      return { empresa: o.empresa, contatos: o.contatos, em_uso: o.em_uso, dominio_email: dom, qtd_dominio: n, sugestao: ex ? ex.row.correcao_sugerida.split(' · ')[0] : '', empresa_sugerida: ex ? ex.row.empresa_sugerida : '' };
    });
    const porTipo = {}; err.forEach(x => { const t = (x.row.correcao_sugerida || '').split(' · ')[0]; porTipo[t] = (porTipo[t] || 0) + 1; });
    return { total: err.length, em_uso: err.filter(x => x.uso).length, empresas: porEmp.size, alternativos: alt.length, por_tipo: porTipo, top };
  })();
  // ---------- Monitoramento (fora da nota): empresas sem atividade há mais de 2 anos ----------
  const LIMITE_ATIV = Date.now() - 730 * 24 * 3600 * 1000;
  const dataDe = (v) => { if (vazio(v)) return null; const n = Number(v); const t = isNaN(n) ? Date.parse(v) : n; return isNaN(t) ? null : t; };
  const combos = new Map(); const inativasIdx = [];
  E.forEach((x, i) => {
    const t = dataDe(g(comp.get(x.id), 'companies', 'ultima_atividade'));
    const inativa = t == null || t < LIMITE_ATIV;
    x.row.ultima_atividade = t == null ? 'nunca' : new Date(t).toISOString().slice(0, 10);
    TAB.E[i].ultima_atividade = x.row.ultima_atividade;
    if (inativa) inativasIdx.push(i);
    const k = (x.row.porte || '(sem porte)') + '||' + (x.row.segmento || '(sem segmento)');
    const o = combos.get(k) || { porte: x.row.porte || '(sem porte)', segmento: x.row.segmento || '(sem segmento)', total: 0, inativas: 0 };
    o.total++; if (inativa) o.inativas++; combos.set(k, o);
  });
  lists['MON-01'] = { t: 'E', b: E.map((_, i) => i), e: inativasIdx };
  const monitor = { inatividade: { regra: 'Sem atividade registrada (notes_last_updated) há mais de 24 meses ou nunca', total: E.length, inativas: inativasIdx.length, combos: [...combos.values()] } };
  // ---------- origens ofensoras (empresas e contatos) ----------
  const origemNome = { CRM_UI: 'UI de CRM', IMPORT: 'Importação', INTEGRATION: 'Integração', FORM: 'Formulários', CRM_SETTING: 'Configuração do CRM', EXTENSION: 'Extensão', EMAIL_INTEGRATION: 'Integração de e-mail', BCC_TO_CRM: 'BCC para o CRM', INTERNAL_PROCESSING: 'Processamento interno', AUTOMATION_PLATFORM: 'Automação da plataforma', API: 'API', MOBILE_IOS: 'App iOS', MOBILE_ANDROID: 'App Android', '(vazio)': 'Sem origem' };
  const errDim = { acuracia: (x) => x.f.acu, consistencia: (x) => !!x.f.con, completude: (x) => x.f.com, unicidade: (x, t) => (t === 'E' ? x.f.dup : x.f.dup_li), integridade: (x, t) => (t === 'E' ? x.f.sem_contato : x.f.sem_empresa) };
  const origens = [];
  for (const [dim, fn] of Object.entries(errDim)) {
    const acc = {};
    E.forEach(x => { if (fn(x, 'E')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    C.forEach(x => { if (fn(x, 'C')) acc[x.origem] = (acc[x.origem] || 0) + 1; });
    const tot = Object.values(acc).reduce((a, b) => a + b, 0);
    Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([o, n], i) => origens.push({ dimensao: dim, rank: i + 1, origem: origemNome[o] || o, erros: n, share: tot ? n / tot : 0 }));
  }
  const volumes = { empresas: E.length, contatos: C.length, leads: LD.length };
  return { summary: { idps: IDP, dimensoes, dhs, saudaveis, origens, volumes, comparativo, elegibilidade, monitor, acoes_duplicidade: acoesDup, contatos_empresa_errada: ctErrada, metodologia: 'DHS 2.0 · 100% dimensões · regra 50/70 da pior dimensão · objetos 45/40/15 em Consistência, Completude e Integridade' }, lists, tabelas: TAB };
}
