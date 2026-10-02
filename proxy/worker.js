/**
 * TORRE DE CONTROLE VIX LOG — proxy do Bitrix24 (Cloudflare Worker)
 *
 * Faz 3 coisas que o navegador da TV não pode fazer sozinho:
 *   1) guarda a chave secreta do BI do Bitrix24 (nunca vai para o HTML/GitHub);
 *   2) lê crm_deal + crm_deal_uf (a mesma fonte do Power BI) e junta as duas;
 *   3) devolve um JSON pequeno, já tratado, com CORS liberado.
 *
 * Variáveis (Settings > Variables and Secrets do Worker):
 *   BX_HOST       texto   ex.: vixloglogistica.bitrix24.com.br
 *   BX_KEY        secret  chave secreta do Power BI (Bitrix24 > Análise do CRM > Power BI)
 *   PAINEL_TOKEN  secret  senha curta que a TV manda na URL (?t=...)
 *   ALLOW_ORIGIN  texto   (opcional) ex.: https://vixloglogistica.github.io  (padrão: *)
 */

// ---------- mapa de campos personalizados (códigos UF do Bitrix24) ----------
const UF = {
  clienteDigitado: 'UF_CRM_DEAL_1780501992917', // Recebimento: cliente digitado no formulário
  clienteExp:      'UF_CRM_1780501904',         // Expedição: cliente
  razaoSocial:     'UF_CRM_1780923028504',      // Razão social (busca pelo CNPJ)
  dataAgendada:    'UF_CRM_DEAL_1780502026678', // DATA DO AGENDAMENTO
  transportadora:  'UF_CRM_DEAL_1780502090596',
  tipoCarga:       'UF_CRM_DEAL_1780502121562', // Volumes | Paletes
  qtdPaletes:      'UF_CRM_DEAL_1780502169382',
  qtdVolumes:      'UF_CRM_DEAL_1780502216429',
  observacao:      'UF_CRM_DEAL_1780502398607',
  placa:           'UF_CRM_1780550317',
  motorista:       'UF_CRM_1780550357',
  chegada:         'UF_CRM_1780550434',         // hora em que o veículo se apresentou
  doca:            'UF_CRM_1780550872',
  inicio:          'UF_CRM_1780550966',         // início do recebimento
  conferente:      'UF_CRM_1780550996',
  fim:             'UF_CRM_1780551024',         // fim do recebimento
  fimExp:          'UF_CRM_1785335141626',      // fim da expedição
  operacao:        '',                          // Tipo da Operação (Descarga | Crossdocking): vazio = detecta pelo valor
};

// ---------- etapas dos dois funis ----------
const ETAPAS = {
  // Funil 5 — Agendamento Recebimento
  'C5:NEW': 'solicitada',
  'C5:PREPAYMENT_INVOICE': 'agendado',
  'C5:EXECUTING': 'apresentou',
  'C5:UC_QT8RDH': 'aguardando_doca',
  'C5:UC_UOQ7K6': 'em_andamento',
  'C5:WON': 'concluido',
  'C5:LOSE': 'nao_cumprido',
  'C5:UC_96PPEK': 'incorreto',
  'C5:UC_I3N8KO': 'nao_realizado',
  // Funil 11 — Expedição
  'C11:NEW': 'apresentou',
  'C11:PREPARATION': 'aguardando_doca',
  'C11:PREPAYMENT_INVOIC': 'em_andamento',
  'C11:WON': 'concluido',
  'C11:LOSE': 'nao_cumprido',
};
const ABERTAS = new Set(['apresentou', 'aguardando_doca', 'em_andamento']);

const vazio = (v) => v === null || v === undefined || v === '' || v === 'não selecionada' || v === 'False';
const limpa = (v) => (vazio(v) ? '' : String(v).trim());
const dataDe = (s) => (s ? String(s).slice(0, 10) : '');
const hojeSP = (agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora); // AAAA-MM-DD
const toObjs = (tab) => { const [h, ...rows] = tab; return rows.map((r) => Object.fromEntries(h.map((c, i) => [c, r[i]]))); };

