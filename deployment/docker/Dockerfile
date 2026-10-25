FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir -e .
EXPOSE 8000  # Render overrides with $PORT at runtime; the app binds 0.0.0.0:$PORT when set.
CMD ["python", "-m", "ai_bridge.control"]
