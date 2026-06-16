# Use an official lightweight Python image
FROM python:3.11-slim

# Set environment variables to prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy just the requirements first to leverage Docker caching
COPY requirements.txt .

# Install your Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and force it to download Chromium AND its Linux system dependencies
RUN pip install playwright && playwright install --with-deps chromium

# Copy the rest of your application code
COPY . .

# Start your Python application
# Note: Cloud Run requires your app to listen on the port provided by the $PORT environment variable
CMD ["python", "api/main.py"]
