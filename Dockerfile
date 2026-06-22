# Start with a slim Python base image
FROM python:3.11-slim

# Install system dependencies (Node.js, Go, Java JDK, and compilation tools)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
    git \
    golang \
    default-jdk \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /code

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application assets
COPY . .

# Hugging Face Spaces always expose port 7860
EXPOSE 7860

# Run FastAPI using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
