#!/usr/bin/env bash
# Penancia.S — deploy infra/main.bicep to Azure.
#
# infra/parameters.json is the SINGLE source of truth for deployment
# parameters (location, prefix, environment). This script passes NO parameters
# inline; it reads the values from parameters.json and hands the file itself
# to `az deployment group create`. To change the target, edit
# infra/parameters.json — never this script.
#
# Expected values in parameters.json: location "uaenorth", prefix "penancias".
# After deployment, fill the three Key Vault secrets (they are deployed with
# the placeholder value '<FILL-IN-VIA-KEY-VAULT>') before the apps can start:
#   sql-connection-string, function-storage-connection-string,
#   app-insights-connection-string
# Also build the Api image from the repo-root Dockerfile and push it to ACR
# before deploy, or the Api Container App will fail to start.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARAMETERS_FILE="${SCRIPT_DIR}/parameters.json"

# Ensure azure-cli in ~/.azure-cli or ~/.local/bin is in PATH
export PATH="$HOME/.local/bin:$HOME/.azure-cli/bin:$PATH"

# Check az CLI
if ! command -v az &>/dev/null; then
    echo "ERROR: Azure CLI ('az') is not installed or not in PATH."
    exit 1
fi

# Read deployment parameters from parameters.json (single source of truth).
# python3 is used for JSON parsing; it ships with macOS developer tooling.
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 is required to read ${PARAMETERS_FILE}."
    exit 1
fi
if [ ! -f "${PARAMETERS_FILE}" ]; then
    echo "ERROR: parameters file not found: ${PARAMETERS_FILE}"
    exit 1
fi
LOCATION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["parameters"]["location"]["value"])' "${PARAMETERS_FILE}")"
PREFIX="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["parameters"]["prefix"]["value"])' "${PARAMETERS_FILE}")"
ENV="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["parameters"]["environment"]["value"])' "${PARAMETERS_FILE}")"
RG="rg-${PREFIX}-${ENV}"

echo "================================================================="
echo " Deploying Penancia.S Stage S1 Foundation to Azure"
echo " Parameters file: ${PARAMETERS_FILE}"
echo " Resource Group : ${RG}"
echo " Location       : ${LOCATION}"
echo " Prefix         : ${PREFIX}"
echo " Environment    : ${ENV}"
echo "================================================================="

echo "Verifying Azure authentication..."
az account show --output table

echo "Creating Resource Group '${RG}' in '${LOCATION}'..."
az group create --name "${RG}" --location "${LOCATION}" --output table

echo "Deploying Bicep template with parameters from ${PARAMETERS_FILE}..."
az deployment group create \
    --resource-group "${RG}" \
    --template-file "${SCRIPT_DIR}/main.bicep" \
    --parameters @"${PARAMETERS_FILE}" \
    --output table

echo "================================================================="
echo " Stage S1 Deployment Succeeded!"
echo " Outputs available in Resource Group: ${RG}"
echo " Next: fill the Key Vault placeholder secrets (see header of this"
echo " script) and push the Api image to ACR if not already done."
echo "================================================================="
