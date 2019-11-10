# leave this here for dependabot
FROM drone/drone:1
# leave this here for dependabot
FROM drone/drone-runner-docker:1
# using this for dist uploading
FROM python:alpine
RUN apk -uv add --no-cache groff jq less && \
  pip install --no-cache-dir awscli
CMD sh
