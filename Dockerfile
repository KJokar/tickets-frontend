FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
ARG AUTH_BACKEND_ORIGIN=http://api:8080
ARG NEXT_PUBLIC_CDN_ORIGIN=http://localhost:5083
ARG NEXT_PUBLIC_API_ORIGIN=
ENV AUTH_BACKEND_ORIGIN=$AUTH_BACKEND_ORIGIN
ENV NEXT_PUBLIC_CDN_ORIGIN=$NEXT_PUBLIC_CDN_ORIGIN
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
