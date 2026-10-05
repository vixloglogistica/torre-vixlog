// Configuração do Controle de Pátio Vix Log.
// Nada aqui é secreto: o endereço do proxy sozinho não abre dados (precisa do token na URL da TV).
window.TORRE_CONFIG = {
  // kpiCadaSeg: 120, kpiSeg: 24,  // painel de KPIs entra a cada 120 s por 24 s (kpiCadaSeg: 0 desliga)
  api: 'https://torre-vixlog.vixlog.workers.dev',
  // intervalo: 20,
  viradaHora: 14,                 // até essa hora: Recebimento; a partir dela: Expedição
  // chamar: ['apresentou'],      // etapas que tocam som: 'apresentou' | 'aguardando_doca' | 'em_andamento'
};
