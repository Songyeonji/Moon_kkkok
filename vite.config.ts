import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' → GitHub Pages / 하위 경로 배포에서도 자산 경로가 깨지지 않음
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 새 버전이 배포되면 서비스워커가 알아서 교체된다.
      // 예약 앱 특성상 낡은 화면이 남아 있는 편이 더 위험하므로 수동 확인을 두지 않는다.
      registerType: 'autoUpdate',
      // 아이콘/이미지는 오프라인에서도 UI가 깨지지 않도록 미리 캐시한다.
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'topbar-icon.png', 'loading-coach.png'],
      manifest: {
        name: '문콕의 레슨일정',
        short_name: '문콕레슨',
        description: '레슨 시간 예약/관리 웹앱',
        lang: 'ko',
        // 상대 경로 → 루트 배포(Vercel)와 하위 경로 배포(GitHub Pages) 양쪽에서 동작
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#e11d48',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸(JS/CSS/HTML)만 프리캐시. 설치 아이콘은 브라우저가 필요할 때 받아간다.
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Pretendard 웹폰트 CDN — 한 번 받으면 오프라인에서도 글꼴이 유지된다.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pretendard-font',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Apps Script(예약 데이터) 요청은 runtimeCaching 에 없으므로 항상 네트워크로만 나간다.
        // 예약 현황이 캐시된 낡은 값으로 보이면 안 되기 때문이다.
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});