function nomeTransportadora(v) {
  let t = limpa(v).replace(/\s*[\d./-]{11,18}\s*$/, '').trim(); // tira CNPJ colado no fim
  if (!t || /aguardando|n[ãa]o informado/i.test(t)) return '';
  return t;
}
function nomeCliente(deal, uf, funil) {
  const ok = (v) => v && !/^[\d.\/\s-]+$/.test(v); // descarta valor que é só CNPJ
  const t = (deal.TITLE || '').split('|').map((s) => s.trim());
  const lista = funil === 'exp'
    ? [limpa(uf[UF.clienteExp]), limpa(uf[UF.razaoSocial])]
    : [limpa(uf[UF.razaoSocial]), t.length >= 3 ? t[1] : '', limpa(uf[UF.clienteDigitado])];
  return lista.find(ok) || (/^preencher/i.test(t[0]) ? 'Sem identificação' : t[0]) || '—';
}
/** "Tipo da Operação" (Descarga | Crossdocking): acha a coluna pelo valor, em qualquer funil. Se souber o código UF, ponha em UF.operacao. */
const OPS = { descarga: 'Descarga', crossdocking: 'Crossdocking' };
function operacao(uf) {
  const lista = UF.operacao ? [uf[UF.operacao]] : Object.entries(uf).filter(([k]) => /^UF_CRM/.test(k)).map(([, v]) => v);
  for (const v of lista) {
    const t = limpa(v).toLowerCase();
    if (t === 'crossdocking' || t === 'cross docking' || t === 'cross-docking') return OPS.crossdocking;
    if (t === 'descarga') return OPS.descarga;
  }
  return '';
}
function qtd(uf) {
  const tipo = limpa(uf[UF.tipoCarga]);
  if (tipo === 'Paletes') return { tipo: 'Paletes', qtd: limpa(uf[UF.qtdPaletes]) };
  if (tipo === 'Volumes') return { tipo: 'Volumes', qtd: limpa(uf[UF.qtdVolumes]) };
  return { tipo: '', qtd: '' };
}

/** Junta crm_deal + crm_deal_uf e devolve só o que a TV precisa. Exportada para teste. */
export function transformar(dealTab, ufTab, agora = new Date()) {
  const hoje = hojeSP(agora);
  const ufPorDeal = new Map(toObjs(ufTab).map((r) => [String(r.DEAL_ID), r]));
  const itens = [];
  const futuros = {};
  const prox = [];   // agendados de dias futuros (para a tela "Programação do dia seguinte")

  for (const d of toObjs(dealTab)) {
    const funil = String(d.CATEGORY_ID) === '5' ? 'rec' : String(d.CATEGORY_ID) === '11' ? 'exp' : null;
    if (!funil) continue;
    const etapa = ETAPAS[d.STAGE_ID];
    if (!etapa || etapa === 'solicitada') continue;
    const uf = ufPorDeal.get(String(d.ID)) || {};

    const chegada = limpa(uf[UF.chegada]);
    const dataAg = funil === 'rec' ? dataDe(uf[UF.dataAgendada]) : dataDe(chegada) || dataDe(d.DATE_CREATE);

    if (funil === 'rec' && etapa === 'agendado' && dataAg > hoje) {
      futuros[dataAg] = (futuros[dataAg] || 0) + 1;
      const qf = qtd(uf);
      prox.push({ id: Number(d.ID), dataAg, cliente: nomeCliente(d, uf, funil), tipo: qf.tipo, qtd: qf.qtd });
      continue;
    }

    const ehHoje = dataAg === hoje;
    const veiculoNoPatio = ABERTAS.has(etapa) && dataAg < hoje; // sobrou de ontem
    if (!ehHoje && !veiculoNoPatio) continue;

    const q = qtd(uf);
    itens.push({
      id: Number(d.ID),
      funil,
      etapa,
      cliente: nomeCliente(d, uf, funil),
      transportadora: nomeTransportadora(uf[UF.transportadora]) || '',
      placa: limpa(uf[UF.placa]),
      motorista: limpa(uf[UF.motorista]),
      doca: limpa(uf[UF.doca]).replace(/^Doca\s*/i, ''),
      dataAg,
      chegada,
      inicio: limpa(uf[UF.inicio]),
      fim: limpa(funil === 'rec' ? uf[UF.fim] : uf[UF.fimExp]),
      movido: d.MOVED_TIME || d.DATE_MODIFY || '',
      conferente: limpa(uf[UF.conferente]),
      tipo: q.tipo, qtd: q.qtd,
      obs: limpa(uf[UF.observacao]).slice(0, 80),
      operacao: operacao(uf),
      doDiaAnterior: veiculoNoPatio,
    });
  }
  // próximo dia com agendamento (sexta mostra segunda; sábado entra se houver)
  const proxData = prox.map((p) => p.dataAg).sort()[0];
  const amanha = proxData ? { data: proxData, itens: prox.filter((p) => p.dataAg === proxData).map(({ id, cliente, tipo, qtd }) => ({ id, cliente, tipo, qtd })) } : null;
  return { geradoEm: agora.toISOString(), hoje, itens, futuros, amanha };
}

