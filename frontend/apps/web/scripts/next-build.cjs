#!/usr/bin/env node

process.argv = [
  process.execPath,
  require.resolve('next/dist/bin/next'),
  'build'
];

require('next/dist/bin/next');
