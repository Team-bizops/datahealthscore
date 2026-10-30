// Seção "Mapa de campos" do Data Health Score
(() => {
  const nint = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR');
  const pct = (a, b) => b ? (100 * a / b).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '—';
  const HEAD = {record_id: 'Record ID', nome: 'Nome', email: 'E-mail', tipo: 'Tipo', propriedade_oficial: 'Propriedade oficial', propriedade_com_valor: 'Propriedade com o valor', valor_encontrado: 'Valor encontrado', link_hubspot: 'HubSpot'};
  const css = document.createElement('style');
  css.textContent = `.dhs .mbar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--slate-soft);min-width:140px}
  .dhs .mbar span{display:block;height:100%}
  .dhs .mlink{background:none;border:none;padding:0;font:inherit;font-weight:800;color:var(--accent);cursor:pointer;text-decoration:underline dotted}
  .dhs .mlink:disabled{color:var(--text-soft);text-decoration:none;cursor:default}
  .dhs .mgrp td{background:var(--slate-soft);font-weight:800;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted)}
  .dhs .mleg{display:flex;gap:14px;flex-wrap:wrap;font-size:.76rem;color:var(--text-muted);margin:4px 0 12px}
  .dhs .mleg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}`;
  document.head.appendChild(css);
  const C_OK = 'var(--mint)', C_ALT = 'var(--warn)', C_VZ = 'var(--danger)';

  const sec = document.createElement('section'); sec.className = 'section'; sec.id = 'mapa';
  sec.innerHTML = `<div class="card">
    <div class="card-head"><h3>Mapa de campos</h3><span class="grow"><span class="info-ic" tabindex="0">i<span class="tip right"><b>Mapa de campos</b><p><span class="k">Preenchido: </span>a informação está na propriedade oficial.</p><p><span class="k">Na alternativa: </span>a oficial está vazia, mas o dado existe em outra propriedade. Corrigir é copiar o valor.</p><p><span class="k">Vazio em tudo: </span>não há a informação em nenhuma propriedade. É preciso enriquecer.</p><p><span class="k">Lista: </span>clique no número para ver os registros e baixar o CSV com o Record ID para importar no HubSpot.</p></span></span></span></div>
    <p class="card-sub">Preenchimento de cada informação de Empresas, Contatos e Leads, e onde o dado está quando a propriedade oficial está vazia.</p>
    <div class="mleg"><span><i style="background:${C_OK}"></i>Preenchido na oficial</span><span><i style="background:${C_ALT}"></i>Só em outra propriedade</span><span><i style="background:${C_VZ}"></i>Vazio em tudo</span></div>
    <div class="tw"><table class="dtable"><thead><tr><th>Informação</th><th>Propriedade oficial</th><th>Outras propriedades</th><th>Distribuição</th>
      <th class="num">Preenchido</th><th class="num">Na alternativa</th><th class="num">Vazio em tudo</th></tr></thead><tbody></tbody></table></div>
    <div class="mslot"></div></div>`;
  const anchor = document.getElementById('dimensoes');
  (anchor ? anchor : document.querySelector('.dhs .wrap')).insertAdjacentElement(anchor ? 'afterend' : 'beforeend', sec);

  let panel = null, cur = null;
  const abrir = async (id, titulo) => {
    if (!panel) {
      panel = document.getElementById('tpl-lista').content.firstElementChild.cloneNode(true);
      panel.querySelector('.sit').style.display = 'none'; panel.querySelector('.esc').style.display = 'none';
      panel.querySelector('.close').addEventListener('click', () => { panel.remove(); });
      panel.querySelector('.search').addEventListener('input', () => desenhar());
      panel.querySelector('.dl').addEventListener('click', baixar);
    }
    sec.querySelector('.mslot').appendChild(panel);
    panel.querySelector('.lt').textContent = titulo; panel.querySelector('.search').value = '';
    panel.querySelector('.meta').textContent = 'Carregando registros…'; panel.querySelector('tbody').innerHTML = ''; panel.querySelector('thead tr').innerHTML = '';
    const r = await fetch(`/api/lista?idp=${encodeURIComponent(id)}&situacao=erro&escopo=total`); const j = r.ok ? await r.json() : null;
    if (!j) { panel.querySelector('.meta').textContent = 'Não foi possível carregar a lista.'; return; }
    cur = {id, rows: j.rows, total: j.total}; desenhar(); panel.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  };
  const filtradas = () => { const q = panel.querySelector('.search').value.toLowerCase(); return !q ? cur.rows : cur.rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))); };
  const desenhar = () => {
    if (!cur) return;
    const rows = filtradas(), cols = cur.rows[0] ? Object.keys(cur.rows[0]) : [];
    const head = panel.querySelector('thead tr'), body = panel.querySelector('tbody'); head.innerHTML = ''; body.innerHTML = '';
    cols.forEach(c => { const th = document.createElement('th'); th.textContent = HEAD[c] || c; head.appendChild(th); });
    rows.slice(0, 500).forEach(rw => { const tr = document.createElement('tr'); cols.forEach(c => { const td = document.createElement('td');
      if (c === 'link_hubspot') { const a = document.createElement('a'); a.href = rw[c]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Abrir'; td.appendChild(a); } else td.textContent = rw[c] ?? '';
      tr.appendChild(td); }); body.appendChild(tr); });
    panel.querySelector('.meta').textContent = `${nint(rows.length)} registro(s)${cur.total > cur.rows.length ? ` · mostrando ${nint(cur.rows.length)} de ${nint(cur.total)}` : ''}${rows.length > 500 ? ' · a tela mostra os 500 primeiros, o CSV leva todos' : ''}`;
  };
  const baixar = () => {
    const rows = filtradas(); if (!rows.length) return; const cols = Object.keys(rows[0]);
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\ufeff' + [cols.map(c => esc(HEAD[c] || c)).join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = `${cur.id}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };

  const render = (mapa) => {
    const tb = sec.querySelector('tbody'); tb.innerHTML = '';
    if (!mapa || !mapa.length) { tb.innerHTML = '<tr><td colspan="7">O mapa aparece depois da próxima medição.</td></tr>'; return; }
    let grupo = null;
    mapa.forEach(m => {
      if (m.objeto !== grupo) { grupo = m.objeto; const g = document.createElement('tr'); g.className = 'mgrp'; const td = document.createElement('td'); td.colSpan = 7; td.textContent = `${grupo} · ${nint(m.total)} registros`; g.appendChild(td); tb.appendChild(g); }
      const tr = document.createElement('tr');
      const cell = (t, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; if (t instanceof Node) td.appendChild(t); else td.textContent = t; tr.appendChild(td); return td; };
      const ci = cell(m.informacao); if (m.nota) { const sm = document.createElement('div'); sm.className = 'como'; sm.style.fontSize = '.72rem'; sm.textContent = m.nota; ci.appendChild(sm); } cell(m.oficial, 'como'); cell(m.alternativas.length ? m.alternativas.join(', ') : '—', 'como');
      if (m.tipo === 'categorias') {
        const cor = {ok: C_OK, alt: C_ALT, vazio: C_VZ};
        const bar2 = document.createElement('div'); bar2.className = 'mbar';
        m.categorias.forEach(c => { const sp = document.createElement('span'); sp.style.width = (m.total ? 100 * c.n / m.total : 0) + '%'; sp.style.background = cor[c.cor]; sp.title = `${c.rotulo}: ${nint(c.n)}`; bar2.appendChild(sp); });
        cell(bar2);
        m.categorias.forEach(c => { const b = document.createElement('button'); b.className = 'mlink'; b.type = 'button'; b.textContent = `${c.rotulo}: ${nint(c.n)} · ${pct(c.n, m.total)}`; b.disabled = !c.n; b.addEventListener('click', () => abrir(c.lista, `${m.objeto} · E-mail ${c.rotulo.toLowerCase()}`)); cell(b, 'num'); });
        tb.appendChild(tr); return;
      }
      const bar = document.createElement('div'); bar.className = 'mbar';
      [[m.preenchido, C_OK], [m.na_alternativa, C_ALT], [m.vazio_tudo, C_VZ]].forEach(([v, c]) => { const s = document.createElement('span'); s.style.width = (m.total ? 100 * v / m.total : 0) + '%'; s.style.background = c; s.title = `${nint(v)} (${pct(v, m.total)})`; bar.appendChild(s); });
      cell(bar);
      cell(`${nint(m.preenchido)} · ${pct(m.preenchido, m.total)}`, 'num');
      const btn = (v, id, t) => { const b = document.createElement('button'); b.className = 'mlink'; b.type = 'button'; b.textContent = `${nint(v)} · ${pct(v, m.total)}`; b.disabled = !v; b.addEventListener('click', () => abrir(id, t)); return b; };
      cell(m.alternativas.length ? btn(m.na_alternativa, m.id + '.1', `${m.objeto} · ${m.informacao}: valor em outra propriedade`) : '—', 'num');
      cell(btn(m.vazio_tudo, m.id + '.2', `${m.objeto} · ${m.informacao}: vazio em tudo`), 'num');
      tb.appendChild(tr);
    });
  };
  fetch('/api/data').then(r => r.ok ? r.json() : null).then(d => render(d && d.mapa)).catch(() => render(null));
})();
