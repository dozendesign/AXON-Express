const CACHE_NAME = 'axon-merchant-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // بيمرر الطلبات عادي جداً للنت عشان دايماً يجيب أحدث داتا من الفايربيز
    event.respondWith(fetch(event.request));
});
