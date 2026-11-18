// Fila de revisão por padrão (UNI-01, UNI-02, UNI-03): em vez de abrir grupo a grupo, a BizOps confere a
// sugestão do DHS por padrão (ex.: "mesmo nome, .com × .com.br") e aprova vários registros de uma vez.
(() => {
  const nint = (v) => Number(v || 0).toLocaleString('pt-BR');
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const el = (tag, at = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(at)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); } kids.flat().forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return e; };

  const css = document.createElement('style');
  css.textContent = `.dhs .fl-btn{margin-left:10px;padding:4px 12px;font-size:.78rem;border-radius:8px;border-color:var(--accent);color:var(--accent)}
  .dhs .fl-fundo{position:fixed;inset:0;background:rgba(5,8,20,.6);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto}
  .dhs .fl{background:var(--bg);border:1px solid var(--accent);border-radius:14px;max-width:1360px;width:100%;padding:18px 20px;box-shadow:var(--shadow)}
  .dhs .fl .topo{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .dhs .fl .topo h3{font-size:1rem;margin:0 auto 0 0}
  .dhs .fl .sub{font-size:.8rem;color:var(--text-muted);margin:0 0 12px}
  .dhs .fl .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .dhs .fl .chip{border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--card);cursor:pointer;text-align:left;font:inherit;color:var(--text);max-width:330px}
  .dhs .fl .chip b{display:block;font-size:.82rem}
  .dhs .fl .chip span{font-size:.74rem;color:var(--text-muted)}
  .dhs .fl .chip.on{border-color:var(--accent);background:var(--accent-soft)}
  .dhs .fl .barra{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px;font-size:.8rem}
  .dhs .fl .tw{overflow:auto;border:1px solid var(--border);border-radius:10px;background:var(--card);max-height:58vh}
  .dhs .fl table{width:100%;border-collapse:collapse;font-size:.78rem}
  .dhs .fl th{position:sticky;top:0;background:var(--card);text-align:left;color:var(--text-muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.03em;padding:7px 8px;border-bottom:1px solid var(--border);white-space:nowrap;z-index:1}
  .dhs .fl td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}
  .dhs .fl tr.off td{opacity:.5}
  .dhs .fl .mut{color:var(--text-muted);font-size:.72rem;margin-top:2px}
  .dhs .fl .warn{color:var(--warn);font-size:.72rem;margin-top:2px}
  .dhs .fl select,.dhs .fl input[type=text]{font:inherit;font-size:.78rem;padding:4px 7px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);max-width:100%}
  .dhs .fl input.nn{width:100%;min-width:180px}
  .dhs .fl .conf{display:inline-block;border-radius:6px;padding:1px 6px;font-size:.68rem;font-weight:700;margin-left:4px}
  .dhs .fl .conf.Alta{background:var(--mint-soft);color:var(--mint-ink)}
  .dhs .fl .conf.Média{background:var(--warn-soft);color:var(--warn-ink)}
  .dhs .fl .conf.Baixa{background:var(--slate-soft);color:var(--text-muted)}
  .dhs .fl .pe{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
  .dhs .fl .pe .msg{font-size:.8rem;margin-left:auto}
  .dhs .fl .tot{font-size:.8rem}`;
  document.head.appendChild(css);

  const PASSO = 150;
  const vinc = (r) => [String(r.lifecycle || '').toLowerCase() === 'customer' ? 'cliente' : '', +r.n_negocios ? `${nint(r.n_negocios)} neg.` : '', +r.n_contatos ? `${nint(r.n_contatos)} cont.` : '', +r.n_leads ? `${nint(r.n_leads)} leads` : ''].filter(Boolean).join(' · ') || 'sem vínculos';
  const peso = (r) => (String(r.lifecycle || '').toLowerCase() === 'customer' ? 1e6 : 0) + (+r.n_negocios || 0) * 1e3 + (+r.n_contatos || 0) + (+r.n_leads || 0);
  const decPadrao = (s) => (s === 'Mesma empresa' ? 'mesma' : s === 'Empresa diferente' ? 'separar' : 'pular');

  const abrir = async (idp) => {
    const raiz = document.querySelector('.dhs') || document.body;
    const fundo = el('div', { class: 'fl-fundo' }), box = el('div', { class: 'fl', role: 'dialog', 'aria-label': 'Fila de revisão' }, el('p', { class: 'sub', text: 'Montando a fila…' }));
    fundo.appendChild(box); raiz.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    const [lr, dr] = await Promise.all([fetch(`/api/lista?idp=${encodeURIComponent(idp)}`), fetch('/api/revisao')]);
    const lista = await lr.json().catch(() => null), decs = (await dr.json().catch(() => ({}))).decisoes || {};
    if (!lr.ok || !lista) { box.innerHTML = ''; box.append(el('p', { class: 'sub', text: 'Não foi possível carregar a lista.' }), el('button', { class: 'btn', text: 'Fechar', onclick: fechar })); return; }
    const decididos = new Set(); Object.values(decs).forEach(d => { if (d.tipo === 'grupo') (d.registros || []).forEach(id => decididos.add(String(id))); if (d.id) decididos.add(String(d.id)); });
    const porId = new Map(lista.rows.map(r => [String(r.record_id), r]));
    const itens = lista.rows.filter(r => String(r.record_id) !== String(r.principal_id) && (r.acao === 'Revisar' || r.faixa_risco === 'Mescla assistida') && !decididos.has(String(r.record_id)))
      .map(r => ({ r, p: porId.get(String(r.principal_id)), sug: r.sugestao || 'Conferir', conf: r.confianca || 'Baixa', padrao: r.padrao || 'Sem sugestão' }))
      .sort((a, b) => peso(b.r) - peso(a.r));
    // estado de cada item: selecionado, decisão e nome novo
    const st = new Map(itens.map(it => [String(it.r.record_id), { sel: it.conf === 'Alta' && it.sug !== 'Conferir', dec: decPadrao(it.sug), nome: it.r.nome_sugerido || '' }]));
    const padroes = new Map(); itens.forEach(it => { const k = it.padrao; if (!padroes.has(k)) padroes.set(k, { n: 0, sug: it.sug, conf: it.conf }); padroes.get(k).n++; });
    let filtro = [...padroes.entries()].sort((a, b) => b[1].n - a[1].n)[0]?.[0] || null, mostrar = PASSO, busca = '';

    box.innerHTML = '';
    box.append(el('div', { class: 'topo' }, el('h3', { text: `Fila de revisão · ${idp}` }), el('button', { class: 'btn', text: 'Fechar ×', onclick: fechar })));
    box.append(el('p', { class: 'sub', text: `${nint(itens.length)} registros pendentes (Revisar e Mescla assistida), agrupados pelo padrão que o DHS encontrou. A sugestão de cada linha já vem escolhida; os de confiança alta já vêm marcados. Desmarque as exceções e aprove o lote.` }));
    if (!itens.length) { box.append(el('p', { class: 'sub', text: 'Nada pendente nesta lista.' })); return; }
    const chips = el('div', { class: 'chips' });
    const barra = el('div', { class: 'barra' });
    const tb = el('tbody'), tw = el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: '' }), el('th', { text: 'Decisão' }), el('th', { text: 'Fica (principal)' }), el('th', { text: 'Registro em revisão' }), el('th', { text: 'Nome novo (empresa diferente)' }), el('th', { text: 'Por que' }))), tb));
    const mais = el('button', { class: 'btn', text: 'Mostrar mais', onclick: () => { mostrar += PASSO; tabela(); } });
    const tot = el('span', { class: 'tot' }), msg = el('span', { class: 'msg' });
    const nomeIn = el('input', { type: 'text', placeholder: 'Seu nome', value: ls.get('dhs-rev-nome'), 'aria-label': 'Quem está revisando' });
    box.append(chips, barra, tw, el('div', { style: 'margin-top:8px' }, mais), el('div', { class: 'pe' }, nomeIn, el('button', { class: 'btn primary', text: 'Aprovar selecionados', onclick: () => aprovar() }), tot, msg));

    const visiveis = () => itens.filter(it => (!filtro || it.padrao === filtro) && (!busca || `${it.r.nome} ${it.r.dominio} ${it.p ? it.p.nome : it.r.principal_nome}`.toLowerCase().includes(busca)));
    const desenharChips = () => {
      chips.innerHTML = '';
      const sel = (k) => itens.filter(it => it.padrao === k && st.get(String(it.r.record_id)).sel).length;
      [...padroes.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => chips.appendChild(el('button', { class: 'chip' + (k === filtro ? ' on' : ''), onclick: () => { filtro = k; mostrar = PASSO; desenharChips(); tabela(); } },
        el('b', { text: k }), el('span', { text: `${nint(v.n)} registros · sugere ${v.sug.toLowerCase()} · ${nint(sel(k))} marcados` }))));
      chips.appendChild(el('button', { class: 'chip' + (!filtro ? ' on' : ''), onclick: () => { filtro = null; mostrar = PASSO; desenharChips(); tabela(); } }, el('b', { text: 'Todos' }), el('span', { text: `${nint(itens.length)} registros` })));
    };
    const marcar = (v) => { visiveis().forEach(it => { const s = st.get(String(it.r.record_id)); s.sel = v && s.dec !== 'pular'; }); desenharChips(); tabela(); };
    const buscaIn = el('input', { type: 'text', placeholder: 'Buscar empresa ou domínio', 'aria-label': 'Buscar', oninput: (ev) => { busca = ev.target.value.trim().toLowerCase(); mostrar = PASSO; tabela(); } });
    barra.append(el('button', { class: 'btn', text: 'Marcar todos deste padrão', onclick: () => marcar(true) }), el('button', { class: 'btn', text: 'Desmarcar todos', onclick: () => marcar(false) }), buscaIn);

    const linha = (it) => {
      const id = String(it.r.record_id), s = st.get(id), r = it.r, p = it.p;
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Selecionar', checked: s.sel, onchange: (ev) => { s.sel = ev.target.checked && s.dec !== 'pular'; if (ev.target.checked && s.dec === 'pular') { s.dec = decPadrao(it.sug === 'Conferir' ? 'Mesma empresa' : it.sug); s.sel = true; } desenharChips(); tabela(); } });
      const sel = el('select', { 'aria-label': 'Decisão', onchange: (ev) => { s.dec = ev.target.value; s.sel = s.dec !== 'pular'; desenharChips(); tabela(); } },
        el('option', { value: 'mesma', text: 'Mesma empresa', selected: s.dec === 'mesma' }), el('option', { value: 'separar', text: 'Empresa diferente', selected: s.dec === 'separar' }), el('option', { value: 'pular', text: 'Pular por enquanto', selected: s.dec === 'pular' }));
      const nome = s.dec === 'separar' ? el('td', {}, el('input', { type: 'text', class: 'nn', value: s.nome, placeholder: 'vazio = só separar', 'aria-label': 'Nome novo', oninput: (ev) => { s.nome = ev.target.value; } }), el('div', { class: 'mut', text: s.nome ? 'Renomeia no HubSpot' : 'Nome já diferente: só sai da duplicidade' })) : el('td', { class: 'mut', text: s.dec === 'mesma' ? (r.acao === 'Revisar' ? 'Vai mesclar ou excluir; nas divergências fica o valor do principal' : 'Vai mesclar no principal') : '' });
      const pri = p ? el('td', {}, el('a', { href: p.link_hubspot, target: '_blank', rel: 'noopener', text: p.nome || '(sem nome)' }), el('div', { class: 'mut', text: `${p.dominio || 'sem domínio'}${p.pais ? ' · ' + p.pais : ''} · ${vinc(p)}` })) : el('td', {}, el('b', { text: r.principal_nome || '' }), el('div', { class: 'mut', text: `ID ${r.principal_id}` }));
      const este = el('td', {}, el('a', { href: r.link_hubspot, target: '_blank', rel: 'noopener', text: r.nome || '(sem nome)' }), el('div', { class: 'mut', text: `${r.dominio || 'sem domínio'}${r.pais ? ' · ' + r.pais : ''} · ${vinc(r)}` }), r.contatos_emails ? el('div', { class: 'mut', text: r.contatos_emails }) : null);
      const pq = el('td', {}, el('span', { text: it.sug }), el('span', { class: 'conf ' + it.conf, text: it.conf }), r.divergencias ? el('div', { class: 'warn', text: r.divergencias }) : el('div', { class: 'mut', text: r.motivo || '' }));
      return el('tr', { class: s.sel ? '' : 'off' }, el('td', {}, cb), el('td', {}, sel), pri, este, nome, pq);
    };
    const tabela = () => {
      const vis = visiveis(); tb.innerHTML = '';
      vis.slice(0, mostrar).forEach(it => tb.appendChild(linha(it)));
      mais.style.display = vis.length > mostrar ? '' : 'none'; mais.textContent = `Mostrar mais (${nint(vis.length - mostrar)} restantes)`;
      const sels = itens.filter(it => st.get(String(it.r.record_id)).sel), m = sels.filter(it => st.get(String(it.r.record_id)).dec === 'mesma').length;
      tot.textContent = `${nint(sels.length)} selecionados: ${nint(m)} mesma empresa · ${nint(sels.length - m)} empresa diferente`;
    };
    const aprovar = async () => {
      const por = nomeIn.value.trim(); if (!por) { msg.textContent = 'Informe seu nome.'; return; }
      ls.set('dhs-rev-nome', por);
      const sels = itens.filter(it => st.get(String(it.r.record_id)).sel);
      if (!sels.length) { msg.textContent = 'Nada selecionado.'; return; }
      const corpo = { lote: true, por, padrao: filtro || 'Todos', itens: sels.map(it => { const s = st.get(String(it.r.record_id)); return s.dec === 'mesma' ? { tipo: 'mesma', id: String(it.r.record_id), principal_id: String(it.r.principal_id), grupo: it.r.grupo_duplicidade, idp } : { tipo: 'separar', id: String(it.r.record_id), novo_nome: s.nome.trim(), nome_atual: it.r.nome, grupo: it.r.grupo_duplicidade }; }) };
      msg.textContent = 'Gravando…';
      const r = await fetch('/api/revisao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = j.erro || 'Não foi possível gravar.'; return; }
      // tira da fila o que foi gravado
      const feitos = new Set(sels.map(it => String(it.r.record_id)));
      for (let i = itens.length - 1; i >= 0; i--) if (feitos.has(String(itens[i].r.record_id))) { const k = itens[i].padrao; itens.splice(i, 1); const v = padroes.get(k); v.n--; if (!v.n) { padroes.delete(k); if (filtro === k) filtro = null; } }
      msg.textContent = `Gravado: ${nint(j.mesma_empresa)} mesma empresa, ${nint(j.empresa_diferente)} empresa diferente. Entra na próxima medição do DHS.`;
      desenharChips(); tabela();
    };
    desenharChips(); tabela();
  };

  // botão "Revisar em lote" no topo das listas de duplicidade de empresas
  const marcar = () => document.querySelectorAll('.dhs .lista').forEach(lista => {
    const lt = lista.querySelector('.lt'); if (!lt) return; const m = (lt.textContent || '').match(/^(UNI-0[123])\b/);
    const b = lista.querySelector('.fl-btn');
    if (!m) { if (b) b.remove(); return; }
    if (b && b.dataset.idp === m[1]) return; if (b) b.remove();
    const nb = el('button', { class: 'btn fl-btn', 'data-idp': m[1], text: 'Revisar em lote', onclick: (ev) => { ev.stopPropagation(); abrir(m[1]); } });
    lt.insertAdjacentElement('afterend', nb);
  });
  let ag = false;
  new MutationObserver(() => { if (ag) return; ag = true; setTimeout(() => { ag = false; marcar(); }, 80); }).observe(document.body, { childList: true, subtree: true });
})();
