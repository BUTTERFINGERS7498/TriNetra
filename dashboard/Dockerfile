FROM python:3.12-slim

WORKDIR /app
COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common /app/common
COPY dashboard/server.py /app/dashboard/server.py
COPY dashboard/static /app/dashboard/static
COPY frontend/dist /app/frontend/dist
WORKDIR /app/dashboard

EXPOSE 3000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3000"]
