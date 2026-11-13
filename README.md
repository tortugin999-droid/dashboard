# Mi Balance — Backend

Backend funcional de **Mi Balance**, una aplicación de finanzas personales de uso individual: ingresos, gastos, obligaciones, presupuestos, deudas y metas de ahorro.

- **Stack**: Node.js 20/22 (LTS), NestJS 11, TypeScript 5 (modo `strict`), PostgreSQL, Prisma ORM 6, API REST + Swagger/OpenAPI, validación de DTO con `class-validator`.
- **Arquitectura**: monolito modular (sin microservicios). PostgreSQL real como almacenamiento (nunca en memoria).
- **Contrato**: prefijo `/api/v1`, JSON, identificadores como cadenas, dinero como cadenas decimales (`"1250.00"`), fechas financieras `YYYY-MM-DD`, instantes ISO 8601 UTC.

## Ejecución rápida (desarrollo)

```bash
npm install
cp .env.example .env          # ajusta lo que necesites
npm run db:up                 # PostgreSQL embebido (puerto 5433) para desarrollo local
npm run migrate               # aplica migraciones (prisma migrate deploy)
npm run seed                  # usuario demo idempotente (solo desarrollo)
npm run start:dev             # API en http://localhost:3000 (Swagger en /api/docs)
```

Credenciales demo (configurables en `.env`): `demo@mibalance.local` / `demo-password-2026`.

> **Nota sobre PostgreSQL**: el sandbox/entorno de desarrollo no permite instalar servicios del sistema, por eso `npm run db:up` usa el paquete npm `embedded-postgres` (binarios reales de PostgreSQL 17 sin root, datos en `.pgdata/`). **En producción usa un PostgreSQL normal** y define `DATABASE_URL`; no necesitas `embedded-postgres`.

## Producción

```bash
npm ci
npm run build
DATABASE_URL="postgresql://usuario:clave@host:5432/mibalance?schema=public" \
NODE_ENV=production CSRF_SECRET="$(openssl rand -base64 32)" PORT=3000 \
npm run migrate && npm start
```

