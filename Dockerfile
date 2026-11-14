FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts

EXPOSE 3000
CMD ["npm", "start"]
