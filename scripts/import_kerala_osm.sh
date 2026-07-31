#!/bin/bash
# =============================================================================
# scripts/import_kerala_osm.sh  (No Docker version)
#
# Imports Kerala OpenStreetMap road network into Supabase using native Mac tools.
# Prerequisites: Homebrew (brew) must be installed.
# =============================================================================

set -e

echo "======================================================"
echo " DUK Bus Tracker — Kerala Road Network Import"
echo " (No Docker Required)"
echo "======================================================"

# ── Load DATABASE_URL from .env ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../backend/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

DB_URL_RAW=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | head -1 | sed 's/DATABASE_URL=//' | tr -d '"' | tr -d "'")

# Convert asyncpg URL to standard psql URL (strip +asyncpg suffix if present)
DB_URL=$(echo "$DB_URL_RAW" | sed 's|postgresql+asyncpg://|postgresql://|')

if [ -z "$DB_URL" ]; then
    echo "ERROR: DATABASE_URL not found in .env"
    exit 1
fi

echo "[1/6] DATABASE_URL loaded. Host: $(echo "$DB_URL" | sed 's|.*@||' | sed 's|/.*||')"

# ── Step 2: Install osm2pgrouting via Homebrew ────────────────────────────────
echo "[2/6] Checking for osm2pgrouting..."
if command -v osm2pgrouting &>/dev/null; then
    echo "      osm2pgrouting already installed: $(osm2pgrouting --version 2>&1 | head -1)"
else
    echo "      Installing osm2pgrouting via Homebrew..."
    brew tap osgeo/osgeo4mac 2>/dev/null || true
    brew install osm2pgrouting
    echo "      osm2pgrouting installed."
fi

# ── Step 3: Download Kerala OSM data ─────────────────────────────────────────
WORK_DIR="$HOME/osrm_data"
mkdir -p "$WORK_DIR"
OSM_FILE="$WORK_DIR/southern-zone-260729.osm.pbf"

if [ -f "$OSM_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$OSM_FILE" 2>/dev/null || wc -c < "$OSM_FILE")
    if [ "$FILE_SIZE" -gt 10000000 ]; then   # > 10 MB means it's the real file
        echo "[3/6] Kerala OSM file already exists ($((FILE_SIZE / 1024 / 1024)) MB). Skipping download."
    else
        echo "[3/6] Existing file too small ($FILE_SIZE bytes). Re-downloading..."
        rm -f "$OSM_FILE"
    fi
fi

if [ ! -f "$OSM_FILE" ]; then
    echo "[3/6] Downloading Kerala OSM data from Geofabrik (~80 MB)..."
    curl -L --progress-bar \
        -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
        -o "$OSM_FILE" \
        "https://download.geofabrik.de/asia/india/kerala-latest.osm.pbf"

    FILE_SIZE=$(stat -f%z "$OSM_FILE" 2>/dev/null || wc -c < "$OSM_FILE")
    if [ "$FILE_SIZE" -lt 10000000 ]; then
        echo ""
        echo "ERROR: Download failed or returned wrong file ($FILE_SIZE bytes)."
        echo "Please manually download Kerala OSM from:"
        echo "  https://download.geofabrik.de/asia/india/kerala-latest.osm.pbf"
        echo "and save it to: $OSM_FILE"
        exit 1
    fi
    echo "      Download complete ($((FILE_SIZE / 1024 / 1024)) MB)."
fi

# ── Step 3.5: Crop to Trivandrum and Convert to XML ───────────────────────────
OSM_CROPPED_PBF="$WORK_DIR/trivandrum.osm.pbf"
OSM_XML_FILE="$WORK_DIR/trivandrum.osm"

if [ ! -f "$OSM_XML_FILE" ]; then
    echo "[3.5/6] Cropping map to Trivandrum & Kollam region to save DB space..."
    if ! command -v osmium &>/dev/null; then
        echo "        Installing osmium-tool..."
        brew install osmium-tool
    fi
    
    echo "        Extracting bounding box (this takes ~10 seconds)..."
    # TIGHT Bounding Box: Just Trivandrum City to Attingal (Covers DUK & Technopark)
    # This prevents the PostgreSQL WAL from exploding past the 500MB free tier limit.
    osmium extract -b 76.7,8.4,77.1,8.75 "$OSM_FILE" -o "$OSM_CROPPED_PBF" --overwrite
    
    echo "        Converting cropped map to standard .osm XML format..."
    osmium cat "$OSM_CROPPED_PBF" -o "$OSM_XML_FILE"
    echo "        Extraction complete."
