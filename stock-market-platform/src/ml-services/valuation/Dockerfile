FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN useradd --create-home --uid 1001 mluser
USER mluser
EXPOSE 3015
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3015"]
