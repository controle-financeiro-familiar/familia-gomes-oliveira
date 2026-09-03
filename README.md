# Controle Financeiro Familiar

Aplicação web (single-file, `index.html`) de controle financeiro familiar. Os dados
(`configuracoes.cfg`, `registros.log` e os backups `.bkp`) são armazenados no **OneDrive** do
usuário e acessados via **Microsoft Graph API**, com autenticação OAuth2 / Microsoft Identity
Platform (MSAL.js). Não há dependência de caminhos locais do dispositivo (`C:\`, `D:\` etc.) —
funciona igualmente no navegador do computador e do celular, sempre sobre os mesmos dados.

## Configuração (obrigatória antes do primeiro uso)

A aplicação precisa de um **App Registration** no Microsoft Entra ID (Azure AD) para poder pedir
permissão de acesso ao OneDrive do usuário. Nenhuma senha ou `client_secret` é armazenado no
código — apenas um "Client ID" público, seguro para ficar em um arquivo estático como este.

1. Acesse o [Portal do Azure](https://portal.azure.com) → **Microsoft Entra ID** → **Registros de
   aplicativo** → **Novo registro**.
   - **Tipos de conta com suporte**: "Contas em qualquer diretório organizacional e contas
     pessoais da Microsoft" (permite tanto conta OneDrive pessoal quanto corporativa/escolar).
   - **Plataforma**: "Aplicativo de página única (SPA)" — obrigatório para o fluxo OAuth2 com PKCE
     usado por este app (sem client secret).
   - **URI de redirecionamento**: a URL pública onde este `index.html` ficará hospedado (ex.:
     `https://seudominio.com/` ou a URL do GitHub Pages).
2. Em **Permissões de API**, adicione (Microsoft Graph → **Delegada**):
   - `User.Read`
   - `Files.ReadWrite`
3. Copie o **"ID do aplicativo (cliente)"** gerado.
4. Abra `index.html` e localize, perto do topo do bloco `<script>`, a constante
   `ONEDRIVE_CONFIG` — substitua o valor de `clientId` pelo ID copiado (ou defina
   `window.ONEDRIVE_CLIENT_ID` antes de carregar o `index.html`, se preferir configurar por
   ambiente/hospedagem sem editar o arquivo).

Por padrão, os arquivos ficam em `OneDrive/Controle Financeiro Familiar/` (e os backups em
`OneDrive/Controle Financeiro Familiar/Backups/`) — para mudar, edite `ONEDRIVE_CONFIG.pastaApp`
e `ONEDRIVE_CONFIG.pastaBackups` (ponto único de configuração, sem caminhos espalhados pelo
código).

## Uso multiusuário (pasta compartilhada)

A aplicação foi feita para ser usada por mais de uma pessoa da família, cada uma com a **sua
própria conta Microsoft** — nunca com a senha ou o token de outra pessoa. Os arquivos continuam
morando só no OneDrive do proprietário; ninguém mais tem uma cópia própria.

1. O **proprietário** cria a pasta `Controle Financeiro Familiar` no seu OneDrive (a própria
   aplicação cria automaticamente no primeiro uso, se ainda não existir).
2. No OneDrive, o proprietário clica com o botão direito na pasta → **Compartilhar**, escolhe
   **"Pode editar"** ou **"Pode exibir"** para cada pessoa da família (conforme o nível de acesso
   desejado — ver seção seguinte) e copia o link gerado.
3. Cole esse link em `ONEDRIVE_CONFIG.pastaCompartilhadaLink` no `index.html` (ou defina
   `window.ONEDRIVE_SHARE_LINK` antes de carregar a página, se preferir configurar por
   ambiente/hospedagem sem editar o arquivo). **Sem esse link**, cada pessoa só enxerga a pasta na
   própria conta — funciona para o proprietário testar sozinho, mas não é multiusuário de verdade.
4. Cada pessoa da família abre a mesma URL da aplicação e entra com a **própria** conta Microsoft.
   A aplicação localiza a pasta compartilhada automaticamente (via Microsoft Graph, não por um
   caminho fixo) e verifica a permissão de cada uma:
   - **Pode editar** → cria/altera/exclui lançamentos, atualiza configurações, cria e restaura
     backups.
   - **Pode exibir** → só consulta dados, histórico e backups; a interface indica "somente
     leitura" e a própria API do Graph recusa qualquer tentativa de gravação (a proteção não
     depende só da interface esconder botões).

