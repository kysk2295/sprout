# Railway용 PowerSync — 설정 파일(service.yaml·sync-config.yaml)을 이미지에 넣는다(compose는 폴더를 붙였다)
FROM journeyapps/powersync-service:latest
COPY server/powersync/ /config/
ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
CMD ["start", "-r", "unified"]