else
    echo "[3.5/6] Cropped XML file already exists. Skipping extraction."
fi

# ── Step 4: Enable PostGIS + pgRouting in Supabase ────────────────────────────
echo "[4/6] Enabling PostGIS and pgRouting extensions in Supabase..."
if command -v psql &>/dev/null; then
    psql "$DB_URL" -c "
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE EXTENSION IF NOT EXISTS pgrouting;
    "
    echo "      Extensions enabled via psql."
else
    echo ""
    echo "  *** ACTION REQUIRED ***"
    echo "  psql is not installed. Please go to your Supabase SQL Editor and run:"
    echo ""
    echo "      CREATE EXTENSION IF NOT EXISTS postgis;"
    echo "      CREATE EXTENSION IF NOT EXISTS pgrouting;"
    echo ""
    read -p "  Press ENTER after running those SQL commands to continue..."
fi

# ── Step 5: Import road network using osm2pgrouting ───────────────────────────
echo "[5/6] Importing Kerala road network into Supabase..."
echo "      This will take 10-20 minutes. Please wait..."

# Extract connection components from DB_URL for osm2pgrouting CLI flags
DB_HOST=$(echo "$DB_URL" | sed 's|.*@||' | sed 's|:.*||')
DB_PORT=$(echo "$DB_URL" | sed 's|.*@[^:]*:||' | sed 's|/.*||')

# CRITICAL FIX for Supabase: 
# The pooler on port 5432 uses Transaction mode, which breaks temporary tables.
# Port 6543 uses Session mode, which keeps the connection stateful.
if [[ "$DB_HOST" == *"pooler.supabase.com"* ]] && [[ "$DB_PORT" == "5432" ]]; then
    echo "      Detected Supabase pooler on port 5432. Switching to port 6543 (Session mode) for temporary table support..."
    DB_PORT="6543"
fi
DB_NAME=$(echo "$DB_URL" | sed 's|.*/||')
DB_USER=$(echo "$DB_URL" | sed 's|postgresql://||' | sed 's|:.*||')

# Extract password and URL-decode it (e.g. %40 becomes @)
RAW_PASS=$(echo "$DB_URL" | sed 's|postgresql://[^:]*:||' | sed 's|@.*||')
# Native bash url-decoding:
DB_PASS=$(printf '%b' "${RAW_PASS//%/\\x}")

# Find the config file path dynamically (handles both Intel and Apple Silicon Macs)
BREW_PREFIX=$(brew --prefix)
CONF_FILE="$BREW_PREFIX/share/osm2pgrouting/mapconfig_for_cars.xml"

if [ ! -f "$CONF_FILE" ]; then
    echo "ERROR: Cannot find mapconfig_for_cars.xml at $CONF_FILE"
    exit 1
fi

osm2pgrouting \
    --file "$OSM_XML_FILE" \
    --host "$DB_HOST" \
    --port "$DB_PORT" \
    --dbname "$DB_NAME" \
    --username "$DB_USER" \
    --password "$DB_PASS" \
    --conf "$CONF_FILE" \
    --clean

echo "      Road network import complete."

# ── Step 6: Create GIST spatial indexes + backfill geometry columns ───────────
echo "[6/6] Creating GIST indexes and backfilling geometry columns..."
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    -- Spatial index on road geometries (speeds up nearest-road queries 100x)
    CREATE INDEX IF NOT EXISTS idx_ways_geom
        ON ways USING GIST(the_geom);

    -- Spatial index on road intersection nodes
    CREATE INDEX IF NOT EXISTS idx_ways_vertices_geom
        ON ways_vertices_pgr USING GIST(the_geom);

    -- Backfill PostGIS geometry for existing GPS logs
    UPDATE gps_logs
    SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
    WHERE lon IS NOT NULL AND lat IS NOT NULL AND location IS NULL;

    -- Backfill PostGIS geometry for existing bus stops
    UPDATE bus_stops
    SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
    WHERE lon IS NOT NULL AND lat IS NOT NULL AND location IS NULL;

    SELECT 'Ways imported: ' || COUNT(*) FROM ways;
"

echo ""
echo "======================================================"
echo " Import COMPLETE!"
echo " Your database now has the full Kerala road network."
echo " Map matching and real road-distance push notifications"
echo " will now activate automatically in the DUK Bus Tracker!"
echo "======================================================"
