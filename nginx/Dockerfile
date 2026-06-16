# ---------------------------------------------------------------------------
# STP Frontend — nginx serving static files + reverse proxy to backend
# ---------------------------------------------------------------------------
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy static frontend files
COPY qi-webapp/ /usr/share/nginx/html/

EXPOSE 80

# nginx alpine image runs as nginx user by default via its entrypoint
CMD ["nginx", "-g", "daemon off;"]
