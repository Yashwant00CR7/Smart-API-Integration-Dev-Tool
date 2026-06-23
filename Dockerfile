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

# Pre-install typescript and ts-node globally as root for fast and offline TypeScript test executions
RUN npm install -g typescript ts-node

# Set up a new non-root user named "user" with UID 1000 for Hugging Face Spaces security compliance
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Set up working directory inside the user's home folder
WORKDIR $HOME/app

# Copy and install Python dependencies as the user
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy application assets with proper ownership
COPY --chown=user . $HOME/app

# Hugging Face Spaces always expose port 7860
EXPOSE 7860

# Run FastAPI using uvicorn (serving main:app)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

