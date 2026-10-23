FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# A baked-in copy is used only if no source is mounted at /app/code.
COPY app.py /app/app.py

# The app actually runs from /app/code, which docker-compose mounts to the
# fork (shadow) or the deployed copy (prod). --reload picks up patches the
# fixer writes without a container restart (hot reload for Python services).
CMD ["sh", "-c", "mkdir -p /app/code && [ -f /app/code/app.py ] || cp /app/app.py /app/code/app.py; exec uvicorn app:app --app-dir /app/code --host 0.0.0.0 --port 8000 --reload --reload-dir /app/code"]
