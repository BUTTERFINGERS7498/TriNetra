FROM openresty/openresty:alpine

# The gateway writes the shadow traffic log here (mounted to ./logs).
RUN mkdir -p /var/log/defender

COPY nginx/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY nginx/lua /etc/nginx/lua

EXPOSE 8080
# The base image's CMD starts OpenResty with the config above.
