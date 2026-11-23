#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# tools/verify_migrations.sh
# Verifies SQL Server migrations:
#   Test (a): Apply migrations.sql to empty database (db_fresh).
#   Test (b): Re-applying migrations.sql to db_fresh causes no errors (idempotence).
#   Test (c): Applying origin/main:migrations.sql, inserting a pre-existing sample,
#             applying new migrations.sql, and asserting WorkflowMode='prescreen'
#             and all required nullability / foreign keys.
# ============================================================================

MSSQL_SA_PASSWORD="${MSSQL_SA_PASSWORD:-YourStrong!Passw0rd}"
MSSQL_HOST="${MSSQL_HOST:-localhost}"
MSSQL_PORT="${MSSQL_PORT:-1433}"

echo "=== Locating SQL Server / sqlcmd ==="

# Helper to run sqlcmd
run_sqlcmd() {
  local db="$1"
  local sql="$2"
  
  if [ -n "${CONTAINER_ID:-}" ]; then
    docker exec -i "$CONTAINER_ID" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C ${db:+-d "$db"} -Q "$sql" -b
  elif command -v sqlcmd >/dev/null 2>&1; then
    sqlcmd -S "${MSSQL_HOST},${MSSQL_PORT}" -U sa -P "$MSSQL_SA_PASSWORD" -C ${db:+-d "$db"} -Q "$sql" -b
  else
    echo "ERROR: Neither docker mssql container nor sqlcmd command found." >&2
    exit 1
  fi
}

run_sqlfile() {
  local db="$1"
  local file="$2"
  
  # Strip UTF-8 BOM if present so sqlcmd stdin doesn't fail with syntax error
  local clean_file
  clean_file=$(mktemp)
  python3 -c "import sys; content = open(sys.argv[1], 'rb').read().lstrip(b'\xef\xbb\xbf'); open(sys.argv[2], 'wb').write(content)" "$file" "$clean_file"

  if [ -n "${CONTAINER_ID:-}" ]; then
    docker exec -i "$CONTAINER_ID" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C ${db:+-d "$db"} -b < "$clean_file"
  elif command -v sqlcmd >/dev/null 2>&1; then
    sqlcmd -S "${MSSQL_HOST},${MSSQL_PORT}" -U sa -P "$MSSQL_SA_PASSWORD" -C ${db:+-d "$db"} -i "$clean_file" -b
  else
    echo "ERROR: Neither docker mssql container nor sqlcmd command found." >&2
    rm -f "$clean_file"
    exit 1
  fi
  rm -f "$clean_file"
}

# Find docker container if running
CONTAINER_ID=""
if command -v docker >/dev/null 2>&1; then
  CONTAINER_ID=$(docker ps --filter "ancestor=mcr.microsoft.com/mssql/server:2022-latest" --format "{{.ID}}" | head -n 1 || true)
fi

echo "Using CONTAINER_ID='${CONTAINER_ID}'"

# Wait for SQL Server to be healthy / responsive
echo "Waiting for SQL Server to accept connections..."
MAX_TRIES=30
SQL_READY=false
for i in $(seq 1 $MAX_TRIES); do
  if run_sqlcmd "" "SELECT 1" >/dev/null 2>&1; then
    echo "SQL Server is ready!"
    SQL_READY=true
    break
  fi
  echo "Waiting ($i/$MAX_TRIES)..."
  sleep 2
done

if [ "$SQL_READY" != true ]; then
  echo "FAIL: SQL Server did not become ready after $MAX_TRIES attempts." >&2
  exit 1
fi

# Ensure we have git origin/main fetched
git fetch origin main:refs/remotes/origin/main || true

# ----------------------------------------------------------------------------
# Test (a): Apply migrations.sql to fresh empty database
# ----------------------------------------------------------------------------
echo "=== Test (a): Applying migrations.sql to empty database (db_fresh) ==="
run_sqlcmd "" "IF DB_ID('db_fresh') IS NOT NULL DROP DATABASE db_fresh; CREATE DATABASE db_fresh;"
run_sqlfile "db_fresh" "migrations.sql"

# Check exact 17 table names
echo "Verifying exact 17 tables exist in db_fresh..."
run_sqlcmd "db_fresh" "
SET NOCOUNT ON;
DECLARE @expectedTables TABLE (TableName sysname);
INSERT INTO @expectedTables VALUES 
  ('__EFMigrationsHistory'), ('Samples'), ('AuditEvents'), ('ModelRuns'),
  ('LabOrders'), ('PartnerClinics'), ('SlotHolds'), ('DailyCheckIns'),
  ('FollowUpTasks'), ('Questionnaires'), ('ScreeningRuns'), ('SymptomLogs'),
  ('Calibrations'), ('IdempotencyKeys'), ('InboxMessages'), ('MediaAssets'),
  ('OutboxMessages');

