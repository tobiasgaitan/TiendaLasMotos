#!/bin/bash
# deploy-local.sh
# 
# 🚀 MANUAL ESCAPE HATCH FOR DEPLOYMENT
# This script builds the image LOCALLY (in your Cloud Shell) and pushes it to GCR,
# bypassing the automated Cloud Build triggers that are failing.

# Exit immediately if a command exits with a non-zero status
set -e

echo "========================================================"
echo "🚀 STARTING LOCAL BUILD & DEPLOY PIPELINE"
echo "========================================================"

# 1. Get Project ID from gcloud config
PROJECT_ID=$(gcloud config get-value project)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Could not determine Project ID."
  echo "Please run: gcloud config set project [YOUR_PROJECT_ID]"
  exit 1
fi

echo "📍 Configured Project ID: $PROJECT_ID"

# Define Image URL (Google Container Registry)
IMAGE_NAME="gcr.io/$PROJECT_ID/tiendalasmotos-web:latest"

# 2. Configure Docker to authenticate with GCR
echo "🔑 Configuring Docker authentication for GCR..."
gcloud auth configure-docker --quiet

# 3. Build Docker Image
echo "🔨 Building Docker image locally (using Dockerfile & Node 20)..."
# This runs 'npm run build' INSIDE the container, in a clean Node 20 env
docker build --platform linux/amd64 -t "$IMAGE_NAME" .

# 4. Push Image to Registry
echo "⬆️ Pushing image to Google Container Registry..."
docker push "$IMAGE_NAME"

# 5. Deploy to Cloud Run
echo "🚀 Deploying service [tiendalasmotos-web] to Cloud Run..."
gcloud run deploy tiendalasmotos-web \
  --image "$IMAGE_NAME" \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi

echo "========================================================"
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "========================================================"
