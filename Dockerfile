FROM python:3.10-slim

# Set environment variables for Python and pip
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Create a non-root user (Required for Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY --chown=user:user . .

# Switch to the non-root user
USER user

# Expose standard port
EXPOSE 8000

# Start the server (binds to $PORT if provided, else 8000)
CMD sh -c "uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8000}"
