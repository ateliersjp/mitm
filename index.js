// from: http://book.mixu.net/node/ch10.html

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const replaceStream = require('replacestream');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');

function deepReplace(obj, before, after) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      obj[k] = v.replaceAll(before, after);
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

const hostRegExp = '.' + process.env.HOST;

const domainRegExp = /\bdomain\=[^;]+/ig;

http.createServer((sreq, sres) => {
  sreq.setTimeout(1000);
  sreq.on('timeout', abort);
  sreq.on('error', abort);
  sres.on('error', abort);

  const { origin } = ((referer) => {
    return new URL(referer);
  } catch {
    return {};
  })(sreq.headers.origin ?? sreq.headers.referer);

  deepReplace(sreq.headers, hostRegExp, '');

  const opts = {
    path: sreq.url,
    method: sreq.method,
    headers: sreq.headers,
  };

  try {
    opts.host = (sreq.headers['x-forwarded-host'] ?? sreq.headers.host).split(':', 1)[0];
    opts.port = sreq.headers['x-forwarded-proto'] === 'https' ? 443 : 80;
  } catch(err) {
    abort.call(sreq, err);
    return;
  }

  const httpx = sreq.headers['x-forwarded-proto'] === 'https' ? https : http;

  if ('proxy' in sreq.headers) {
    const HttpxProxyAgent = sreq.headers['x-forwarded-proto'] === 'https' ? HttpsProxyAgent : HttpProxyAgent;
    opts.agent = new HttpxProxyAgent(sreq.headers['proxy']);
    delete opts.headers['proxy'];
  }

  delete opts.headers['x-forwarded-proto'];
  delete opts.headers['x-forwarded-host'];
  delete opts.headers['x-forwarded-for'];

  const creq = httpx.request(opts, (cres) => {
    if ('set-cookie' in cres.headers && Array.isArray(cres.headers['set-cookie'])) {
      deepReplace(cres.headers['set-cookie'], domainRegExp, `domain=.${process.env.HOST}`);
    }

    if ('access-control-allow-origin' in cres.headers) {
      cres.headers['access-control-allow-origin'] = origin ?? '*';
    }

    if (origin && 'content-security-policy' in cres.headers) {
      cres.headers['content-security-policy'] = cres.headers['content-security-policy'].replace(/($|;)/g, ` ${origin}$1`);
    }

    cres.on('error', abort);

    // passthrough status code and headers
    sres.writeHead(cres.statusCode, cres.headers);
    cres.pipe(sres);
  });

  creq.setTimeout(1000);
  creq.on('timeout', abort);
  creq.on('error', abort);

  sreq.pipe(replaceStream(hostRegExp, '')).pipe(creq);
}).listen(process.env.PORT, '0.0.0.0', () => {
  console.log(`http server is listening on port ${process.env.PORT}.`);
});
