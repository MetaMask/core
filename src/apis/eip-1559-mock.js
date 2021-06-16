const http = require('http');

// eslint-disable-next-line
const { PORT, HOSTNAME } = process.env;

const hostname = HOSTNAME || '127.0.0.1';
const port = PORT || 3000;

const range = (min, max) => Math.random() * (max - min) + min;
const ms = 1000;

const end = (res, json) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(json);
};

// base Eip1559GasFee
const Eip1559GasFee = {
  minWaitTimeEstimate: Number(1),
  maxWaitTimeEstimate: Number(1),
  suggestedMaxPriorityFeePerGas: Number(1),
  suggestedMaxFeePerGas: Number(1),
  calculatedTotalMinFee: Number(1),
};

const get_payload = () => {
  const low = Math.floor(range(1, 5));
  const medium = low * 2;
  const high = medium * 2;

  // minWaitTimeEstimate
  const minWaitTimeEstimate_low = low * ms;
  const minWaitTimeEstimate_medium = medium * ms;
  const minWaitTimeEstimate_high = high * ms;

  // maxWaitTimeEstimate
  const maxWaitTimeEstimate_low = low * (ms * 2);
  const maxWaitTimeEstimate_medium = medium * (ms * 2);
  const maxWaitTimeEstimate_high = high * (ms * 2);

  return {
    low: {
      ...Eip1559GasFee,
      suggestedMaxFeePerGas: low,
      minWaitTimeEstimate: minWaitTimeEstimate_low,
      maxWaitTimeEstimate: maxWaitTimeEstimate_low,
    },
    medium: {
      ...Eip1559GasFee,
      suggestedMaxFeePerGas: medium,
      minWaitTimeEstimate: minWaitTimeEstimate_medium,
      maxWaitTimeEstimate: maxWaitTimeEstimate_medium,
    },
    high: {
      ...Eip1559GasFee,
      suggestedMaxFeePerGas: high,
      minWaitTimeEstimate: minWaitTimeEstimate_high,
      maxWaitTimeEstimate: maxWaitTimeEstimate_high,
    },
  };
};

const server = http.createServer((_, res) => {
  const json = JSON.stringify(get_payload());
  end(res, json);
});

server.listen(port, hostname, () => {
  const url = `http://${hostname}:${port}/`;
  console.log(`Mock server running at: ${url}`);
  console.log(`You can now: \`curl ${url}\``);
});
