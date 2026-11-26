# syntax=docker/dockerfile:1

FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN ./mvnw -B -q -DskipTests package

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv libsndfile1 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt

RUN useradd --system --create-home --uid 10001 app \
    && mkdir -p /tmp/numba_cache \
    && chown -R app:app /tmp/numba_cache
WORKDIR /app
COPY --from=build /workspace/target/backend-*.jar /app/app.jar
COPY extract.py /app/extract.py
COPY data/songs.json /app/data/songs.json

ENV PYTHON_COMMAND=/opt/venv/bin/python \
    NUMBA_CACHE_DIR=/tmp/numba_cache \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"

USER app
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
