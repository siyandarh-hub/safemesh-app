FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3847
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY frontend ./frontend
# Leaflet is shipped in frontend/vendor and Tailwind is pre-built (frontend/tailwind.css); nothing is downloaded at build time
RUN mkdir -p data
EXPOSE 3847
CMD ["node", "backend/index.js"]
