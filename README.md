# Controle de Pátio Vix Log — como colocar no ar

Substitui o Power BI na TV do armazém. Três peças:

| Peça | O que faz | Onde fica |
|---|---|---|
| `index.html` + `config.js` | A tela da TV (Recebimento de manhã, Expedição à tarde, chamada com som) | GitHub Pages **ou** `C:\Painel` na máquina da TV |
| `proxy/worker.js` | Busca os dados no Bitrix24 com a chave secreta e entrega à TV já tratados | Cloudflare Workers (gratuito) |
| Chave do BI (Bitrix24) | Dá leitura ao CRM | **Só** dentro do Worker. Nunca no HTML nem no GitHub |

Por que existe o proxy: o endereço do Power BI do Bitrix24 não aceita ser chamado direto por uma página web (bloqueio de navegador, "CORS") e exige a chave secreta. O proxy resolve as duas coisas.

---

## Passo 1 — Criar o proxy (Cloudflare, ~10 min)
1. Entre em https://dash.cloudflare.com (conta gratuita) → **Workers & Pages → Create → Create Worker**. Nome sugerido: `torre-vixlog`. Clique em **Deploy**.
2. **Edit code** → apague o exemplo, cole todo o conteúdo de `proxy/worker.js` → **Deploy**.
3. Em **Settings → Variables and Secrets**, crie:
   - `BX_HOST` (tipo Text): `vixloglogistica.bitrix24.com.br`
   - `BX_KEY` (tipo **Secret**): a chave secreta do Power BI do Bitrix24 (**use uma chave nova**, veja o aviso abaixo)
   - `PAINEL_TOKEN` (tipo **Secret**): uma senha curta inventada por você, ex.: `vix-torre-7391`
4. Anote o endereço do Worker, algo como `https://torre-vixlog.SEUUSUARIO.workers.dev`.
5. Teste no navegador: `https://torre-vixlog.SEUUSUARIO.workers.dev/?t=vix-torre-7391`. Deve aparecer um JSON com `itens`. Sem o `?t=` correto deve dar "acesso negado".

## Passo 2 — Publicar a tela
**Opção A (GitHub Pages)**: crie o repositório `torre-vixlog` na organização `vixloglogistica`, suba `index.html` e `config.js`, ative *Settings → Pages → Deploy from branch → main*. O repositório pode ser público: não há nenhum segredo nos arquivos.
**Opção B (local)**: copie `index.html` e `config.js` para `C:\Painel` na máquina da TV (como já é hoje).

Edite `config.js` e coloque o endereço do Worker em `api`.

## Passo 3 — Abrir na TV (uma vez só)
Crie um atalho do Chrome com o destino:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required "https://vixloglogistica.github.io/torre-vixlog/?t=vix-torre-7391"
```
(na Opção B, troque a URL por `file:///C:/Painel/index.html?t=vix-torre-7391`; para a página abrir ao ligar o PC, coloque o atalho em `shell:startup`).
O token fica gravado no navegador e some da barra de endereço. Se o som não tocar, clique uma vez na página (o botão no canto inferior direito mostra se o som está ativo).

## Como a tela se comporta
- **Antes das 14h**: quadro de **Recebimento** — Agendado → Veículo se apresentou → Aguardando doca → Em recebimento → Concluídos. **A partir das 14h**: quadro de **Expedição**. Mudar a hora: `?virada=15`. Forçar: tecla **R** (recebimento), **E** (expedição), **A** (automático).
- **Chamada**: quando um card entra em *Veículo se apresentou* (em qualquer um dos dois funis, mesmo que o quadro na tela seja o outro), a TV toca "ding-dong", abre uma tela cheia com transportadora, cliente, placa e quantidade, e fala o nome. Quem dispara é a própria mudança de etapa no Bitrix24, então não precisa de botão extra. Tecla **T** testa a chamada.
- Para chamar também em *Aguardando doca* ou *Em recebimento* (ex.: "dirija-se à doca 2"), edite em `config.js`: `chamar: ['apresentou','em_andamento']`.
- Tempo de espera do veículo no pátio fica amarelo após 30 min e vermelho piscando após 60 min (`atencaoMin`, `criticoMin`).
- Se a internet/Bitrix24 cair, a tela mantém os últimos dados e mostra "SEM CONEXÃO desde HH:MM".
- **Dois visuais**: *quadro* (colunas por etapa, padrão) e *painel* (lista estilo painel de aeroporto, letras que "viram" quando algo muda). Tecla **V** alterna; para deixar o painel como padrão, use `visual: 'painel'` no `config.js` ou `?visual=painel` na URL.
- Demonstração sem Bitrix24: `index.html?demo`.

## Campos do Bitrix24 usados (confirmar!)
Os campos personalizados chegam do BI só com código. Eu deduzi o significado pelos valores; confira a tabela. Se algum estiver trocado, é só ajustar o bloco `UF` no topo do `worker.js`.

| Código | Entendi como |
|---|---|
| `UF_CRM_DEAL_1780502026678` | Data do agendamento |
| `UF_CRM_DEAL_1780502090596` | Transportadora |
| `UF_CRM_1780923028504` / `UF_CRM_DEAL_1780501992917` | Razão social / cliente digitado (Recebimento) |
| `UF_CRM_1780501904` | Cliente (Expedição) |
| `UF_CRM_DEAL_1780502121562` + `…2169382` (paletes) / `…2216429` (volumes) | Tipo de carga e quantidade |
| `UF_CRM_1780550317` / `…550357` | Placa / motorista |
| `UF_CRM_1780550434` | Hora em que o veículo se apresentou |
| `UF_CRM_1780550872` | Doca |
| `UF_CRM_1780550966` / `…551024` | Início / fim do recebimento |
| `UF_CRM_1780550996` | Conferente |
| `UF_CRM_1785335141626` | Fim da expedição |

## Segurança
- A chave do BI aparece nos prints enviados e na conversa. Depois de colocar tudo no ar, **gere uma chave nova** no Bitrix24 (Análise do CRM → Microsoft Power BI) e atualize o `BX_KEY` no Worker. O Power BI antigo deixa de atualizar com a chave velha, então faça isso quando for desligá-lo.
- O token (`?t=`) só impede curiosos de ler os dados pelo Worker; ele aparece no atalho da TV, então não o divulgue.
- O Worker consulta o Bitrix24 no máximo 1 vez a cada 20 s, não importa quantas TVs estejam abertas.


## No-show (automático)
No Recebimento, quem continua **Agendado** depois das 12h (`noShowHora` no config.js; 0 desliga) aparece como **NO-SHOW**, sem precisar mover o card no Bitrix24. Se o carro chegar depois, o card volta para o fluxo normal. Cards nas etapas "Não cumprido"/"Não realizado" do Bitrix24 também entram nesse grupo (com chegada registrada, aparecem como NÃO CUMPRIDO no painel).
