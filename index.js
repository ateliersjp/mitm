// from: http://book.mixu.net/node/ch10.html

'use strict';

const fs = require('fs');
const _ = require('lodash');
_.http = require('http');
_.https = require('https');

function encodeHost(hostname) {
  return hostname.replace(/[^g-z]/ig, (_, offset) => {
    return hostname.charCodeAt(offset).toString(16);
  });
}

function decodeHost(_, hostname) {
  return hostname.replace(/[0-9a-f]{2}/ig, (match) => {
    return String.fromCharCode(parseInt(match, 16));
  });
}

function deepReplace(obj, before, after) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      obj[k] = v.replace(before, after);
    } else if (typeof v === 'object') {
      deepReplace(v, before, after);
    }
  }
}

function abort(err) {
  if (err instanceof Error) {
    console.error(err);
  }

  this.destroy();
}

const encodedHostRegExp = new RegExp(`\\b([a-z0-9]+)\\.${_.escapeRegExp(process.env.HOST)}\\b`, 'ig');

const cachedHostRegExp = new Map();

function createHostRegExp(host) {
  const [ hostname ] = host.split(':', 1);
  const root = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
  const cache = cachedHostRegExp.get(root)?.deref();

  if (cache) {
    return cache;
  }

  const pattern = `\\b${_.escapeRegExp(root)}\\b`;
  const re = new RegExp(`\\b[a-z0-9.-]+\\.${pattern}|${pattern}`, 'ig');
  cachedHostRegExp.set(root, new WeakRef(re));

  return re;
}

function createServer(protocol, port, opts) {
  _[protocol].createServer(opts, function(sreq, sres) {
    if (protocol === 'https') {
      sreq.headers.host = sreq.socket.servername;
    }

    deepReplace(sreq.headers, encodedHostRegExp, decodeHost);

    sreq.on('error', abort);
    sres.on('error', abort);

    const proxyUrl = `${protocol}://${sreq.headers.host}${sreq.url ?? '/'}`;

    if (sreq.headers['cf-worker']) {
      sreq.headers.host = sreq.headers['cf-worker'];
      delete sreq.headers['cf-worker'];
    } else {
      sreq.headers.host = process.env.WORKER_HOST;
    }

    const url = `https://${sreq.headers.host}/proxy?proxyUrl=${encodeURIComponent(proxyUrl)}`;

    const creq = _.https.request(url, {
      method: sreq.method,
      headers: sreq.headers,
    }, (cres) => {
      deepReplace(cres.headers, createHostRegExp(sreq.headers.host), encodeHost);

      cres.on('error', abort);

      // passthrough status code and headers
      sres.writeHead(cres.statusCode, cres.headers);
      cres.pipe(sres);
    });

    creq.setTimeout(1000);
    creq.on('timeout', abort);
    creq.on('error', abort);

    sreq.pipe(creq);
  }).listen(port, '0.0.0.0', () => {
    console.log(`${protocol} server is listening on port ${port}.`);
  });
}

createServer('https', 443, {
  key: fs.readFileSync(`/etc/letsencrypt/live/${process.env.HOST}/privkey.pem`),
  cert: fs.readFileSync(`/etc/letsencrypt/live/${process.env.HOST}/fullchain.pem`),
});

createServer('http', 80, {});
