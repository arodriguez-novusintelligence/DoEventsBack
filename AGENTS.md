# DoEventsBack — instrucciones para agentes (Claude Code y Codex)

<!-- Generado por DoEventsCICD/agentes/agentes-sync. Edita agentes/comun.md o agentes/repos/DoEventsBack.md, no este archivo. -->

Backend serverless de Do.Events. Cada carpeta de servicio (`aws-lambda-*`, `aws-lamda-*`, `aws-global-websocket-gateway`, `events-lifecycle-manager`, …) es un proyecto de Serverless Framework que puede declarar varias funciones Lambda, con DynamoDB y S3.

- No todos los servicios tienen archivo por ambiente (`serverless.dev.yml`, `serverless.qa.yml`); revisa la región que resuelve el archivo antes de desplegar (ver Reglas de seguridad).
- Rama por defecto de este remoto: `feature/DoEventsBack-Nadf` (el README menciona `develop`, que no existe aquí).
- Pruebas: dentro de la carpeta del servicio que cambiaste.

## Ecosistema Do.Events

Repos hermanos en `~/Projects/Novus/DoEvents/`:

| Repo | Qué es |
|---|---|
| DoEventsBack | Backend serverless: Lambdas + DynamoDB + S3, Serverless Framework |
| DoEventsWEB | App web React 18 + TypeScript + Vite (UI portada desde Lovable) |
| DoEventsIA | Asistente conversacional (`/ai/*`) sobre la API de Anthropic |
| DoEventsCICD | Orquestación CI/CD (DSF): Lovable → empalme → gates → AWS DEV |
| DoEventsFront | App móvil legada React Native / Expo (migrada a DoEventsWEB) |
| DoEventsPaginaWeb | Landing page (Vite) |

Un cambio de contrato (endpoints, payloads, nombres de tablas) en un repo suele romper otro: revisa el consumidor antes de cambiarlo.

## Ambientes AWS (cuenta 519010577666)

| Ambiente | Región | Web | API | Sufijo de recursos |
|---|---|---|---|---|
| DEV | `sa-east-1` | dev.doeventsapp.com | api-dev / ws-dev | `-dev` |
| QA | `us-east-2` | qa.doeventsapp.com | api-qa | `-qa` |
| PROD | `us-west-1` | web.doeventsapp.com | api / ws | tablas sin sufijo; Lambdas y buckets `-prod` |
| Legado | `us-east-1` | — | — | Lambdas dev/qa antiguas y La Polla Futbolera. No desplegar aquí. |

Excepción: los certificados ACM de CloudFront de cualquier ambiente viven en `us-east-1` (lo exige AWS).

## Reglas de seguridad (obligatorias)

- El AWS CLI local tiene permisos de **administrador**. Usa solo comandos de lectura (`list`, `get`, `describe`) salvo que el usuario pida explícitamente modificar algo.
- Antes de desplegar, confirma qué región resuelve el archivo que vas a usar (`npx serverless print --config <archivo-del-ambiente> --stage <stage>`, con los mismos argumentos que usarás para desplegar) y que coincide con la tabla de ambientes. Usa el archivo del ambiente (`serverless.dev.yml`, `serverless.qa.yml`, `serverless.prod.yml`) cuando exista. Muchos `serverless.yml` base apuntan a `us-east-1` (legado) y algunos a otra región, así que no asumas nada.
- **PROD** solo se despliega si el usuario escribe exactamente `autorizado deploy PROD` (ver `DoEventsCICD/docs/PLAN_DESPLIEGUE_PROD_US_WEST_1.md`).
- Nunca hagas commit de secretos (`.env`, `*.secrets.ps1`, llaves de Wompi, AWS o Anthropic).
- No hagas push, merge ni despliegues sin que el usuario lo pida.

## Trabajo en paralelo Claude Code + Codex (revisión cruzada)

Claude Code y Codex trabajan sobre estos repos y se revisan el uno al otro en los cambios importantes.

