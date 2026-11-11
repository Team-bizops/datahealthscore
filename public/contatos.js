// Card "Contatos na empresa errada" dentro da dimensão Consistência (dados do resumo da medição)
(() => {
  const nint = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR');
  const css = document.createElement('style');
  css.textContent = `.dhs .cterr{margin:12px 0 4px;border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--slate-soft)}
  .dhs .cterr h4{font-size:.9rem;margin:0 0 4px}
  .dhs .cterr .sub{font-size:.8rem;color:var(--text-muted);margin-bottom:10px}
  .dhs .cterr .nums{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:10px;font-size:.78rem;color:var(--text-muted)}
  .dhs .cterr .nums b{display:block;font-size:1.2rem;color:var(--text)}
  .dhs .cterr .grade{display:grid;grid-template-columns:2.2fr .7fr .6fr 1.6fr 2fr 1.8fr;font-size:.8rem}
  .dhs .cterr .grade > div{padding:6px 8px;border-bottom:1px solid var(--border);word-break:break-word}
  .dhs .cterr .grade .h{color:var(--text-muted);font-weight:700;font-size:.74rem;text-transform:uppercase;letter-spacing:.03em}
  .dhs .cterr .grade .n{text-align:right}
  .dhs .cterr details summary{cursor:pointer;color:var(--accent);font-weight:700;font-size:.82rem;margin:4px 0 8px}
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
      <details open><summary>10 empresas com mais casos</summary><div class="grade"><div class="h">Empresa associada</div><div class="h n">Contatos</div><div class="h n">Em uso</div><div class="h">E-mail dos contatos</div><div class="h">Correção sugerida</div><div class="h">Empresa sugerida</div></div></details>
      <div class="dica">A lista completa do CON-01 (na tabela abaixo) agrupa os contatos por empresa e traz a correção sugerida para cada um.</div>`;
    const grade = box.querySelector('.grade');
    (d.top || []).forEach(o => {
      [[String(o.empresa || '').replace(/ \(ID \d+\)$/, ''), ''], [nint(o.contatos), 'n'], [nint(o.em_uso), 'n'], [`@${o.dominio_email} (${nint(o.qtd_dominio)})`, ''], [o.sugestao, ''], [String(o.empresa_sugerida || '').replace(/ \(ID \d+\)$/, ''), '']]
        .forEach(([v, c]) => { const el = document.createElement('div'); if (c) el.className = c; el.textContent = v ?? ''; grade.appendChild(el); });
    });
  };

  let dados = null;
  fetch('/api/data').then(r => r.ok ? r.json() : null).then(j => { dados = j && j.contatos_empresa_errada; montar(dados); }).catch(() => {});
  // o painel redesenha as dimensões ao carregar: remonta o card se ele sumir
  new MutationObserver(() => { const a = document.getElementById('dim-consistencia'); if (dados && a && !a.querySelector('.cterr')) montar(dados); })
    .observe(document.body, { childList: true, subtree: true });
})();
