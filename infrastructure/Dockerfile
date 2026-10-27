FROM node:24-bookworm-slim AS editor
WORKDIR /build
COPY frontend/admin/package*.json ./
RUN npm ci
COPY frontend/admin/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3004 MEDIA_ROOT=/app/backend/storage/media
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node frontend/ ./frontend/
COPY --from=editor --chown=node:node /build/editor.bundle.js ./frontend/admin/editor.bundle.js
RUN mkdir -p /app/backend/storage/media && chown -R node:node /app/backend/storage
USER node
EXPOSE 3004
HEALTHCHECK --interval=20s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3004/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","backend/platform.js"]

