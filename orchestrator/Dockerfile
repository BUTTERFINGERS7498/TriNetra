FROM python:3.12-slim

WORKDIR /app
COPY orchestrator/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common /app/common
COPY orchestrator /app/orchestrator
COPY config /app/config

CMD ["python", "-m", "orchestrator.main"]