Variables de entorno (ver `.env.example`, sin secretos reales):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (obligatoria). |
| `NODE_ENV` | `production` activa cookie `Secure`. |
| `PORT` | Puerto HTTP (3000). |
| `CSRF_SECRET` | Secreto HMAC de la cookie CSRF. **Obligatorio en producción.** |
| `ALLOWED_ORIGINS` | Vacío = solo mismo sitio (recomendado, proxy `/api`). Si el frontend vive en otro origen, lista explícita separada por comas con `credentials: true`. |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_DAYS` | Nombre y duración de sesión. |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | Solo para el seed de desarrollo. |

**Paso pendiente documentado**: no hay proveedor de correo configurado, por lo que **la recuperación de contraseña NO está implementada** (no se simula). Para habilitarla, configura un proveedor SMTP/API y añade tokens de restablecimiento.

## Pruebas

```bash
npm run test:unit   # unitarias: fechas de recurrencia, dinero decimal, reglas de insights (21 tests)
npm run test:e2e    # integración HTTP contra PostgreSQL real (20 tests, levanta su propia BD efímera)
npm run verify      # build + unitarias
```

Las e2e cubren: aislamiento entre usuarios, precisión decimal, transferencias sin duplicar ingresos, transferencias entre monedas rechazadas, pagos parciales, sobrepago rechazado, idempotencia (repetición idéntica y choque de clave), generación recurrente idempotente, meses cortos y día 31, cada-14-días vs dos-veces-al-mes, desembolso de préstamo sin inflar ingresos, abonos de deuda con intereses/cargos separados, reservas de ahorro, monedas sin suma implícita, presupuestos, formato de errores, paginación y protección CSRF.

Resultado de la última ejecución en este entorno: **21/21 unitarias y 20/20 e2e en verde**.

## Autenticación y CSRF (flujo exacto)

1. `GET /api/v1/auth/csrf` → devuelve `{ "data": { "csrfToken": "token.firma" } }` y fija la cookie **`mb_csrf`** (no HttpOnly, `SameSite=Lax`, firmada con HMAC-SHA256 usando `CSRF_SECRET`).
2. `POST /api/v1/auth/register` o `/auth/login` con cabecera `X-CSRF-Token: <csrfToken>` → al éxito fija la cookie de sesión **`mb_session`** (HttpOnly, `SameSite=Lax`, `Secure` en producción, 30 días).
3. Cada petición posterior lleva cookies de sesión; las que modifican datos (`POST/PATCH/DELETE`) llevan además `X-CSRF-Token` igual al valor de la cookie `mb_csrf` (double-submit firmado). Si la cookie y el token no coinciden → `403`.
4. `GET /api/v1/auth/me` consulta la sesión; `POST /api/v1/auth/logout` la revoca en base de datos y limpia la cookie.
5. Las sesiones son filas `Session` (hash SHA-256 del token), revocables y con expiración.
6. Rate limiting: 10 req/min en `register`/`login`, 300 req/min global.

Despliegue recomendado: frontend y API bajo el **mismo sitio** (proxy `/api` → API). Con `ALLOWED_ORIGINS` vacío no se emiten cabeceras CORS. Si usas orígenes separados, decláralos explícitamente; nunca se combina `credentials: true` con comodín `*`.

Las respuestas JSON nunca incluyen contraseñas, hashes ni tokens de sesión. Los errores de login son genéricos (`Credenciales inválidas.`) para no revelar si un correo existe.

## Modelo de datos y convenciones

- **Dinero**: `Prisma.Decimal` sobre `NUMERIC(19,4)`; tasas `NUMERIC(9,6)`. En JSON, cadenas con 2 decimales (`"1250.00"`). Nunca float binario.
- **Fechas de calendario**: `DATE` de PostgreSQL, expuestas como `YYYY-MM-DD` (UTC). **Instantes**: `timestamptz`, ISO 8601 UTC.
- **Moneda**: ISO 4217 (`CHAR(3)`); cada usuario tiene moneda principal y zona horaria (`User.mainCurrency`, `User.timezone`). Los reportes se filtran por moneda; **no hay conversiones implícitas ni tasas automáticas**.
- **Saldo inicial**: `initialBalance` es el saldo de la cuenta en `initialBalanceDate`; solo cuentan los movimientos con `date >= initialBalanceDate`. Crear un movimiento anterior a esa fecha se rechaza con 400 (evita doble conteo).
- **Sin borrados destructivos**: cuentas y categorías se **archivan** (`PATCH ... {"archived": true}`). Un movimiento vinculado a transferencia, pago de obligación o abono de deuda **no se puede eliminar** (403); uno suelto sí (204).

### Programación vs obligación vs pago

- `Recurrence` = programación (p. ej. "alquiler mensual"). `PATCH /recurrences/:id` afecta **solo a ocurrencias futuras**: no modifica obligaciones ya generadas ni movimientos pagados.
- `Obligation` = ocurrencia concreta generada o manual, con estados `PENDING`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`. `overdue` **se deriva** de `dueDate` + importe pendiente (nunca queda desactualizado).
- `ObligationPayment` + `Transaction` = pago real (parcial permitido, sobrepago rechazado 409, atómico e idempotente).
- Generación: `POST /recurrences/:id/generate {"through": "YYYY-MM-DD"}` y `POST /recurrences/generate-all`. Idempotente: la restricción única `(recurrenceId, dueDate)` impide duplicar la misma ocurrencia.
- Frecuencias: `ONCE`, `WEEKLY`, `EVERY_TWO_WEEKS` (14 días naturales desde el ancla), `TWICE_MONTHLY` (dos días del mes; el segundo puede omitirse = último día del mes) y `MONTHLY`. Los días 29/30/31 en meses cortos usan el **último día válido** (31 ene → 28/29 feb).

### Deudas

- `I_OWE` (debo) vs `OWED_TO_ME` (me deben), capital original y pendiente, acreedor/deudor, vencimiento, cuotas y tasa informativa.
- Desembolso (`disbursementAccountId`, solo `I_OWE`): crea un movimiento `LOAN_DISBURSEMENT` que **aumenta el saldo de la cuenta pero no es ingreso ganado**.
- Abono (`POST /debts/:id/payments`): capital reduce la deuda; **intereses y cargos se registran por separado** y solo ellos cuentan como gasto en el dashboard. No hay amortización automática: el calendario de cuotas es manual (sin tasa/periodicidad/método definidos, no se inventa uno).

### Ahorros

- `SavingsGoal` con `SavingsAllocation` (asignaciones). Una reserva es **virtual**: suma a `savedAmount`, reduce el "disponible después de compromisos" pero **no es un gasto ni mueve cuentas**, por lo que no se descuenta dos veces. `reservedSavings` = Σ pendiente por ahorrar de metas activas en la moneda.

## Idempotencia

`POST /transfers`, `POST /obligations/:id/payments` y `POST /debts/:id/payments` aceptan cabecera `Idempotency-Key`. Se guarda por usuario y operación con el hash del cuerpo: repetición idéntica devuelve la respuesta original sin duplicar movimientos; la misma clave con cuerpo distinto devuelve `409`.

## Dashboard y reportes

`GET /api/v1/dashboard?from&to&currency&accountId&commitmentsThrough` (por defecto: mes actual en la zona horaria del usuario). Devuelve `summary` (ingresos recibidos, gastos pagados, resultado del período, saldo actual, obligaciones pendientes hasta `commitmentsThrough`, reservas activas, disponible después de compromisos), `balanceSeries`, `incomeExpenseSeries`, `expensesByCategory`, `budgetProgress`, `upcomingObligations`, `debtSummary` e `insights`. Referencias de fecha: `asOf` (instante) y `balanceAsOf` (día del saldo actual); el saldo al cierre del período está en `GET /reports/cash-flow` como `closingBalanceAtPeriodEnd` — **no se mezclan**.

