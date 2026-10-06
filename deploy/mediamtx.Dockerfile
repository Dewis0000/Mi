# Образ MediaMTX с curl — нужен хуку, который отправляет записи сеансов в API
FROM bluenviron/mediamtx:latest-ffmpeg
RUN apk add --no-cache curl
