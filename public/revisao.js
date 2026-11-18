// Revisão de grupos de duplicidade (UNI-01, UNI-02, UNI-03) direto no painel.
// Botão "Revisar grupo" no cabeçalho de cada grupo → escolhe principal, valores dos campos divergentes e
// marca registros que não são a mesma empresa (com nome novo). A decisão vale a partir da próxima medição
// e a automação do n8n executa os aprovados (faixa "Aprovado na revisão") e as renomeações.
(() => {
  const OPC = {
    segmento: ['Agro', 'Alimentos', 'Benefícios e Pagamentos', 'Comunicação', 'Construção Civil', 'Delivery', 'E-commerce', 'Educação', 'Energia', 'Eventos', 'Finanças', 'Imobiliario', 'Indústria', 'Logística', 'Marketing', 'Mercado de Apostas', 'Mídia', 'Outros', 'Prestação de Serviços', 'Saúde e Fitness', 'Seguros', 'Serviços de RH e Consultoria', 'Serviços Públicos', 'Tecnologia', 'Telefonia', 'Turismo e Lazer', 'Utilidades', 'Varejo', 'Veículos'],
    porte: ['Micro (1 a 9 colaboradores)', 'Pequena (10 a 39 colaboradores)', 'Média (50 a 99 colaboradores)', 'Grande (100 a 999 colaboradores)', 'Enterprise (acima de 1000 colaboradores)'],
    abrangencia: ['Nacional', 'Multinacional'],
    pais: 'Afeganistão|África do Sul|Albânia|Alemanha|Andorra|Angola|Antígua e Barbuda|Arábia Saudita|Argélia|Argentina|Arménia|Aruba|Austrália|Áustria|Azerbaijão|Baamas|Bangladeche|Barbados|Barém|Bélgica|Belize|Benim|Bermudas|Bielorrússia|Birmânia|Bolívia|Bósnia e Herzegovina|Botsuana|Brasil|Brunei|Bulgária|Burquina Faso|Burúndi|Butão|Cabo Verde|Camarões|Camboja|Canadá|Catar|Cazaquistão|Chade|Chile|China|Chipre|Colômbia|Comores|Congo-Brazzaville|Congo-Kinshasa|Coreia do Norte|Coreia do Sul|Costa do Marfim|Costa Rica|Croácia|Cuba|Curacao|Dinamarca|Domínica|Egipto|Emiratos Árabes Unidos|Equador|Eritreia|Eslováquia|Eslovénia|Espanha|Estados Unidos|Estónia|Etiópia|Fiji|Filipinas|Finlândia|França|Gabão|Gâmbia|Gana|Geórgia|Gibraltar|Granada|Grécia|Gronelândia|Guatemala|Guiana|Guiné|Guiné Equatorial|Guiné-Bissau|Haiti|Honduras|Hong Kong|Hungria|Iémen|Índia|Indonésia|Inglaterra|Irão|Iraque|Irlanda|Islândia|Israel|Itália|Jamaica|Japão|Jordânia|Kosovo|Kuwait|Laos|Lesoto|Letónia|Líbano|Libéria|Líbia|Listenstaine|Lituânia|Luxemburgo|Macau|Macedónia|Madagáscar|Malásia|Malávi|Maldivas|Mali|Malta|Marrocos|Maurícia|Mauritânia|México|Moçambique|Moldávia|Mónaco|Mongólia|Montenegro|Mundo|Namíbia|Nepal|Nicarágua|Níger|Nigéria|Noruega|Nova Zelândia|Omã|Países Baixos|Panamá|Papua-Nova Guiné|Paquistão|Paraguai|Peru|Polónia|Porto Rico|Portugal|Quénia|Reino Unido|República Dominicana|Roménia|Ruanda|Rússia|Salvador|Senegal|Sérvia|Singapura|Síria|Suécia|Suíça|Suriname|Tailândia|Taiwan|Tanzânia|Togo|Trindade e Tobago|Tunísia|Turquia|Ucrânia|Uganda|União Europeia|Uruguai|Venezuela|Vietname|Zâmbia|Zimbabué'.split('|')
  };
  const CAMPOS = [['segmento', 'Segmento'], ['porte', 'Porte'], ['funcionarios', 'Nº funcionários'], ['pais', 'País'], ['abrangencia', 'Abrangência'], ['cnpj', 'CNPJ'], ['linkedin', 'LinkedIn'], ['website', 'Site'], ['telefone', 'Telefone']];
  const ROT = Object.fromEntries(CAMPOS);
  const norm = (k, v) => { const t = String(v ?? '').trim().toLowerCase(); if (!t) return ''; if (k === 'telefone' || k === 'cnpj') return t.replace(/\D/g, ''); if (k === 'website' || k === 'linkedin') return t.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''); return t.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  const nint = (v) => Number(v || 0).toLocaleString('pt-BR');
  const dt = (s) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const el = (tag, at = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(at)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); } kids.flat().forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; };

  const css = document.createElement('style');
  css.textContent = `.dhs .rv-btn{margin-left:10px;padding:2px 10px;font-size:.72rem;border-radius:8px}
  .dhs .rv-btn.pend{border-color:var(--warn);color:var(--warn)}
  .dhs .rv-btn.ok{border-color:var(--mint);color:var(--mint)}
  .dhs .rv-fundo{position:fixed;inset:0;background:rgba(5,8,20,.6);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow:auto}
  .dhs .rv{background:var(--bg);border:1px solid var(--accent);border-radius:14px;max-width:1180px;width:100%;padding:18px 20px;box-shadow:var(--shadow)}
  .dhs .rv h3{font-size:1rem;margin:0}
  .dhs .rv .topo{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .dhs .rv .topo h3{margin-right:auto}
  .dhs .rv .sub{font-size:.8rem;color:var(--text-muted);margin:0 0 12px}
  .dhs .rv h4{font-size:.86rem;margin:16px 0 8px}
  .dhs .rv .tw{overflow:auto;border:1px solid var(--border);border-radius:10px;background:var(--card)}
  .dhs .rv table{width:100%;border-collapse:collapse;font-size:.8rem}
  .dhs .rv th{text-align:left;color:var(--text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;padding:8px;border-bottom:1px solid var(--border);white-space:nowrap}
  .dhs .rv td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
  .dhs .rv tr.fora td{opacity:.55}
  .dhs .rv tr.fora td.keep{opacity:1}
  .dhs .rv .mut{color:var(--text-muted);font-size:.74rem;margin-top:3px}
  .dhs .rv .div{color:var(--warn);font-size:.74rem;margin-top:3px}
  .dhs .rv select,.dhs .rv input[type=text],.dhs .rv input[type=password]{font:inherit;font-size:.8rem;padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);max-width:100%}
  .dhs .rv input.nn{margin-top:6px;width:100%;min-width:200px}
  .dhs .rv .pe{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
  .dhs .rv .pe .msg{font-size:.8rem;margin-left:auto}
  .dhs .rv .estado{border-radius:10px;padding:8px 12px;font-size:.8rem;margin:0 0 12px;background:var(--mint-soft);color:var(--mint-ink)}
  .dhs .rv .estado.pend{background:var(--warn-soft);color:var(--warn-ink)}
  .dhs .rv .res{font-size:.8rem;color:var(--text-muted);margin-top:10px}
  .dhs .rv .tag{display:inline-block;border-radius:6px;padding:1px 6px;font-size:.7rem;font-weight:700;background:var(--slate-soft);color:var(--text-muted);margin-left:4px}
  .dhs .rv .tag.p{background:var(--accent-soft);color:var(--accent)}`;
  document.head.appendChild(css);

  let DEC = null; // decisões gravadas (para marcar os botões)
  const carregarDec = async () => { try { const r = await fetch('/api/revisao'); DEC = r.ok ? (await r.json()).decisoes : {}; } catch (e) { DEC = {}; } };

  const sugerirNome = (r, p) => {
    const tld = (String(r.dominio).match(/\.([a-z]{2})$/i) || [])[1];
    const pais = r.pais && (!p || norm('pais', r.pais) !== norm('pais', p.pais)) ? r.pais : (tld && tld !== 'br' && !(p && /\.br$/i.test(p.dominio)) ? tld.toUpperCase() : '');
    return `${r.nome} ${pais || 'Filial'}`; // o HubSpot não aceita parênteses no nome
  };

  const abrir = async (idp, grupo) => {
    const raiz = document.querySelector('.dhs') || document.body;
    const fundo = el('div', { class: 'rv-fundo' }); const box = el('div', { class: 'rv', role: 'dialog', 'aria-label': 'Revisar grupo' }, el('p', { class: 'sub', text: 'Carregando o grupo…' }));
    fundo.appendChild(box); raiz.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    const r = await fetch(`/api/revisao?idp=${encodeURIComponent(idp)}&grupo=${encodeURIComponent(grupo)}`);
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) { box.innerHTML = ''; box.append(el('p', { class: 'sub', text: (d && d.erro) || 'Não foi possível carregar o grupo.' }), el('button', { class: 'btn', text: 'Fechar', onclick: fechar })); return; }
    desenhar(box, d, fechar, idp, grupo);
  };

  const desenhar = (box, d, fechar, idp, grupo) => {
    box.innerHTML = '';
    const so02 = idp === 'UNI-02';
    const regs = d.registros, dec = d.decisao, sep = new Map(d.separadas.map(s => [s.id, s]));
    const st = {
      principal: (dec && regs.some(r => r.id === String(dec.principal_id)) ? String(dec.principal_id) : (regs.find(r => r.principal) || regs[0]).id),
      fora: new Map(regs.filter(r => sep.has(r.id)).map(r => [r.id, sep.get(r.id).novo_nome])),
      valores: { ...((dec && dec.valores) || {}) },
      tocados: new Set(Object.keys((dec && dec.valores) || {})) // campos que a pessoa escolheu; os outros seguem o principal
    };
    // trocou o principal ou tirou alguém do grupo: os campos não escolhidos voltam ao valor do principal novo
    const reiniciar = () => { Object.keys(st.valores).forEach(k => { if (!st.tocados.has(k)) delete st.valores[k]; }); };
    const P = () => regs.find(r => r.id === st.principal);

    box.append(el('div', { class: 'topo' }, el('h3', { text: `Revisar grupo · ${grupo}` }), el('button', { class: 'btn', text: 'Fechar ×', onclick: fechar })));
    box.append(el('p', { class: 'sub', text: `${idp} · ${regs.length} registros${so02 ? '' : ' da mesma empresa real (UNI-01 e UNI-03 juntos)'} · medição de ${dt(d.medicao)}` }));
    if (dec) {
      const aplicado = d.medicao && dec.em < d.medicao;
      box.append(el('div', { class: 'estado' + (aplicado ? '' : ' pend'), text: `Aprovado por ${dec.por} em ${dt(dec.em)} · ${aplicado ? 'já aplicado na medição: os registros estão na faixa "Aprovado na revisão" e a automação executa no próximo ciclo' : 'vale a partir da próxima medição do DHS'}` }));
    } else if (d.separadas.length) box.append(el('div', { class: 'estado pend', text: `${d.separadas.length} registro(s) marcado(s) como outra empresa · renomeação feita pela automação` }));
    if (so02) box.append(el('p', { class: 'sub', text: 'No UNI-02 (domínio raiz) a revisão só separa empresas diferentes: o registro sai da duplicidade e a automação ajusta o nome com país ou filial. Se for a mesma empresa, corrija o domínio no HubSpot para que ela caia no UNI-01.' }));

    // ---- registros ----
    box.append(el('h4', { text: '1. Registros' }));
    const tb = el('tbody');
    box.append(el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, ...(so02 ? [] : [el('th', { text: 'Principal' })]), el('th', { text: 'É a mesma empresa?' }), el('th', { text: 'Registro' }), el('th', { text: 'Vínculos' }), el('th', { text: 'Hoje' }))), tb)));
    const linhas = () => {
      tb.innerHTML = '';
      regs.forEach(r => {
        const fora = st.fora.has(r.id);
        const sel = el('select', { 'aria-label': 'É a mesma empresa?', onchange: (ev) => { if (ev.target.value === 'nao') { if (r.id === st.principal) { const o = regs.find(x => x.id !== r.id && !st.fora.has(x.id)); if (o) st.principal = o.id; } st.fora.set(r.id, sugerirNome(r, P())); } else st.fora.delete(r.id); reiniciar(); linhas(); campos(); resumo(); } },
          el('option', { value: 'sim', text: so02 ? 'Revisar depois' : 'Sim, mesma empresa', selected: !fora }), el('option', { value: 'nao', text: 'Não · renomear', selected: fora }));
        const cel = el('td', { class: 'keep' }, sel);
        if (fora) { const inp = el('input', { type: 'text', class: 'nn', value: st.fora.get(r.id), 'aria-label': 'Nome novo', oninput: (ev) => { st.fora.set(r.id, ev.target.value); } }); cel.append(inp, el('div', { class: 'mut', text: 'Nome novo no HubSpot, com país ou filial (só letras, números e espaço)' })); }
        const rad = so02 ? null : el('td', { class: 'keep' }, el('input', { type: 'radio', name: 'rv-principal', 'aria-label': 'Principal', checked: r.id === st.principal, disabled: fora, onchange: () => { st.principal = r.id; reiniciar(); linhas(); campos(); resumo(); } }));
        const nome = el('td', {}, el('a', { href: r.link, target: '_blank', rel: 'noopener', text: r.nome || '(sem nome)' }), r.id === st.principal && !so02 ? el('span', { class: 'tag p', text: 'principal' }) : null, r.em_uso ? el('span', { class: 'tag', text: 'em uso' }) : null,
          el('div', { class: 'mut', text: `${r.dominio || 'sem domínio'} · ID ${r.id}${r.pais ? ' · ' + r.pais : ''}${r.segmento ? ' · ' + r.segmento : ''}` }), r.contatos_emails ? el('div', { class: 'mut', text: r.contatos_emails }) : null);
        const vinc = el('td', { text: [r.lifecycle === 'customer' ? 'cliente' : '', r.n_negocios ? `${nint(r.n_negocios)} negócios` : '', r.n_contatos ? `${nint(r.n_contatos)} contatos` : '', r.n_leads ? `${nint(r.n_leads)} leads` : ''].filter(Boolean).join(' · ') || 'sem vínculos' });
        const hoje = el('td', {}, el('b', { text: r.acao || '' }), el('span', { class: 'tag', text: r.faixa || '' }), r.divergencias ? el('div', { class: 'div', text: r.divergencias }) : null, !r.divergencias && r.motivo ? el('div', { class: 'mut', text: r.motivo }) : null);
        tb.appendChild(el('tr', { class: fora ? 'fora' : '' }, rad, cel, nome, vinc, hoje));
      });
    };

    // ---- campos divergentes ----
    const camposBox = el('div');
    if (!so02) box.append(el('h4', { text: '2. Valor certo de cada campo divergente' }), camposBox);
    const campos = () => {
      camposBox.innerHTML = '';
      const dentro = regs.filter(r => !st.fora.has(r.id)), p = P();
      const citados = new Set(); dentro.forEach(r => CAMPOS.forEach(([k, rot]) => { if (String(r.divergencias).includes(rot + ':')) citados.add(k); }));
      const lista = CAMPOS.filter(([k]) => citados.has(k) || st.valores[k] || new Set(dentro.map(r => norm(k, r[k])).filter(Boolean)).size > 1);
      if (!lista.length) { camposBox.append(el('p', { class: 'sub', text: 'Nenhum campo divergente entre os registros que ficam. Ao aprovar, o principal recebe o que estiver faltando, como já acontece na automação.' })); return; }
      const tbc = el('tbody');
      lista.forEach(([k, rot]) => {
        const vistos = new Map(); dentro.forEach(r => { const n = norm(k, r[k]); if (n && !vistos.has(n)) vistos.set(n, { v: r[k], de: [] }); if (n) vistos.get(n).de.push(r.id === p.id ? 'principal' : `ID ${r.id}`); });
        const atual = st.valores[k] != null ? st.valores[k] : (p[k] || '');
        const s = el('select', { 'aria-label': rot, onchange: (ev) => { st.valores[k] = ev.target.value; st.tocados.add(k); resumo(); } });
        const vals = [...vistos.values()].map(x => x.v);
        vistos.forEach(x => s.appendChild(el('option', { value: x.v, text: `${x.v} · ${x.de.join(', ')}`, selected: norm(k, x.v) === norm(k, atual) })));
        if (OPC[k]) { const og = el('optgroup', { label: 'Outro valor' }); OPC[k].filter(o => !vals.some(v => norm(k, v) === norm(k, o))).forEach(o => og.appendChild(el('option', { value: o, text: o, selected: norm(k, o) === norm(k, atual) }))); s.appendChild(og); }
        if (st.valores[k] == null) st.valores[k] = atual || vals[0] || '';
        const breeze = k === 'segmento' ? (p.industria_breeze || (dentro.find(r => r.industria_breeze) || {}).industria_breeze) : '';
        tbc.appendChild(el('tr', {}, el('td', {}, el('b', { text: rot }), breeze ? el('div', { class: 'mut', text: `Indústria no Breeze: ${breeze}` }) : null, citados.has(k) ? el('div', { class: 'div', text: 'gerou Revisar' }) : null), el('td', {}, s), el('td', { class: 'mut', text: `Principal hoje: ${p[k] || 'vazio'}` })));
      });
      camposBox.append(el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Campo' }), el('th', { text: 'Valor que fica no principal' }), el('th', { text: '' }))), tbc)));
    };

    // ---- assinatura e ações ----
    const res = el('p', { class: 'res' });
    const resumo = () => {
      const dentro = regs.filter(r => !st.fora.has(r.id)), p = P();
      const muda = so02 ? [] : Object.entries(st.valores).filter(([k, v]) => v && norm(k, v) !== norm(k, p[k])).map(([k, v]) => `${ROT[k]} → ${v}`);
      res.textContent = so02 ? `${st.fora.size} registro(s) serão renomeados e sairão da duplicidade.`
        : `Ao aprovar: ${p.nome} (ID ${p.id}) fica como principal; ${dentro.length - 1} registro(s) voltam para mesclar ou excluir na faixa "Aprovado na revisão"${muda.length ? `; o principal recebe ${muda.join(', ')} antes da mescla/exclusão` : ''}${st.fora.size ? `; ${st.fora.size} sai(em) da duplicidade e será(ão) renomeado(s)` : ''}. A automação roda nos horários agendados ou pelo formulário.`;
    };
    const nomeIn = el('input', { type: 'text', placeholder: 'Seu nome', value: ls.get('dhs-rev-nome'), 'aria-label': 'Quem está revisando' });
    const msg = el('span', { class: 'msg' });
    const enviar = async (metodo, url, corpo) => {
      ls.set('dhs-rev-nome', nomeIn.value.trim());
      msg.textContent = 'Gravando…';
      const r = await fetch(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = j.erro || 'Não foi possível gravar.'; return false; }
      await carregarDec(); marcarBotoes();
      return true;
    };
    const aprovar = async () => {
      if (!nomeIn.value.trim()) { msg.textContent = 'Informe seu nome.'; return; }
      if ([...st.fora.values()].some(v => !String(v).trim())) { msg.textContent = 'Preencha o nome novo de quem não é a mesma empresa.'; return; }
      const dentro = regs.filter(r => !st.fora.has(r.id)).map(r => r.id);
      const valores = {}; if (!so02) Object.entries(st.valores).forEach(([k, v]) => { if (v) valores[k] = v; });
      // troca de um valor que o principal já tem: pede confirmação (evita escolha sem querer na lista)
      const p0 = P(), sobrescreve = so02 ? [] : Object.entries(valores).filter(([k, v]) => p0[k] && norm(k, v) !== norm(k, p0[k])).map(([k, v]) => `• ${ROT[k]}: ${p0[k]} → ${v}`);
      if (sobrescreve.length && !window.confirm(`O principal ${p0.nome} vai ter estes campos trocados:\n\n${sobrescreve.join('\n')}\n\nConfirma?`)) { msg.textContent = 'Aprovação cancelada.'; return; }
      const ok = await enviar('POST', '/api/revisao', { por: nomeIn.value.trim(), idp, grupo, principal_id: so02 ? '' : st.principal, registros: so02 ? [] : dentro, valores, separar: regs.filter(r => st.fora.has(r.id)).map(r => ({ id: r.id, nome_atual: r.nome, novo_nome: st.fora.get(r.id) })) });
      if (ok) { const r = await fetch(`/api/revisao?idp=${encodeURIComponent(idp)}&grupo=${encodeURIComponent(grupo)}`); const d2 = await r.json(); desenhar(box, d2, fechar, idp, grupo); }
    };
    const desfazer = async () => {
      const chaves = [dec && dec.chave, ...d.separadas.map(s => s.chave)].filter(Boolean);
      for (const k of chaves) if (!(await enviar('DELETE', `/api/revisao?id=${encodeURIComponent(k)}&por=${encodeURIComponent(nomeIn.value.trim())}`))) return;
      const r = await fetch(`/api/revisao?idp=${encodeURIComponent(idp)}&grupo=${encodeURIComponent(grupo)}`); desenhar(box, await r.json(), fechar, idp, grupo);
    };
    const medir = async () => { msg.textContent = 'Iniciando medição…'; const r = await fetch('/api/run', { method: 'POST' }); const j = await r.json().catch(() => ({})); msg.textContent = j.msg || (r.ok ? 'Medição iniciada (leva alguns minutos).' : 'Não foi possível iniciar.'); };
    box.append(res, el('div', { class: 'pe' }, nomeIn,
      el('button', { class: 'btn primary', text: so02 ? 'Gravar' : (dec ? 'Atualizar aprovação' : 'Aprovar grupo'), onclick: aprovar }),
      dec || d.separadas.length ? el('button', { class: 'btn', text: 'Desfazer revisão', onclick: desfazer }) : null,
      dec || d.separadas.length ? el('button', { class: 'btn', text: 'Aplicar agora (nova medição)', onclick: medir }) : null, msg));
    linhas(); campos(); resumo();
  };

  // ---- botões nos cabeçalhos de grupo ----
  const idsDecididos = () => { const s = new Set(); Object.values(DEC || {}).forEach(d => { (d.registros || []).forEach(id => s.add(String(id))); if (d.id) s.add(String(d.id)); }); return s; };
  const marcarBotoes = () => {
    document.querySelectorAll('.dhs .lista').forEach(lista => {
      const idp = (lista.querySelector('.lt') || {}).textContent || ''; const m = idp.match(/^(UNI-0[123])\b/); if (!m) return;
      const heads = [...lista.querySelectorAll('thead th')].map(th => th.textContent);
      const cAcao = heads.indexOf('Ação recomendada'), cId = heads.indexOf('Record ID');
      const dec = idsDecididos();
      lista.querySelectorAll('tr.grp-h').forEach(gh => {
        const grupo = gh.dataset.grupo; if (!grupo) return;
        let tr = gh.nextElementSibling, rev = false, aprov = false;
        while (tr && !tr.classList.contains('grp-h')) { const tds = tr.children; if (cAcao >= 0 && tds[cAcao] && tds[cAcao].textContent === 'Revisar') rev = true; if (cId >= 0 && tds[cId] && dec.has(tds[cId].textContent.trim())) aprov = true; tr = tr.nextElementSibling; }
        let b = gh.querySelector('.rv-btn');
        if (!b) { b = el('button', { class: 'btn rv-btn', onclick: (ev) => { ev.stopPropagation(); abrir(m[1], grupo); } }); gh.firstElementChild.appendChild(b); }
        b.textContent = aprov ? 'Revisado ✓' : rev ? 'Revisar grupo' : 'Ver grupo';
        b.className = 'btn rv-btn' + (aprov ? ' ok' : rev ? ' pend' : '');
      });
    });
  };
  let agendado = false;
  new MutationObserver(() => { if (agendado) return; agendado = true; setTimeout(() => { agendado = false; if (document.querySelector('.dhs .lista tr.grp-h:not(.rv-ok)')) { document.querySelectorAll('.dhs .lista tr.grp-h').forEach(g => g.classList.add('rv-ok')); if (DEC) marcarBotoes(); else carregarDec().then(marcarBotoes); } }, 60); })
    .observe(document.body, { childList: true, subtree: true });
})();
