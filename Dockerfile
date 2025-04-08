FROM bitnami/node:latest

COPY . /app
RUN npm install

CMD ["npm", "start"]
