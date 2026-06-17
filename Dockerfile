# Use Microsoft's official Playwright image (matches your playwright==1.41.0 version)
# This comes pre-packaged with Python, Chromium, and all Linux dependencies.
FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

# Set environment variables to prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy just the requirements first to leverage Docker caching
COPY requirements.txt .

# Install your Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Start your Python application
CMD uvicorn api.main:app --host 0.0.0.0 --port $PORT