# Parche DoEventsWEB — Issue #10 Eventos cercanos en Descubre

Aplicar en `DoEventsWEB` sobre `feature/NovusAIDevelopmentFramework`:

```bash
cd DoEventsWEB
git checkout -b cursor/fix-descubre-eventos-cercanos-issue-10-d75e
git am /path/to/DoEventsBack/nadf/patches/doeventsweb-issue-10/*.patch
npm run build
node scripts/smoke-discover-marketplace.mjs
```

Archivos tocados (solo entidad **eventos**):

- `packages/shared/src/api/eventsService.ts` — `fechaFin`, alias `userId`, fallback `apiRequest` en cercanos
- `packages/shared/src/lib/userLocation.ts` — geolocalización silenciosa con permiso concedido
- `packages/shared/src/types/events.ts` — tipo `fechaFin`
- `packages/shell/src/pages/EventsPage.tsx` — no saltar red si caché tiene `nearby` vacío con ubicación

Requiere deploy previo de `aws-lambda-eventsFeed` en DEV (CORS + filtros geo).
