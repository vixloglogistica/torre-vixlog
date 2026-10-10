/* =====================================================================
   PLACAS — letras do painel de aeroporto (split-flap) · só visual
   Placas.html(n, texto, classe)   → HTML de n placas com o texto
   Placas.troca(el, texto, atraso, rapido) → vira só as letras que mudaram
   Em tela estreita (celular, < 1000 px) vira texto comum, sem placas.
   Não mexe em dados, som nem regras: recebe o texto pronto e desenha.
   ===================================================================== */
(function(){
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rnd = () => LETRAS[Math.floor(Math.random()*LETRAS.length)];
  const reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const simples = () => window.innerWidth < 1000;
  const esc = c => c===' ' ? '&nbsp;' : c.replace(/[&<>"']/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  /* nomes longos: antes de cortar, tira LTDA/ME/EPP e abrevia palavras comuns (só quando não cabe) */
  const ABREV = [[/\b(LTDA|EIRELI|S\.?\/?A\.?|ME|EPP)\b\.?/g,''],[/\bTRANSPORTES?\b/g,'TRANSP.'],[/\bOPERA[ÇC][ÕO]ES\b/g,'OPER.'],[/\bLOG[ÍI]STICAS?\b/g,'LOG.'],
    [/\bDISTRIBUIDORA\b/g,'DISTRIB.'],[/\bDISTRIBUI[ÇC][ÃA]O\b/g,'DISTRIB.'],[/\bCOM[ÉE]RCIO\b/g,'COM.'],[/\bIND[ÚU]STRIA\b/g,'IND.'],[/\bPRODUTOS\b/g,'PROD.'],
    [/\bMATERIAIS\b/g,'MAT.'],[/\bSOLU[ÇC][ÕO]ES\b/g,'SOL.'],[/\bBRASIL\b/g,'BR'],[/\bCOSM[ÉE]TICOS\b/g,'COSM.'],[/\bEL[ÉE]TRICOS\b/g,'ELÉTR.']];
  function cabe(txt, n){
    let t = String(txt ?? '').toUpperCase();
    if ([...t].length <= n) return t;                  // cabe: mantém como veio (inclusive espaços de alinhamento)
    t = t.replace(/\s+/g,' ').trim();
    for (const [re, por] of ABREV){ if ([...t].length <= n) break; t = t.replace(re, por).replace(/\s+/g,' ').trim(); }
    return t;
  }
  const ajusta = (n, txt) => [...cabe(txt, n)].slice(0, n).join('').padEnd(n, ' ');

  function placa(c){ const s = esc(c); return `<span class="t" data-c="${c===' '?' ':esc(c)}"><b class="u"><s>${s}</s></b><b class="d"><s>${s}</s></b><b class="fu"><s></s></b><b class="fd"><s></s></b></span>`; }

  function html(n, txt, cls, estilo){
    const t = ajusta(n, txt);
    if (simples()) return `<span class="fl simples ${cls||''}" data-n="${n}"${estilo?` style="${estilo}"`:''}>${esc(t.trim()||' ')}</span>`;
    return `<span class="fl ${cls||''}" data-n="${n}"${estilo?` style="${estilo}"`:''}>${[...t].map(placa).join('')}</span>`;
  }

  const poe = (b, c) => { b.firstChild.innerHTML = esc(c); };
  function passo(el, de, para, ms){
    const [u, d, fu, fd] = el.children;
    if (reduz || !fu.animate){ poe(u, para); poe(d, para); return Promise.resolve(); }
    poe(u, para); poe(d, de); poe(fu, de); poe(fd, para);
    fu.style.visibility = fd.style.visibility = 'visible';
    const a = fu.animate([{transform:'rotateX(0)'},{transform:'rotateX(-90deg)'}], {duration:ms/2, easing:'ease-in', fill:'forwards'});
    const b = fd.animate([{transform:'rotateX(90deg)'},{transform:'rotateX(0)'}], {duration:ms/2, delay:ms/2, easing:'ease-out', fill:'forwards'});
    return b.finished.then(()=>{ poe(d, para); fu.style.visibility = fd.style.visibility = 'hidden'; a.cancel(); b.cancel(); }).catch(()=>{});
  }
  async function vira(el, para, atraso, rapido){
    const de = el.dataset.c ?? ' ';
    if (de === para) return;
    el.dataset.c = para;
    if (atraso) await new Promise(r=>setTimeout(r, atraso));
    if (el.dataset.c !== para) return;                 // mudou de novo enquanto esperava
    const ms = rapido ? 150 : 230;
    const seq = (rapido || reduz) ? [para] : (Math.random() < .5 ? [rnd(), para] : [rnd(), rnd(), para]);
    let atual = de;
    for (const c of seq){ if (el.dataset.c !== para) return; await passo(el, atual, c, ms); atual = c; }
  }

  function troca(fl, txt, atraso, rapido){
    if (!fl) return;
    const n = +fl.dataset.n, t = ajusta(n, txt);
    if (fl.classList.contains('simples')){ const v = t.trim() || ' '; if (fl.textContent !== v) fl.textContent = v; return; }
    [...fl.children].forEach((el, k)=>{ if ((el.dataset.c ?? ' ') !== t[k]) vira(el, t[k], (atraso||0) + (rapido ? 0 : k*34), rapido); });
  }

  window.Placas = { html, troca, simples, cabe };
})();
