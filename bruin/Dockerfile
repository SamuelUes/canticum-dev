FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY bruin /app/bruin

RUN chmod +x /app/bruin/entrypoint.sh

ENTRYPOINT ["/app/bruin/entrypoint.sh"]