Las reglas y los scripts viven versionados en `DoEventsCICD/agentes/`. **No edites este `AGENTS.md` a mano:** edita `agentes/comun.md` (lo común) o `agentes/repos/<repo>.md` (lo de cada repo) y corre `agentes-sync`.

### Carpetas de trabajo

```
~/Projects/Novus/DoEvents/
├── DoEventsIA/, DoEventsBack/, …   ← checkouts principales: el usuario y Claude en trabajo normal
└── .agentes/                       ← worktrees de los agentes (fuera de los repos y del workspace)
    ├── codex/<repo>-<slug>/        ← rama codex/<slug>
    └── claude/<repo>-<slug>/       ← rama claude/<slug>, solo en modo paralelo
```

- **Trabajo normal:** Claude trabaja en el checkout principal, en una rama `feature/...` o `fix/...`.
- **Modo paralelo** (cuando el usuario pide que los dos trabajen a la vez): cada agente usa su worktree en `.agentes/`, así el checkout principal del usuario no cambia de rama.
  - Codex: `codex-tarea <slug> "<tarea>"` (Claude se lo delega).
  - Claude: `agente-worktree claude <slug>`.
- **Limpieza:** `agentes-limpiar` muestra los worktrees cuya rama ya se unió; `agentes-limpiar --si` los borra.

1. **Reparto.**
   - Los dos agentes **no tocan los mismos archivos**. Antes de editar, revisa qué toca la otra rama: sus commits (`git diff <base>...<otra-rama> --name-only`) y sus cambios sin commit en el checkout del otro agente (ubícalo con `git worktree list` y corre `git -C <ese-checkout> status --short`). Si coinciden, detente y avísale al usuario.
   - `<base>` es la rama por defecto del repo (`git symbolic-ref --short refs/remotes/origin/HEAD`). Los scripts la usan por defecto.
2. **Revisión cruzada en cambios importantes.** El agente autor la corre por iniciativa propia, sin esperar a que el usuario la pida, antes de dar el trabajo por terminado cuando el cambio:
   - va a un PR, a un merge o a un despliegue (DEV, QA o PROD);
   - toca pagos (Wompi, órdenes, liquidaciones, reembolsos), autenticación o permisos (Cognito, JWT, autorizadores, roles), infraestructura o CI/CD (`serverless*.yml`, IAM, workflows, DoEventsCICD) o datos en DynamoDB (esquemas, migraciones, borrados);
   - cambia un contrato entre repos (endpoints, payloads, nombres de tablas).
   En cambios menores (textos, estilos, documentación, refactors locales con pruebas) no se corre, salvo que el usuario la pida. Si hay duda, se corre.

   El otro agente revisa en solo lectura:
   - Trabajo de Claude → `revision-cruzada codex [base]`.
   - Trabajo de Codex → `revision-cruzada claude [base]` (desde el worktree de Codex).
   - Revisan los commits de la rama y también los cambios sin commit.
   - Los informes quedan en `.git/revision-cruzada/` (no se versionan).
   - **Si eres Codex:** `revision-cruzada claude` necesita la sesión de Claude Code, que el sandbox no deja leer. Ejecútalo pidiendo aprobación para correr fuera del sandbox. Si no se puede, no lo des por hecho: termina diciéndole al usuario «pídele a Claude que revise la rama `<rama>`». No uses `codex-tarea`; ese comando es solo para que Claude te delegue tareas.
3. **Ajustes.** El autor de la rama corrige cada hallazgo real del revisor. Si rechaza un hallazgo, deja la razón con evidencia (prueba, código o documentación), no solo una opinión. Después de corregir, se vuelve a correr la revisión.
4. **Límite.** Máximo 2 rondas de revisión por rama. Lo que siga en desacuerdo después de eso lo decide el usuario.
5. **Unir.** Solo cuando ambas revisiones no tienen hallazgos altos o medios pendientes, las pruebas pasan y el usuario aprueba. El agente informa qué encontró cada revisor, qué se corrigió y qué se descartó.

## Convenciones

- Commits convencionales en español con alcance del repo, por ejemplo `feat(ia): ...` o `fix(back): ...`.
- Responde y documenta en español.
