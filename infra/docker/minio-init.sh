#!/usr/bin/env sh
set -e

until /usr/bin/mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  echo "Waiting for MinIO..."
  sleep 1
done

if ! /usr/bin/mc ls local/"${AZIMUTH_S3_BUCKET}" >/dev/null 2>&1; then
  /usr/bin/mc mb local/"${AZIMUTH_S3_BUCKET}"
  /usr/bin/mc anonymous set download local/"${AZIMUTH_S3_BUCKET}"
  echo "Bucket ${AZIMUTH_S3_BUCKET} created"
else
  echo "Bucket ${AZIMUTH_S3_BUCKET} already exists"
fi
