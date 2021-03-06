'use strict';

// Modules
const _ = require('lodash');
const url = require('url');

/*
 * Reduces urls to first open port
 */
exports.getFirstOpenPort = (scanner, urls = []) => scanner(urls, {max: 1, waitCodes: []})
  .filter(url => url.status === false)
  .map(port => _.last(port.url.split(':')))
  .then(ports => ports[0]);

/*
 * Helper to determine what ports have changed
 */
exports.needsProtocolScan = (current, last, status = {http: true, https: true}) => {
  if (!last) return status;
  if (current.http === last.http) status.http = false;
  if (current.https === last.https) status.https = false;
  return status;
};

/*
 * Helper to get proxy runner
 */
exports.getProxyRunner = (project, files) => ({
  compose: files,
  project: project,
  opts: {
    services: ['proxy'],
    noRecreate: false,
  },
});

/*
 * Get a list of URLs and their counts
 */
exports.getUrlsCounts = config => _(config)
  .flatMap(service => _.uniq(service))
  .countBy()
  .value();

/*
 * Parse config into urls we can merge to app.info
 */
exports.parse2Info = (urls, ports) => _(urls)
  .map(url => exports.parseUrl(url))
  .flatMap(url => [
    `http://${url.host}${ports.http === '80' ? '' : `:${ports.http}`}${url.pathname}`,
    `https://${url.host}${ports.https === '443' ? '' : `:${ports.https}`}${url.pathname}`,
  ])
  .value();

/*
 * Parse hosts for traefik
 */
exports.parseConfig = config => _(config)
  .map((urls, service) => ({name: service, labels: exports.parseRoutes(urls)}))
  .value();

/*
 * Helper to parse the routes
 */
exports.parseRoutes = urls => {
  const labels = {};
  _.uniq(urls).map(exports.parseUrl).forEach((parsedUrl, i) => {
    const hostRegex = parsedUrl.host.replace(new RegExp('\\*', 'g'), '{wildcard:[a-z0-9-]+}');
    labels[`traefik.${i}.frontend.rule`] = `HostRegexp:${hostRegex}`;
    labels[`traefik.${i}.port`] = parsedUrl.port;
    if (parsedUrl.pathname) {
      labels[`traefik.${i}.frontend.rule`] += `;PathPrefixStrip:${parsedUrl.pathname}`;
    }
  });
  return labels;
};

/*
 * Helper to parse a url
 */
exports.parseUrl = string => {
  // We add the protocol ourselves, so it can be parsed. We also change all *
  // occurrences for our magic word __wildcard__, because otherwise the url parser
  // won't parse wildcards in the hostname correctly.
  const parsedUrl = url.parse(`http://${string}`.replace(/\*/g, '__wildcard__'));

  return {
    host: parsedUrl.hostname.replace(/__wildcard__/g, '*'),
    port: parsedUrl.port || '80',
    pathname: parsedUrl.pathname || '',
  };
};

/*
 * Maps ports to urls
 */
exports.ports2Urls = (ports, secure = false, hostname = '127.0.0.1') => _(ports)
  .map(port => url.format({protocol: (secure) ? 'https' : 'http', hostname, port}))
  .value();


