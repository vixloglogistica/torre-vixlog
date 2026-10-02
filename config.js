// Configuração do Controle de Pátio Vix Log.
// Nada aqui é secreto: o endereço do proxy sozinho não abre dados (precisa do token na URL da TV).
window.TORRE_CONFIG = {
  api: 'https://torre-vixlog.ramon-011.workers.dev',
  // intervalo: 20,
  viradaHora: 14,                 // até essa hora: Recebimento; a partir dela: Expedição
  // chamar: ['apresentou'],      // etapas que tocam som: 'apresentou' | 'aguardando_doca' | 'em_andamento'
};
