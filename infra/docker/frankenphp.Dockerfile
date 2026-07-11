FROM dunglas/frankenphp:1-php8.3-alpine AS base

# System deps for PHP extensions + tools
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

# Composer
COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

# PHP ini overrides
COPY infra/docker/php.ini /usr/local/etc/php/conf.d/zz-eurostrip.ini

WORKDIR /app

# Entrypoint
COPY infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000 8443 2019

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["php", "artisan", "octane:start", "--server=frankenphp", "--host=0.0.0.0", "--port=8000"]
