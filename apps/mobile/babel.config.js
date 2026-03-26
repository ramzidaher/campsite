/** @type {import('@babel/core').ConfigFunction} */
module.exports = function (api) {
  api.cache(true);
  // Monorepo: hoisted babel-preset-expo cannot resolve `expo-router` from the repo root, so the preset skips the router plugin unless we add it here.
  const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');
  return {
    presets: ['babel-preset-expo'],
    plugins: [expoRouterBabelPlugin],
  };
};
