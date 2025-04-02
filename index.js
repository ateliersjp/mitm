// from: http://book.mixu.net/node/ch10.html

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');

function encodeHost(hostname) {
  return `${hostname.replace(/[^g-z]/ig, (char) => {
    return char.charCodeAt(0).toString(16);
  })}.${process.env.HOST}`;
}

function decodeHost(hostname,
hash) {
  return hash.replace(/[0-9a-f]{2}/ig, (hex) => {
    return String.fromCharCode(parseInt(hex, 16));
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

const encodedHostRegExp = new RegExp(`\\b([a-z0-9]+)\\.${process.env.HOST.replaceAll('.', '\\.')}\\b`, 'ig');

const setCookieDomainRegExp = /domain\=[^;]+/g;

http.createServer((sreq, sres) => {
  deepReplace(sreq.headers, encodedHostRegExp, decodeHost);

  sreq.setTimeout(1000);
  sreq.on('timeout', abort);
  sreq.on('error', abort);
  sres.on('error', abort);

  const proto = sreq.headers['x-forwarded-proto'] ?? 'https';
  const [ hostname ] = sreq.headers.host.split(':', 1);
  const proxyUrl = `${proto}://${hostname}${sreq.url ?? '/'}`;

  sreq.headers.host = sreq.headers['cf-worker'] ?? process.env.WORKER_HOST;
  const url = `https://${sreq.headers.host}/proxy?proxyUrl=${encodeURIComponent(proxyUrl)}`;

  const creq = https.request(url, {
    method: sreq.method,
    headers: sreq.headers,
  }, (cres) => {
    if ('set-cookie' in cres.headers && Array.isArray(cres.headers['set-cookie'])) {
      deepReplace(cres.headers['set-cookie'], setCookieDomainRegExp, `domain=.${process.env.HOST}`);
    }

    if ('access-control-allow-origin' in cres.headers) {
      cres.headers['access-control-allow-origin'] = '*';
    }

    cres.on('error', abort);

    // passthrough status code and headers
    sres.writeHead(cres.statusCode, cres.headers);
    cres.pipe(sres);
  });

  creq.setTimeout(1000);
  creq.on('timeout', abort);
  creq.on('error', abort);

  sreq.pipe(creq);
}).listen(8080, '0.0.0.0', () => {
  console.log('http server is listening on port 8080.');
});
