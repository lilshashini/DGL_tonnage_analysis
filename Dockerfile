# =============================================================================
# STAGE 1: Build the Next.js frontend into static HTML/JS/CSS files
# =============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Copy package files first for caching
COPY frontend/package.json frontend/package-lock.json ./

# Install Node dependencies
RUN npm ci

# Copy all frontend source code
COPY frontend/ ./

# Set API URL to empty string so the frontend uses relative URLs
# (same host serves both frontend and backend on Cloud Run)
ENV NEXT_PUBLIC_API_URL=""

# Build and export as static HTML
RUN npm run build

# The static output will be in /frontend/out
# =============================================================================
# STAGE 2: Python backend (FastAPI + Playwright) that also serves the frontend
# =============================================================================
FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Python application code
COPY api/ ./api/
COPY utilities/ ./utilities/
COPY templates/ ./templates/

# Copy the compiled Next.js static export from Stage 1
# FastAPI will serve this from /app/frontend_build
COPY --from=frontend-builder /frontend/out ./frontend_build

# Expose port (Cloud Run uses $PORT, default 8080)
EXPOSE 8080

# Start the FastAPI server
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}