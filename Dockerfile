FROM bitnami/node:latest

COPY . /app
RUN npm install

EXPOSE 8080
CMD ["npm", "start"]
