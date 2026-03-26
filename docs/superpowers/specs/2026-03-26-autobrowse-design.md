# AutoBrowse - Local Browser Agent

**Date:** 2026-03-26
**Status:** Approved

## 1. Vision

Desktop app instalable que corre un runtime local para automatizar tareas web, expuesta mediante API local en localhost:3847. Cloud backend opcional para licencias, fleet management y telemetría.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoBrowse Desktop App                   │
├─────────────────────────────────────────────────────────────┤
│  Electron Shell                                             │
│  ├─ UI (Next.js) - Config, status, logs                   │
│  └─ Updater                                                 │
├─────────────────────────────────────────────────────────────┤
│  Local Runtime (Node.js)                                   │
│  ├─ API Server (Fastify) :3847                             │
│  ├─ Task Queue (Bull)                                      │
│  ├─ Worker Pool                                            │
│  ├─ Browser Manager                                       │
│  └─ Session Store                                          │
├─────────────────────────────────────────────────────────────┤
│  Browser Automation Layer (Playwright)                     │
├─────────────────────────────────────────────────────────────┤
│  Local DB (SQLite - better-sqlite3)                        │
└─────────────────────────────────────────────────────────────┘

[Optional Cloud Backend]
  ├─ Licencias
  ├─ Fleet Management
  ├─ Telemetría
  └─ Remote Dispatch
```

## 3. Components

### 3.1 Desktop Shell (Electron + Next.js)
- Instalación y configuración
- Onboarding inicial
- UI para ver estado del agente
- Login opcional al cloud
- Logs básicos
- Auto-updater

### 3.2 Local Runtime
- **API Server (Fastify):** Endpoints para tareas, sesiones, config, health
- **Task Queue (Bull):** Cola local con priority support
- **Worker:** Consume tareas, interpreta instrucciones, ejecuta browser actions
- **Browser Manager:** Abre/reutiliza/cierra navegadores
- **Session Store:** Persiste perfiles (cookies, localStorage, estado)

### 3.3 Browser Automation Layer (Playwright)
- Chromium embebido
- Perfiles persistentes
- Acciones: open_url, click, type, select, scroll, wait, extract_text, download, screenshot, confirm_state

### 3.4 Cloud Backend (Opcional)
- API de licencias
- Fleet management
- Telemetría
- Remote dispatch de tareas

## 4. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /tasks | Crear tarea |
| GET | /tasks/:id | Ver estado de tarea |
| POST | /tasks/:id/cancel | Cancelar tarea |
| GET | /tasks | Listar tareas (con filtros) |
| DELETE | /tasks/:id | Eliminar tarea |
| GET | /sessions | Listar perfiles |
| POST | /sessions | Crear nuevo perfil |
| POST | /sessions/:id/reset | Resetear sesión |
| DELETE | /sessions/:id | Eliminar perfil |
| GET | /health | Health check |
| GET | /config | Ver configuración |
| PATCH | /config | Actualizar configuración |
| GET | /agents | Info del agente local |
| POST | /webhooks/task-completed | Webhook para notify completion |

## 5. Data Model (SQLite)

### tasks
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | UUID |
| agent_id | TEXT | Agent identifier |
| instruction | TEXT | Natural language instruction |
| payload | TEXT | JSON payload (optional) |
| status | TEXT | pending/running/completed/failed/cancelled |
| priority | INTEGER | 0=low, 1=normal, 2=high |
| attempts | INTEGER | Retry count |
| session_id | TEXT | Session used |
| created_at | TEXT | ISO timestamp |
| started_at | TEXT | ISO timestamp |
| finished_at | TEXT | ISO timestamp |
| result | TEXT | JSON result |
| error | TEXT | Error message if failed |

### task_events
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | UUID |
| task_id | TEXT | FK to tasks |
| step | INTEGER | Step number |
| event_type | TEXT | action/log/error/screenshot |
| message | TEXT | Description |
| screenshot_path | TEXT | Path to screenshot |
| created_at | TEXT | ISO timestamp |

### sessions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | UUID |
| agent_id | TEXT | Agent identifier |
| name | TEXT | Session name |
| profile_path | TEXT | Browser profile path |
| created_at | TEXT | ISO timestamp |
| last_used | TEXT | ISO timestamp |

### agents
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | UUID |
| name | TEXT | Agent name |
| machine_name | TEXT | Hostname |
| status | TEXT | online/busy/offline |
| last_seen_at | TEXT | ISO timestamp |
| profile_path | TEXT | Default browser profile |

### config
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Config key |
| value | TEXT | Config value |

## 6. Execution Flow

```
1. External System → POST /tasks
2. API Server → Validate → Save to DB → Add to Queue
3. Worker ← Pop task from queue
4. Browser Manager ← Get/Allocate session
5. Interpreter ← Parse instruction to actions
6. Playwright ← Execute actions
7. For each step:
   - Save event to DB
   - Take screenshot (optional)
   - Check timeout/cancellation
8. Worker → Update task status → Save result/error
9. API Server → Return response to caller
10. (Optional) Webhook → Notify completion
```

## 7. Security

- **Whitelist de dominios:** Configurable, por defecto permitir todo
- **Timeout por tarea:** Default 5 min, configurable
- **Retry:** Max 3 intentos, configurable
- **Acciones sensibles:** Bloqueadas por defecto (pagos, delete, password changes)
- **Screenshot por hitos:** Automático en cada acción

## 8. Configuration

| Key | Default | Description |
|-----|---------|-------------|
| port | 3847 | API port |
| browser.headless | false | Run browser in headless mode |
| browser.profilePath | ./profiles | Default profile directory |
| task.timeout | 300000 | Task timeout in ms |
| task.maxRetries | 3 | Max retry attempts |
| domain.whitelist | * | Allowed domains (comma-separated) |
| log.level | info | Log level |
| cloud.enabled | false | Enable cloud sync |
| cloud.url | | Cloud backend URL |

## 9. Acceptance Criteria

- [ ] Se instala como una sola app de escritorio
- [ ] Expone API funcional en localhost:3847
- [ ] Recibe tareas desde sistemas externos
- [ ] Ejecuta navegador localmente
- [ ] Persiste sesiones entre tareas
- [ ] Devuelve estados y resultados
- [ ] Deja trazabilidad (logs, events, screenshots)
- [ ] Opera sin cloud
- [ ] Puede conectarse a cloud opcional

## 10. Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop | Electron + Next.js |
| Language | TypeScript |
| API | Fastify |
| Queue | Bull |
| Browser | Playwright |
| Database | better-sqlite3 |
| Logging | Pino |

## 11. Non-Goals (V1)

- No LLM local embebido
- No extensión de navegador como producto principal
- No servidor cloud como dependencia
- No automatización de sitios con captcha complejo