- Resultado operativo (ingresos − gastos) ≠ flujo total de caja: los préstamos afectan caja sin ser ingreso.
- Una obligación pagada deja de restarse como pendiente (pendiente = importe − pagado).

`GET /reports/cash-flow`, `GET /reports/expenses-by-category`, `GET /reports/budget-performance?month&currency`.

### Recomendaciones automáticas (reglas transparentes, sin IA)

`OBLIGATION_EXCEEDS_BALANCE`, `BUDGET_EXCEEDED`, `BUDGET_NEAR_LIMIT`, `DUE_SOON`, `SPENDING_INCREASE` (solo compara períodos completos; si no, emite `INCOMPLETE_COMPARISON`), `PROJECTION_SHORTFALL`. Cada insight incluye `id`, `ruleCode`, `severity`, `title`, `message`, `period` y `evidence` numérica. Son observaciones aritméticas: **no califican gastos de "innecesarios" ni constituyen asesoramiento financiero profesional**.

## Swagger y contrato

- Swagger UI: `http://localhost:3000/api/docs`.
- `openapi.json` generado con `npm run openapi` (33 rutas) — contrato definitivo para el frontend.

## Estructura

```
src/
  common/        # guards (sesión, CSRF), filtros, interceptor {data}, Decimal, saldos, idempotencia
  modules/
    auth/ settings/ health/
    accounts/ categories/ transactions/ transfers/
    recurrences/ obligations/ budgets/ debts/ savings/
    dashboard/ reports/      # insights.rules.ts = reglas puras y testeables
prisma/          # schema.prisma, migraciones, seed idempotente
test/unit        # pruebas unitarias
test/e2e         # pruebas de integración (PostgreSQL efímero)
scripts/         # dev-db.mjs (PostgreSQL embebido), generate-openapi.ts
```

## Ejemplos de peticiones

Ver [`docs/ejemplos-peticiones.md`](docs/ejemplos-peticiones.md) (incluye ejemplos `curl` y [`docs/ejemplo-e2e.mjs`](docs/ejemplo-e2e.mjs), un script Node ejecutable de punta a punta).

## Estado honesto de implementación

**Implementado y comprobado por pruebas automáticas**: registro/login/logout/me, CSRF, cookie de sesión persistente y revocable, rate limit, cuentas con saldo y archivado, categorías, transacciones (ingresos/gastos) con validación de referencias entre usuarios, transferencias atómicas misma moneda con idempotencia, recurrencias (5 frecuencias, meses cortos, generación idempotente), obligaciones con pagos parciales atómicos y rechazo de sobrepago, presupuestos, deudas con desembolso y abonos (capital/intereses/cargos), metas y reservas, dashboard completo, 3 reportes, reglas de insights, paginación, límite de cuerpo (100 kB), índices en columnas de filtrado, errores `{error:{code,message,details}}` y `DELETE` 204.

**Pendiente / no implementado (documentado, no simulado)**:
- Recuperación de contraseña por correo (no hay proveedor configurado).
- Transferencias entre monedas distintas (requiere conversión explícita; hoy se rechazan con error claro).
- Tasas de cambio automáticas y conversiones implícitas en reportes (los reportes se filtran por moneda).
- Amortización automática de deudas (interés/periodicidad/método no definidos; calendario manual).
- Cambio de contraseña, 2FA, OAuth.
- Notificaciones/alertas push.
- Exportación de datos.
- Despliegue real verificado en la nube (las instrucciones de arriba son estándar NestJS/Prisma; un despliegue a producción requiere credenciales que este entorno no tiene).

## Lista de funciones por módulo

| Módulo | Endpoints |
|---|---|
| Salud | `GET /health` |
| Auth | `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Configuración | `GET /settings`, `PATCH /settings` |
| Cuentas | `GET/POST /accounts`, `PATCH /accounts/:id` |
| Categorías | `GET/POST /categories`, `PATCH /categories/:id` |
| Movimientos | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/:id` |
| Transferencias | `POST /transfers` |
| Recurrencias | `GET/POST /recurrences`, `PATCH /recurrences/:id`, `POST /recurrences/:id/generate`, `POST /recurrences/generate-all` |
| Obligaciones | `GET/POST /obligations`, `PATCH /obligations/:id`, `POST /obligations/:id/payments` |
| Presupuestos | `GET/POST /budgets`, `PATCH /budgets/:id` |
| Deudas | `GET/POST /debts`, `GET/PATCH /debts/:id`, `POST /debts/:id/payments` |
| Ahorros | `GET/POST /savings-goals`, `PATCH /savings-goals/:id`, `POST /savings-goals/:id/allocations`, `GET /savings-goals/:id/allocations` |
| Dashboard/reportes | `GET /dashboard`, `GET /reports/cash-flow`, `GET /reports/expenses-by-category`, `GET /reports/budget-performance` |
