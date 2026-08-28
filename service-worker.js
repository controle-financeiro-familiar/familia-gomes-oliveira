/* Service Worker do Controle Financeiro Familiar (PWA — itens 11 e 12 do requisito).
   Responsabilidades: permitir que a interface (HTML/CSS/JS/ícones) carregue offline, e atualizar o cache
   de forma controlada, sem nunca deixar uma versão parcialmente atualizada em uso.

   IMPORTANTE: este service worker NUNCA intercepta requisições para fora da própria origem (Microsoft
   Graph, login.microsoftonline.com, CDNs de bibliotecas) — só lida com os arquivos estáticos do próprio
   app. Isso evita armazenar tokens de acesso ou respostas do Graph no cache HTTP (item 12), e garante que
   a autenticação/sincronização com o OneDrive nunca passe por aqui: sempre vai direto à rede. */
const CACHE_VERSAO = 'financeiro-familiar-v4'; // v4: nome exibido na tela inicial ajustado para "FinUs" (manifest.webmanifest) — versão bumped para invalidar o cache antigo do manifest (mesma URL, conteúdo novo)
const ARQUIVOS_APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSAO).then(cache => cache.addAll(ARQUIVOS_APP_SHELL))
    // Sem self.skipWaiting() aqui de propósito — o novo Service Worker fica "waiting" até o usuário
    // confirmar a atualização (ver mensagem SKIP_WAITING abaixo), para nunca trocar os arquivos estáticos
    // no meio de uma sessão em uso sem o usuário saber.
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes => Promise.all(
      nomes.filter(nome => nome !== CACHE_VERSAO).map(nome => caches.delete(nome))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if(event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return; // nunca intercepta POST/PUT/DELETE (gravações no Graph, etc.)
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // nunca intercepta Graph/MSAL/CDNs — sempre direto à rede

  // HTML (navegação/index.html): network-first — prioriza sempre a versão mais nova quando online, e só
  // cai para o cache quando realmente não há conexão (evita servir uma versão desatualizada por engano
  // enquanto há Internet disponível).
  if(req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/' || url.pathname.endsWith('/')){
    event.respondWith(
      fetch(req).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_VERSAO).then(cache => cache.put(req, copia));
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Demais arquivos estáticos do próprio app (manifest, ícones): cache-first, com atualização em segundo
  // plano (stale-while-revalidate) — carrega rápido mesmo offline, e se atualiza sozinho quando possível.
  event.respondWith(
    caches.match(req).then(cached => {
      const buscaRede = fetch(req).then(resp => {
        caches.open(CACHE_VERSAO).then(cache => cache.put(req, resp.clone()));
        return resp;
      }).catch(() => cached);
      return cached || buscaRede;
    })
  );
});
