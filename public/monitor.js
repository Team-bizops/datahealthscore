// Monitoramento (fora da nota): empresas sem atividade há mais de 2 anos, com filtro por porte e segmento
(() => {
  const nint = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR');
  const pct = (a, b) => b ? (100 * a / b).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '—';
  const HEAD = {record_id: 'Record ID', nome: 'Nome', dominio: 'Domínio', porte: 'Porte', segmento: 'Segmento', ultima_atividade: 'Última atividade', em_uso: 'Em uso', link_hubspot: 'HubSpot'};
  const COLS = ['record_id', 'nome', 'dominio', 'porte', 'segmento', 'ultima_atividade', 'em_uso', 'link_hubspot'];

  const css = document.createElement('style');
  css.textContent = `.dhs .mon-tag{font-size:.72rem;font-weight:800;padding:3px 10px;border-radius:999px;background:var(--slate-soft);color:var(--text-muted);border:1px dashed var(--border);margin-left:8px}
  .dhs .mon-aviso{font-size:.82rem;color:var(--text-muted);background:var(--slate-soft);border-radius:10px;padding:8px 12px;margin:6px 0 12px}
  .dhs .mon-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .dhs .mon-filtros select{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:inherit;font-size:.84rem}
  .dhs .mon-kpis{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px}
  .dhs .mon-kpis b{display:block;font-size:1.4rem}
  .dhs .mon-kpis span{font-size:.76rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.03em}
  .dhs .mon-bars{display:flex;flex-direction:column;gap:6px}
  .dhs .mon-row{display:grid;grid-template-columns:minmax(120px,26%) 1fr 150px;gap:10px;align-items:center;font-size:.82rem}
  .dhs .mon-track{height:12px;border-radius:999px;background:var(--slate-soft);overflow:hidden}
  .dhs .mon-fill{height:100%;background:var(--slate);border-radius:999px}
  .dhs .mon-row .n{text-align:right;color:var(--text-muted)}
  .dhs .mon-btn{background:none;border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;font-size:.82rem;cursor:pointer}`;
  document.head.appendChild(css);

  const sec = document.createElement('section'); sec.className = 'section'; sec.id = 'monitor-inatividade';
  sec.innerHTML = `<div class="card">
    <div class="card-head"><h3>Empresas sem atividade há mais de 2 anos</h3><span class="mon-tag">Monitoramento · fora da nota</span></div>
    <p class="mon-aviso"><b>Não entra no DHS.</b> Conta empresas sem nenhuma atividade registrada no HubSpot (data da última atividade) há mais de 24 meses, ou que nunca tiveram atividade. Não é erro de dado, por isso não está em nenhuma dimensão (seria uma dimensão de "atualidade"). Serve para consulta e para priorizar limpeza ou arquivamento.</p>
    <div class="mon-filtros"><label>Porte <select class="f-porte"></select></label><label>Segmento <select class="f-seg"></select></label><button type="button" class="mon-btn ver">Ver empresas</button></div>
    <div class="mon-kpis"><div><span>Empresas no filtro</span><b class="k-tot">—</b></div><div><span>Sem atividade há +2 anos</span><b class="k-ina">—</b></div><div><span>% sem atividade</span><b class="k-pct">—</b></div></div>
    <p class="card-sub t-graf"></p>
    <div class="mon-bars"></div>
    <div class="mslot"></div></div>`;
  const anchor = document.getElementById('dimensoes');
  (anchor ? anchor : document.querySelector('.dhs .wrap')).insertAdjacentElement(anchor ? 'afterend' : 'beforeend', sec);

  let DADOS = null, linhas = null, panel = null;
  const fp = sec.querySelector('.f-porte'), fs = sec.querySelector('.f-seg');
  const opts = (sel, vals) => { sel.innerHTML = ''; ['Todos', ...vals].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }); };

  const render = () => {
    if (!DADOS) { sec.querySelector('.mon-bars').textContent = 'Os dados aparecem depois da próxima medição.'; return; }
    const p = fp.value, s = fs.value;
    const sel = DADOS.combos.filter(c => (p === 'Todos' || c.porte === p) && (s === 'Todos' || c.segmento === s));
    const tot = sel.reduce((a, c) => a + c.total, 0), ina = sel.reduce((a, c) => a + c.inativas, 0);
    sec.querySelector('.k-tot').textContent = nint(tot); sec.querySelector('.k-ina').textContent = nint(ina); sec.querySelector('.k-pct').textContent = pct(ina, tot);
    // agrupa pelo eixo que não está filtrado (segmento quando há porte escolhido, ou vice-versa)
    const eixo = s !== 'Todos' && p === 'Todos' ? 'porte' : 'segmento';
    sec.querySelector('.t-graf').textContent = `Empresas sem atividade por ${eixo}, com o % dentro de cada grupo.`;
    const g = new Map();
    sel.forEach(c => { const k = c[eixo]; const o = g.get(k) || { total: 0, inativas: 0 }; o.total += c.total; o.inativas += c.inativas; g.set(k, o); });
    const arr = [...g.entries()].sort((a, b) => b[1].inativas - a[1].inativas);
    const max = Math.max(1, ...arr.map(([, o]) => o.inativas));
    const box = sec.querySelector('.mon-bars'); box.innerHTML = '';
    arr.forEach(([k, o]) => {
      const r = document.createElement('div'); r.className = 'mon-row';
      const l = document.createElement('span'); l.textContent = k;
      const t = document.createElement('div'); t.className = 'mon-track'; const f = document.createElement('div'); f.className = 'mon-fill'; f.style.width = (100 * o.inativas / max) + '%'; t.appendChild(f);
      const n = document.createElement('span'); n.className = 'n'; n.textContent = `${nint(o.inativas)} de ${nint(o.total)} · ${pct(o.inativas, o.total)}`;
      r.appendChild(l); r.appendChild(t); r.appendChild(n); box.appendChild(r);
    });
    if (panel && panel.isConnected) desenhar();
  };

  const filtradas = () => {
    const p = fp.value, s = fs.value, q = panel ? panel.querySelector('.search').value.toLowerCase() : '';
    return (linhas || []).filter(r => (p === 'Todos' || (r.porte || '(sem porte)') === p) && (s === 'Todos' || (r.segmento || '(sem segmento)') === s)
      && (!q || COLS.some(c => String(r[c] ?? '').toLowerCase().includes(q))));
  };
  const desenhar = () => {
    const rows = filtradas();
    const head = panel.querySelector('thead tr'), body = panel.querySelector('tbody'); head.innerHTML = ''; body.innerHTML = '';
    COLS.forEach(c => { const th = document.createElement('th'); th.textContent = HEAD[c]; head.appendChild(th); });
    rows.slice(0, 500).forEach(rw => { const tr = document.createElement('tr'); COLS.forEach(c => { const td = document.createElement('td');
      if (c === 'link_hubspot') { const a = document.createElement('a'); a.href = rw[c]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Abrir'; td.appendChild(a); } else td.textContent = rw[c] ?? '';
      tr.appendChild(td); }); body.appendChild(tr); });
    panel.querySelector('.meta').textContent = `${nint(rows.length)} empresa(s) sem atividade no filtro${rows.length > 500 ? ' · a tela mostra as 500 primeiras, o CSV leva todas' : ''}`;
  };
  const baixar = () => {
    const rows = filtradas(); if (!rows.length) return;
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\ufeff' + [COLS.map(c => esc(HEAD[c])).join(',')].concat(rows.map(r => COLS.map(c => esc(r[c])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = 'empresas-sem-atividade-2-anos.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
  sec.querySelector('.ver').addEventListener('click', async () => {
    if (!panel) {
      panel = document.getElementById('tpl-lista').content.firstElementChild.cloneNode(true);
      ['.sit', '.esc'].forEach(k => { const e = panel.querySelector(k); if (e) e.style.display = 'none'; });
      panel.querySelector('.close').addEventListener('click', () => panel.remove());
      panel.querySelector('.search').addEventListener('input', desenhar);
      panel.querySelector('.dl').addEventListener('click', baixar);
      panel.querySelector('.lt').textContent = 'Empresas sem atividade há mais de 2 anos (monitoramento, fora da nota)';
    }
    sec.querySelector('.mslot').appendChild(panel);
    if (!linhas) {
      panel.querySelector('.meta').textContent = 'Carregando empresas…';
      const r = await fetch('/api/lista?idp=MON-01&situacao=erro&escopo=total'); const j = r.ok ? await r.json() : null;
      linhas = j ? j.rows : [];
    }
    desenhar(); panel.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  });
  fp.addEventListener('change', render); fs.addEventListener('change', render);

  fetch('/api/data').then(r => r.ok ? r.json() : null).then(d => {
    DADOS = d && d.monitor && d.monitor.inatividade;
    if (DADOS) {
      const portes = [...new Set(DADOS.combos.map(c => c.porte))].sort();
      const segs = [...new Set(DADOS.combos.map(c => c.segmento))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      opts(fp, portes); opts(fs, segs);
    }
    render();
  }).catch(() => render());
})();
