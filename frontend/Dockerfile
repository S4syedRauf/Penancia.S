FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATE_DIR=/var/lib/penancia
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.ts ./
COPY src/config.ts src/authConfig.ts ./src/
COPY src/server ./src/server
COPY src/services/penanciaApiClient.ts ./src/services/penanciaApiClient.ts
COPY --from=build /app/dist ./dist
RUN mkdir -p /var/lib/penancia && chown -R node:node /app /var/lib/penancia
USER node
EXPOSE 3000
CMD ["npm", "start"]
