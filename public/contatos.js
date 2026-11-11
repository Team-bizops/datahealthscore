// Card "Contatos na empresa errada" dentro da dimensão Consistência (dados do resumo da medição)
(() => {
  const nint = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR');
  const css = document.createElement('style');
  css.textContent = `.dhs .cterr{margin:12px 0 4px;border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--slate-soft)}
  .dhs .cterr h4{font-size:.9rem;margin:0 0 4px}
  .dhs .cterr .sub{font-size:.8rem;color:var(--text-muted);margin-bottom:10px}
  .dhs .cterr .nums{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:10px;font-size:.78rem;color:var(--text-muted)}
  .dhs .cterr .nums b{display:block;font-size:1.2rem;color:var(--text)}
  .dhs .cterr table{width:100%;border-collapse:collapse;font-size:.8rem;table-layout:fixed}
  .dhs .cterr th{text-align:left;color:var(--text-muted);font-weight:700;padding:5px 6px;border-bottom:1px solid var(--border)}
  .dhs .cterr td{padding:5px 6px;border-bottom:1px solid var(--border);word-break:break-word}
  .dhs .cterr .dica{font-size:.76rem;color:var(--text-muted);margin-top:8px}`;
  document.head.appendChild(css);

  const montar = (d) => {
    const alvo = document.getElementById('dim-consistencia'); if (!alvo || !d) return;
    let box = alvo.querySelector('.cterr');
    if (!box) { box = document.createElement('div'); box.className = 'cterr'; const ol = alvo.querySelector('.objline'); (ol || alvo.firstElementChild).insertAdjacentElement('afterend', box); }
    const tipos = Object.entries(d.por_tipo || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${nint(v)} ${k.toLowerCase()}`).join(' · ');
    box.innerHTML = `<h4>Contatos na empresa errada (CON-01)</h4>
      <div class="sub">Contatos cujo e-mail corporativo é de outra empresa. Não inclui a mesma empresa com outro domínio de e-mail (ex.: Itaú × itau-unibanco.com.br), que aparece à parte.</div>
      <div class="nums"><div><b>${nint(d.total)}</b>contatos na empresa errada</div><div><b>${nint(d.em_uso)}</b>em uso</div><div><b>${nint(d.empresas)}</b>empresas afetadas</div><div><b>${nint(d.alternativos)}</b>domínio alternativo (não é erro)</div></div>
      <div class="sub">${tipos}</div>
      <table><thead><tr><th style="width:24%">Empresa associada</th><th style="width:9%">Contatos</th><th style="width:7%">Em uso</th><th style="width:18%">E-mail dos contatos</th><th style="width:22%">Correção sugerida</th><th style="width:20%">Empresa sugerida</th></tr></thead><tbody></tbody></table>
      <div class="dica">A lista completa do CON-01 (na tabela abaixo) agrupa os contatos por empresa e traz a correção sugerida para cada um.</div>`;
    const tb = box.querySelector('tbody');
    (d.top || []).forEach(o => {
      const tr = document.createElement('tr');
      [o.empresa, nint(o.contatos), nint(o.em_uso), `@${o.dominio_email} (${nint(o.qtd_dominio)})`, o.sugestao, o.empresa_sugerida].forEach(v => { const td = document.createElement('td'); td.textContent = v ?? ''; tr.appendChild(td); });
      tb.appendChild(tr);
    });
  };

  let dados = null;
  fetch('/api/data').then(r => r.ok ? r.json() : null).then(j => { dados = j && j.contatos_empresa_errada; montar(dados); }).catch(() => {});
  // o painel redesenha as dimensões ao carregar: remonta o card se ele sumir
  new MutationObserver(() => { const a = document.getElementById('dim-consistencia'); if (dados && a && !a.querySelector('.cterr')) montar(dados); })
    .observe(document.body, { childList: true, subtree: true });
})();