## Uso (fluxo geral)

1. Hospede o `index.html` em qualquer servidor estático (ele é 100% client-side).
2. Abra a URL — a aplicação pede login com a conta Microsoft (OAuth2, via redirecionamento).
3. Após autenticar, ela localiza a pasta compartilhada, verifica a permissão da conta e checa se
   `configuracoes.cfg` e `registros.log` já existem:
   - Se existirem, carrega os dados automaticamente.
   - Se não existirem e a conta tem permissão de edição, oferece criá-los (vazios).
   - Se não existirem e a conta só tem leitura, informa que não é possível criá-los.
4. Toda alteração feita no app é gravada de volta nos mesmos arquivos no OneDrive (botão
   **Salvar**, ou automaticamente ao restaurar um backup) usando controle de concorrência otimista
   por ETag (`If-Match`) — se outra pessoa gravou uma versão mais nova nesse meio-tempo, a
   gravação é recusada e a aplicação oferece recarregar os dados atuais ou cancelar, nunca
   sobrescreve silenciosamente.
5. Backups (`.bkp`, com carimbo de data/hora) são criados, listados e restaurados diretamente da
   pasta `Backups` no OneDrive — sem nenhum download/upload manual como mecanismo principal.
6. Um arquivo `auditoria.log` (JSON Lines) registra operações críticas (criação/restauração/
   exclusão de backup, conflitos de gravação) com usuário, data/hora e resultado — não substitui
   `registros.log`, que continua sendo o único arquivo de dados financeiros.

## BB Rende Fácil (aplicação/resgate automático de saldo)

O Banco do Brasil aplica e resgata automaticamente, todo dia, o saldo ocioso de algumas contas
correntes num investimento vinculado chamado "Rende Fácil" — o dinheiro nunca muda de titularidade
nem sai da conta, só circula entre o "saldo à vista" e esse investimento automático. A aplicação
reconhece essas linhas na importação de extrato (`detectarRendeFacilBB`, em `index.html`) pela
própria descrição do lançamento (grafias como "APLIC AUTOM RDFACIL" ou "RESGATE AUTOMATICO
RDFACIL", normalizadas para não depender de acentuação/caixa/abreviação exatas do arquivo do
banco) e classifica cada lado numa subcategoria própria, dentro da mesma Conta Corrente onde
ocorre:

- **Aplicação Automática no BB Rende Fácil** (Despesa) — dinheiro saindo do saldo à vista para o
  investimento automático.
- **Resgate Automático do BB Rende Fácil** (Receita) — dinheiro voltando do investimento para o
  saldo à vista.

Ambas ficam no grupo **Economias**, subgrupo **Rende Fácil (Aplicação Automática de Saldo)** —
separado do subgrupo "Reserva de Emergência e Liquidez" usado pelos aportes/uso deliberados, para
nunca serem confundidas com uma decisão real de poupar ou resgatar patrimônio. Por não
representarem uma economia nova nem um gasto real (o BB aplica e resgata o mesmo saldo sozinho,
todo dia), nenhuma das duas soma no total de "Economias"/aportes do Dashboard e do painel
Investimentos (`ehMovimentoRendeFacilBB`, usada em `calcDashboard`/`detalheAportes`) — aparecem
normalmente nos Registros e no extrato da conta, só ficam fora desse total específico, do mesmo
jeito que "Uso da Reserva de Emergência" também fica.
