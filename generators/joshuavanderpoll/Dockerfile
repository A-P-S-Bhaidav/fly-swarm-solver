# Dockerfile for joshuavanderpoll/laravel-captchas
# Types: broken_circle, scatter, rotate, slider, grid, tiles
FROM php:8.3-cli-alpine

RUN apk add --no-cache \
        curl git zip unzip libpng-dev libjpeg-turbo-dev freetype-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install gd pdo pdo_mysql

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Clone and install the captcha package
RUN git clone https://github.com/joshuavanderpoll/laravel-captchas.git . \
    && composer install --no-interaction --no-dev --prefer-dist

# Copy our thin API wrapper (routes + controller) that exposes
# GET /generate?type=<type>&difficulty=<easy|medium|hard>
# GET /health
COPY api_wrapper/ /var/www/api_wrapper/

EXPOSE 8000
CMD ["php", "-S", "0.0.0.0:8000", "-t", "api_wrapper"]
