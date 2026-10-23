FROM python:3.12-slim

WORKDIR /app
COPY gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Shared state helpers + gateway code.
COPY common /app/common
COPY gateway /app/gateway
WORKDIR /app/gateway

EXPOSE 8080
CMD ["uvicorn", "proxy:app", "--host", "0.0.0.0", "--port", "8080"]
