# Pruebas de Zyntra

**Fecha:** 5 de noviembre de 2026
**Entorno:** toda la app levantada con `docker compose up --build` (en `src/`), Windows 11, PowerShell 5.1.
**URL base:** `http://localhost:8080/api` (nginx del frontend → gateway → microservicios).

> El gateway no se publica en el host; dentro de Docker se entra siempre por el puerto 8080.

## Resultados

| # | Prueba | Petición | Esperado | Obtenido | ✔ |
|---|--------|----------|----------|----------|---|
| 1a | Registro correcto | `POST /auth/register` (ander@test.com) | Token | `201 Created` + `token` + `user` | ✅ |
| 1b | Email repetido | Mismo `POST /auth/register` | `409 Conflict` | `409` — "Ese email ya está registrado" | ✅ |
| 2 | Contraseña corta | `POST /auth/register` con `password="123"` | `400 Bad Request` | `400` — "La contraseña debe tener al menos 8 caracteres" | ✅ |
| 3 | Login con contraseña incorrecta | `POST /auth/login` | `401 Unauthorized` | `401` — "Credenciales incorrectas" | ✅ |
| 4 | Favoritos sin token | `GET /users/me/favorites` sin cabecera | `401` | `401` — "Token requerido" | ✅ |
| 5a | Usuario A guarda un evento | `POST /users/me/favorites` `{event_id:1, status:"planned"}` | Favorito creado | `201` — evento 1 (Rosalía) con `status: planned` | ✅ |
| 5b | A ve su favorito | `GET /users/me/favorites` (token A) | 1 favorito | 1 favorito | ✅ |
| 5c | Usuario B se registra | `POST /auth/register` (segundo@test.com) | Token | `201` + `token` | ✅ |
| 5d | B no ve los favoritos de A | `GET /users/me/favorites` (token B) | Lista vacía | `[]` | ✅ |

### Pruebas extra

| Prueba | Esperado | Obtenido | ✔ |
|--------|----------|----------|---|
| Guardar un evento que no existe (`event_id: 999999`) | `404` | `404` — "Evento no encontrado" | ✅ |
| `status` no válido (`"loquesea"`) | `400` | `400` — "status debe ser uno de: saved, planned" | ✅ |
| Token falso (`Bearer abc.def.ghi`) | `401` | `401` — "Token inválido o caducado" | ✅ |
| Ticketmaster con clave falsa | Respuesta desde caché | Eventos con `"source": "cache"` | ✅ |
| `docker compose down -v` y volver a levantar | Arranca desde cero y funciona | Tablas recreadas, flujo completo OK | ✅ |

### Prueba visual

Web abierta en una ventana normal y otra de incógnito con dos cuentas distintas: cada una ve solo sus conciertos en **My concerts**.

## Cómo repetirlas

```powershell
$base = "http://localhost:8080/api"

# 1. Registro correcto y email repetido (la 2.ª vez → 409)
$u1 = @{name="Ander"; email="ander@test.com"; password="supersecret1"} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/auth/register" -ContentType "application/json" -Body $u1

# 2. Contraseña corta → 400
$bad = @{name="Test"; email="otro@test.com"; password="123"} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/auth/register" -ContentType "application/json" -Body $bad

# 3. Login con contraseña incorrecta → 401
$wrong = @{email="ander@test.com"; password="incorrecta123"} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body $wrong

# 4. Favoritos sin token → 401
Invoke-RestMethod -Uri "$base/users/me/favorites"

# 5. Dos usuarios, cada uno ve solo lo suyo
Invoke-RestMethod "$base/events" | Out-Null   # asegura que existen eventos
$loginA = @{email="ander@test.com"; password="supersecret1"} | ConvertTo-Json
$a = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body $loginA
$hA = @{Authorization = "Bearer $($a.token)"}
$fav = @{event_id=1; status="planned"} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/users/me/favorites" -Headers $hA -ContentType "application/json" -Body $fav
Invoke-RestMethod -Uri "$base/users/me/favorites" -Headers $hA     # 1 favorito

$ub = @{name="Segundo"; email="segundo@test.com"; password="supersecret2"} | ConvertTo-Json
$b = Invoke-RestMethod -Method Post -Uri "$base/auth/register" -ContentType "application/json" -Body $ub
$hB = @{Authorization = "Bearer $($b.token)"}
Invoke-RestMethod -Uri "$base/users/me/favorites" -Headers $hB     # vacío
```

> **Nota PowerShell 5.1:** una respuesta vacía (`[]`) se muestra como nada, y `@(...).Count` puede dar 1 en vez de 0. Para contar bien: `@(Invoke-RestMethod ... | ForEach-Object { $_ }).Count`.

## API de favoritos

| Método | Ruta | Cuerpo | Descripción |
|--------|------|--------|-------------|
| `GET` | `/users/me/favorites` | — | Lista los favoritos del usuario |
| `POST` | `/users/me/favorites` | `{event_id, status?}` | Añade (o actualiza) un favorito. `status`: `saved` (por defecto) o `planned` (en la agenda) |
| `PATCH` | `/users/me/favorites/:eventId` | `{status}` | Cambia el estado |
| `DELETE` | `/users/me/favorites/:eventId` | — | Quita el favorito |
