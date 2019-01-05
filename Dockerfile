FROM node:8

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Bundle app source
COPY . /usr/src/app

ENV SRV_PORT=3000
ENV MONGO_STRING="mongodb://drejahl:t2ebeutel@cluster0-shard-00-00-hmohb.mongodb.net:27017,cluster0-shard-00-01-hmohb.mongodb.net:27017,cluster0-shard-00-02-hmohb.mongodb.net:27017/test?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin"
ENV MONGO_DB_NAME=test

# Install app dependencies
RUN npm prune --production && npm install --production

EXPOSE 3000

# ENTRYPOINT ["/usr/local/bin/node", "app.js"]
CMD node app.js
