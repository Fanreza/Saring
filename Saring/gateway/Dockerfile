# Gateway Saring (Go). Biner statis tanpa CGO, image akhir tanpa shell.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /gateway . \
 && mkdir -p /data && chown 65532:65532 /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /gateway /gateway
# folder data dimiliki user nonroot (65532) agar volume baru bisa ditulisi
COPY --from=build --chown=65532:65532 /data /data
ENV ADDR=:8787 DB=/data/saring.db
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/gateway"]