DECLARE @tableCount INT;
SELECT @tableCount = COUNT(*) FROM sys.tables;
IF @tableCount <> 17
BEGIN
    RAISERROR('FAIL: Expected exactly 17 tables, found %d', 16, 1, @tableCount);
END;

IF EXISTS (
    SELECT TableName FROM @expectedTables
    EXCEPT
    SELECT name FROM sys.tables
)
BEGIN
    RAISERROR('FAIL: Missing expected tables in db_fresh', 16, 1);
END;

IF EXISTS (
    SELECT name FROM sys.tables
    EXCEPT
    SELECT TableName FROM @expectedTables
)
BEGIN
    RAISERROR('FAIL: Unexpected extra tables in db_fresh', 16, 1);
END;
PRINT 'All 17 exact tables verified successfully in db_fresh.';
"
echo "Test (a) PASSED."

# ----------------------------------------------------------------------------
# Test (b): Re-applying migrations.sql to db_fresh (Idempotence)
# ----------------------------------------------------------------------------
echo "=== Test (b): Re-applying migrations.sql to db_fresh (Idempotence) ==="
run_sqlfile "db_fresh" "migrations.sql"
echo "Test (b) PASSED."

# ----------------------------------------------------------------------------
# Test (c): Upgrade existing database from origin/main:migrations.sql
# ----------------------------------------------------------------------------
echo "=== Test (c): Upgrade existing database from origin/main:migrations.sql ==="
run_sqlcmd "" "IF DB_ID('db_upgrade') IS NOT NULL DROP DATABASE db_upgrade; CREATE DATABASE db_upgrade;"

# Extract origin/main:migrations.sql
TMP_MAIN_MIGRATIONS="/tmp/origin_main_migrations.sql"
git show origin/main:migrations.sql > "$TMP_MAIN_MIGRATIONS"

echo "Applying origin/main migrations to db_upgrade..."
run_sqlfile "db_upgrade" "$TMP_MAIN_MIGRATIONS"

echo "Inserting pre-existing sample row..."
run_sqlcmd "db_upgrade" "
INSERT INTO [Samples] (
    [SampleId], [CreatedAtUtc], [CreatedBy], [WorkflowVersion], [State],
    [MicronsPerPixel], [FramesPerSecond], [ChamberDepthMicrons],
    [IsLocked], [IsDeleted]
) VALUES (
    'test-upgrade-01', GETUTCDATE(), 'system', '1.0.0', 'Draft',
    0.0, 0.0, 0.0,
    0, 0
);
"

echo "Applying new migrations.sql to db_upgrade..."
run_sqlfile "db_upgrade" "migrations.sql"

echo "Asserting WorkflowMode='prescreen' on pre-existing row..."
run_sqlcmd "db_upgrade" "
SET NOCOUNT ON;
DECLARE @mode nvarchar(32);
SELECT @mode = [WorkflowMode] FROM [Samples] WHERE [SampleId] = 'test-upgrade-01';
IF @mode IS NULL OR @mode <> 'prescreen'
BEGIN
    RAISERROR('Assertion failed: WorkflowMode is NULL or not prescreen', 16, 1);
END;
PRINT 'WorkflowMode assertion verified: ' + @mode;
"

echo "Asserting physical measurement nullability on Samples..."
run_sqlcmd "db_upgrade" "
SET NOCOUNT ON;
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Samples')
      AND name IN ('MicronsPerPixel', 'FramesPerSecond', 'ChamberDepthMicrons')
      AND is_nullable = 0
)
BEGIN
    RAISERROR('Assertion failed: Sample physical measurement columns are not nullable', 16, 1);
END;
PRINT 'Sample columns nullability verified.';
"

echo "Asserting calibration columns nullability..."
run_sqlcmd "db_upgrade" "
SET NOCOUNT ON;
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Calibrations')
      AND name IN ('MeasuredPitchPx', 'MicronsPerPixel', 'LinesDetected', 'SpacingCvPct', 'ImageWidthPx', 'ImageHeightPx', 'ToolVersion')
      AND is_nullable = 0
)
BEGIN
    RAISERROR('Assertion failed: Calibration measurement columns are not nullable', 16, 1);
END;
PRINT 'Calibration columns nullability verified.';
"

echo "Asserting foreign keys..."
run_sqlcmd "db_upgrade" "
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Calibrations_Samples_SampleId')
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MediaAssets_Samples_SampleId')
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Samples_Calibrations_CalibrationId')
BEGIN
    RAISERROR('Assertion failed: Required foreign keys missing', 16, 1);
END;
PRINT 'Foreign keys verified.';
"

echo "Test (c) PASSED."
echo "=== All SQL migration verification tests PASSED successfully! ==="
