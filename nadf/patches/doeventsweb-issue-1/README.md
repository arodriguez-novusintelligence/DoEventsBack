# Parche DoEventsWEB — Issue #1 Descubre eventos cercanos

El agente cloud no tiene permisos de push sobre `DoEventsWEB`. Aplicar en ese repo:

```bash
cd DoEventsWEB
git checkout -b cursor/fix-descubre-eventos-cercanos-9c96
git am nadf/patches/doeventsweb-issue-1/*.patch
# o copiar el patch desde DoEventsBack tras merge
npm run build
```

Archivos tocados:
- `packages/shared/src/lib/userLocation.ts`
- `packages/shared/src/api/eventsService.ts`
- `packages/shared/src/types/events.ts`
- `packages/shell/src/pages/EventsPage.tsx`
