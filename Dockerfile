# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.18.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV="production"

# Build stage
FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json ./
RUN npm install
COPY . .

# Final stage
FROM base
COPY --from=build /app /app

# Fly will route to this port, and your app should match it
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
