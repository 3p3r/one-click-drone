FROM python:alpine
RUN apk -uv add --no-cache groff jq less && \
  pip install --no-cache-dir awscli
CMD sh
