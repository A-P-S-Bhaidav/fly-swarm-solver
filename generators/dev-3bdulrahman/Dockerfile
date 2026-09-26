# Dockerfile for Dev-3bdulrahman/Laravel-Captcha
# Types: image, math, text, slider — with easy/medium/hard difficulty
FROM php:8.3-cli-alpine

RUN apk add --no-cache \
        curl git zip unzip libpng-dev libjpeg-turbo-dev freetype-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install gd pdo pdo_mysql

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

RUN git clone https://github.com/Dev-3bdulrahman/Laravel-Captcha.git . \
    && composer install --no-interaction --no-dev --prefer-dist

COPY api_wrapper/ /var/www/api_wrapper/

EXPOSE 8000
CMD ["php", "-S", "0.0.0.0:8000", "-t", "api_wrapper"]
