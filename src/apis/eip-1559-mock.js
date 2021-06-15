const http = require('http');

// eslint-disable-next-line
const { PORT, HOSTNAME } = process.env;

const hostname = HOSTNAME || '127.0.0.1';
const port = PORT || 3000;

const range = (min, max) => Math.random() * (max - min) + min;

const end = (res, json) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(json);
};

const server = http.createServer((_, res) => {
  const low = Math.floor(range(1, 5));
  const medium = low * 2;
  const high = medium * 2;

  const payload = {
    low: { suggestedMaxFeePerGas: low },
    medium: { suggestedMaxFeePerGas: medium },
    high: { suggestedMaxFeePerGas: high },
  };
  const json = JSON.stringify(payload);

  end(res, json);
});

server.listen(port, hostname, () => {
  const url = `http://${hostname}:${port}/`;
  console.log(`Mock server running at: ${url}`);
  console.log(`You can now: \`curl ${url}\``);
});
