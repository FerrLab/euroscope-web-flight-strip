# Production backend image: self-contained, no bind mount required at
# deploy time. Companion to frankenphp.Dockerfile (the dev-only image that
# docker-compose bind-mounts source into) — do not conflate the two; this
# one COPIES the app and installs dependencies at build time so the built
# image is immutable and complete on its own.
FROM dunglas/frankenphp:1-php8.3-alpine AS base

RUN apk add --no-cache \
        bash \
        git \
        unzip \
        icu-dev \
        libpq-dev \
        libzip-dev \
        oniguruma-dev \
        postgresql-client \
        $PHPIZE_DEPS \
    && install-php-extensions \
        intl \
        opcache \
        pcntl \
        pdo_pgsql \
        pgsql \
        redis \
        zip \
        bcmath \
        sockets \
    && rm -rf /var/cache/apk/*

COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

COPY infra/docker/php.ini /usr/local/etc/php/conf.d/zz-eurostrip.ini

WORKDIR /app

# Composer deps first, so this layer only invalidates when they change —
# not on every application-code edit.
COPY apps/backend/composer.json apps/backend/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --optimize-autoloader

# Now the application itself. --optimize-autoloader in the deps-only layer
# above ran before app/ existed, so its classmap is missing every App\*
# class — regenerate it now that the app is present. --no-scripts skips
# Laravel's package:discover post-autoload-dump hook, which boots the
# framework (needs a real .env/APP_KEY, deliberately not baked into this
# image) — package discovery happens naturally the first time the app
# actually boots at runtime instead.
COPY apps/backend/ ./
# Bash brace expansion ({a,b,c}) does NOT work here — Docker's shell-form
# RUN uses /bin/sh (BusyBox ash on this base image), not bash, regardless
# of bash being installed above; write every path out explicitly instead
# of relying on it (a {a,b,c}-literal directory silently getting created
# instead of the real ones is exactly what broke this the first time).
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/testing storage/framework/views storage/logs bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache \
    && composer dump-autoload --optimize --no-dev --no-scripts

# Filament ships its CSS/JS/fonts as vendor assets that composer's
# post-autoload-dump hook (filament:upgrade) normally publishes into
# public/ — skipped above along with the rest of that hook. Publish them
# explicitly instead, now that storage/framework exists to boot against.
RUN php artisan filament:assets --no-interaction

COPY infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000 8443 2019

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["php", "artisan", "octane:start", "--server=frankenphp", "--host=0.0.0.0", "--port=8000"]
