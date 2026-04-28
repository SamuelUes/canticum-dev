# Bruin Phase 2 (Orquestación de métricas y destacados)

Este módulo vive **fuera** de `functions/` y `frontend/` y se despliega como **Cloud Run Job**.

## Objetivo

Orquestar agregaciones periódicas en Cloud SQL para:

- `songs.total_views`
- `songs.like_count`
- `songs.popularity`
- `artists.total_views`
- `artists.like_count`
- `artists.popularity`
- snapshots de destacados (`featured_song_snapshots`)

## Instalación local de Bruin (Windows, opcional)

Si te sale `pipx`/`pip` not recognized, primero instala Python:

```powershell
winget install -e --id Python.Python.3.11
```

Cierra y vuelve a abrir PowerShell, luego:

```powershell
python -m pip install --upgrade pip
python -m pip install bruin
python -m bruin --help
```

Opcional con `pipx` (si ya lo tienes):

```powershell
pipx install bruin
```

> Nota: para el deploy en Cloud Run de este repo, **no necesitas Bruin local**. El Job ejecuta scripts SQL con `psql` dentro del contenedor.

Si falla con error de `lxml` en Python 3.11/Windows (build wheel), tienes dos opciones:

1. **Recomendada en este repo:** no instalar Bruin localmente y desplegar directo con `bruin/deploy-cloud-run.ps1`.
2. Instalar Python 3.10 (suele tener mejor compatibilidad con wheels antiguas) y reintentar instalación local.

Para este proyecto, la orquestación corre con SQL + `psql` dentro del Job, así que el bloqueo de `pip install bruin` local no impide el despliegue.

## Variables de entorno requeridas

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Ejecución local rápida

```bash
psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD sslmode=require" -f bruin/sql/00_phase2_schema.sql
psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD sslmode=require" -f bruin/sql/10_refresh_song_artist_metrics.sql
psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD sslmode=require" -f bruin/sql/20_refresh_featured_snapshots.sql
```

## Deploy en Cloud Run Job

Usa `bruin/deploy-cloud-run.ps1`.

> Nota: `firebase.json` no controla Cloud Run Jobs; se despliega con `gcloud run jobs`.

## Trigger de Cloud Build (manual, recomendado)

Archivo de build usado por el trigger: `cloudbuild.bruin.yaml` (en la raíz del repo).

### Configuración exacta del trigger

- Tipo: `Archivo de configuración de Cloud Build (YAML o JSON)`
- Ubicación: `Repositorio`
- Archivo de configuración: `cloudbuild.bruin.yaml`
- Evento: `Enviar a una rama`
- Rama (regex): `^main$`
- Filtro de archivos incluidos (glob): `bruin/**`
- Región del trigger: `us-central1`

### Cuenta de servicio del trigger

Si tu organización obliga SA personalizada, selecciona una SA dedicada de build (ej. `bruin-build@...`).

Roles mínimos sugeridos para esa SA:

- `Artifact Registry Writer`
- `Logs Writer`
- `Cloud Build Service Account` (o permisos equivalentes de ejecución de build según políticas de tu org)

### Logging obligatorio (para evitar el error de build.service_account)

El archivo `cloudbuild.bruin.yaml` ya incluye:

```yaml
options:
  logging: CLOUD_LOGGING_ONLY
```

Con eso no necesitas configurar `logs_bucket` manualmente.

### Resultado esperado del trigger

Publica estas imágenes:

- `us-central1-docker.pkg.dev/$PROJECT_ID/canticum-jobs/canticum-bruin-phase2:$COMMIT_SHA`
- `us-central1-docker.pkg.dev/$PROJECT_ID/canticum-jobs/canticum-bruin-phase2:latest`
