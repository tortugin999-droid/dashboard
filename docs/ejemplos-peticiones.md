# Ejemplos de peticiones — Mi Balance API

Base URL en desarrollo: `http://localhost:3000/api/v1` (el puerto lo define `PORT` en `.env`; ten en cuenta que una variable de entorno `PORT` del sistema tiene prioridad sobre `.env`).

## Flujo de autenticación (obligatorio para toda petición que modifica datos)

1. `GET /auth/csrf` → el servidor emite la cookie `mb_csrf` (double-submit firmado con HMAC) y devuelve el token en el cuerpo.
2. `POST /auth/login` (o `/auth/register`) → el servidor emite la cookie de sesión `mb_session` (HttpOnly).
3. Toda petición posterior que modifique datos (`POST`, `PATCH`, `DELETE`) debe enviar:
   - las cookies (`Cookie: mb_session=...; mb_csrf=...`),
   - la cabecera `X-CSRF-Token` con **exactamente el mismo valor** que devolvió `GET /auth/csrf`.
4. Las peticiones `GET` solo necesitan la cookie de sesión.

Con `curl` usa un archivo de cookies para conservarlas entre llamadas:

```bash
BASE=http://localhost:3111/api/v1
JAR=/tmp/mb-cookies.txt

# 1) Token CSRF
CSRF=$(curl -s -c "$JAR" "$BASE/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
echo "csrf: $CSRF"

# 2) Login (crea la cookie mb_session)
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"demo@mibalance.local","password":"demo-password-2026"}'

# 3) Crear una cuenta (envía cookie + CSRF)
curl -s -b "$JAR" -X POST "$BASE/accounts" \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Banco ahorro","type":"BANK","currency":"USD","initialBalance":"500.00","initialBalanceDate":"2026-01-01"}'
```

Sin `X-CSRF-Token` (o con uno que no coincida con la cookie) obtendrás `403 FORBIDDEN`.

## Ejemplos por recurso

```bash
# Transacción (la moneda se deriva de la cuenta; el importe es cadena decimal positiva)
curl -s -b "$JAR" -X POST "$BASE/transactions" \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"accountId":"<id-cuenta>","categoryId":"<id-categoria>","type":"INCOME","amount":"1250.00","date":"2026-11-13","description":"Sueldo"}'

# Listado con filtros y paginación
curl -s -b "$JAR" "$BASE/transactions?page=1&pageSize=20&from=2026-11-01&to=2026-11-30&currency=USD&type=EXPENSE&search=supe"

# Transferencia atómica entre cuentas de la misma moneda (idempotente)
curl -s -b "$JAR" -X POST "$BASE/transfers" \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -H 'Idempotency-Key: tr-2026-11-13-001' \
  -d '{"fromAccountId":"<id-origen>","toAccountId":"<id-destino>","amount":"100.00","date":"2026-11-13","description":"Ahorro mensual"}'

# Pago parcial de una obligación (idempotente)
curl -s -b "$JAR" -X POST "$BASE/obligations/<id-obligacion>/payments" \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -H 'Idempotency-Key: pay-ob-001' \
  -d '{"accountId":"<id-cuenta>","amount":"50.00","date":"2026-11-13"}'

# Dashboard (moneda explícita; nunca se suman monedas distintas)
curl -s -b "$JAR" "$BASE/dashboard?currency=USD&from=2026-11-01&to=2026-11-30&commitmentsThrough=2026-11-30"

# Reportes
curl -s -b "$JAR" "$BASE/reports/cash-flow?currency=USD&from=2026-11-01&to=2026-11-30"
curl -s -b "$JAR" "$BASE/reports/expenses-by-category?currency=USD&from=2026-11-01&to=2026-11-30"
curl -s -b "$JAR" "$BASE/reports/budget-performance?currency=USD"

# Cierre de sesión
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/auth/logout" -H "X-CSRF-Token: $CSRF"
```

Respuesta exitosa de recurso (`{data}`), colección (`{data, meta}`) y error:

```json
{ "data": { "id": "ckx...", "name": "Banco principal", "currentBalance": "1200.00" } }
```

```json
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 3 } }
```

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "amount debe tener el formato 0.00", "details": { "amount": [ "amount debe tener el formato 0.00" ] } } }
```

`DELETE /transactions/:id` responde `204` sin cuerpo.

## Script Node ejecutable de punta a punta

Requiere Node 22 (fetch nativo). Ejecútalo con el servidor levantado (`npm run start:dev` en otra terminal):

```bash
node docs/ejemplo-e2e.mjs
```

Crea un usuario nuevo con sufijo aleatorio, cuentas, categoría, transacción, transferencia idempotente, obligación con pago parcial y consulta el dashboard. Debe terminar imprimiendo `E2E OK`.

El script completo está en [`docs/ejemplo-e2e.mjs`](ejemplo-e2e.mjs).