// ---------- chamada ao Bitrix24 ----------
async function tabela(env, nome, desde, ate) {
  const r = await fetch(`https://${env.BX_HOST}/bitrix/tools/biconnector/pbi.php?table=${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRange: { startDate: desde, endDate: ate }, key: env.BX_KEY }),
  });
  if (!r.ok) throw new Error(`Bitrix24 respondeu ${r.status} em ${nome}`);
  return r.json();
}
const dia = (base, delta) => new Date(base.getTime() + delta * 864e5).toISOString().slice(0, 10);


/** Itens compactos de um período (para o painel de KPIs). Exportada para teste. */
export function transformarKpi(dealTab, ufTab, ini, fim) {
  const ufPorDeal = new Map(toObjs(ufTab).map((r) => [String(r.DEAL_ID), r]));
  const itens = [];
  for (const d of toObjs(dealTab)) {
    const funil = String(d.CATEGORY_ID) === '5' ? 'rec' : String(d.CATEGORY_ID) === '11' ? 'exp' : null;
    const etapa = funil ? ETAPAS[d.STAGE_ID] : null;
    if (!etapa || etapa === 'solicitada') continue;
    const uf = ufPorDeal.get(String(d.ID)) || {};
    const chegada = limpa(uf[UF.chegada]);
    const dataAg = funil === 'rec' ? dataDe(uf[UF.dataAgendada]) : dataDe(chegada) || dataDe(d.DATE_CREATE);
    if (!dataAg || dataAg < ini || dataAg > fim) continue;
    itens.push({
      id: Number(d.ID), f: funil, e: etapa, d: dataAg,
      c: nomeCliente(d, uf, funil), t: nomeTransportadora(uf[UF.transportadora]),
      ch: chegada, in: limpa(uf[UF.inicio]), fi: limpa(funil === 'rec' ? uf[UF.fim] : uf[UF.fimExp]),
    });
  }
  return itens;
}

export default {
  async fetch(req, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (!env.PAINEL_TOKEN || url.searchParams.get('t') !== env.PAINEL_TOKEN)
      return new Response('{"erro":"acesso negado"}', { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    // ---- chamada manual (precisa do KV "CHAMADAS" ligado ao Worker) ----
    const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (url.pathname.endsWith('/chamar') && req.method === 'POST') {
      if (!env.CHAMADAS) return json({ erro: 'KV CHAMADAS não configurado no Worker' }, 501);
      let b; try { b = JSON.parse(await req.text()); } catch (e) { return json({ erro: 'corpo inválido' }, 400); }
      const it = b && b.item ? b.item : {}, c = k => String(it[k] ?? '').slice(0, 120);
      const chamada = { seq: Date.now(), por: String(b.por || '').slice(0, 40),
        item: { id: c('id'), funil: c('funil') === 'exp' ? 'exp' : 'rec', etapa: c('etapa'), transportadora: c('transportadora'), cliente: c('cliente'),
                placa: c('placa'), doca: c('doca'), tipo: c('tipo'), qtd: c('qtd'), operacao: c('operacao') } };
      await env.CHAMADAS.put('ultima', JSON.stringify(chamada), { expirationTtl: 3600 });
      return json({ ok: true, seq: chamada.seq });
    }
    if (url.pathname.endsWith('/chamada')) {
      if (!env.CHAMADAS) return json({ seq: 0, semKV: true });
      return new Response((await env.CHAMADAS.get('ultima')) || '{"seq":0}', { headers: { ...cors, 'Content-Type': 'application/json' } });
    }


    // ---- KPIs do mês (?mes=AAAA-MM): mês pedido + mês anterior, cache de 10 min ----
    if (url.pathname.endsWith('/kpi')) {
      const agora = new Date(), hoje = hojeSP(agora);
      const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : hoje.slice(0, 7);
      const [a, m] = mes.split('-').map(Number);
      const pad = (n) => String(n).padStart(2, '0');
      const antes = m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`;
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const ini = `${antes}-01`, fim = `${mes}-${pad(ultimo)}`;
      const ckey = new Request(url.origin + '/__kpi_' + mes);
      let r = await caches.default.match(ckey);
      if (!r) {
        try {
          const d0 = new Date(Date.UTC(+antes.slice(0, 4), +antes.slice(5, 7) - 1, 1) - 35 * 864e5).toISOString().slice(0, 10);
          const [deals, ufs] = await Promise.all([tabela(env, 'crm_deal', d0, dia(new Date(fim + 'T12:00:00Z'), 1)), tabela(env, 'crm_deal_uf', d0, dia(new Date(fim + 'T12:00:00Z'), 1))]);
          r = new Response(JSON.stringify({ geradoEm: agora.toISOString(), hoje, mes, antes, itens: transformarKpi(deals, ufs, ini, fim) }),
            { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + (mes === hoje.slice(0, 7) ? 600 : 3600) } });
          ctx.waitUntil(caches.default.put(ckey, r.clone()));
        } catch (e) { return json({ erro: String(e.message || e) }, 502); }
      }
      return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // cache de 20 s: várias TVs/abas não multiplicam as chamadas ao Bitrix24
    const cache = caches.default;
    const chave = new Request(url.origin + '/__torre');
    let resp = await cache.match(chave);
    if (!resp) {
      try {
        const agora = new Date();
        const desde = dia(agora, -25), ate = dia(agora, 1);
        const [deals, ufs] = await Promise.all([tabela(env, 'crm_deal', desde, ate), tabela(env, 'crm_deal_uf', desde, ate)]);
        resp = new Response(JSON.stringify(transformar(deals, ufs, agora)), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20' },
        });
        ctx.waitUntil(cache.put(chave, resp.clone()));
      } catch (e) {
        return new Response(JSON.stringify({ erro: String(e.message || e) }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }
    return new Response(resp.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};
