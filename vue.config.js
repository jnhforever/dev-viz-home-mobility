//const target = 'https://admin.livon.care/';
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  devServer: {
    port: 8084,
    proxy: {
      '/api': {
        target: 'https://xapi.livon.care',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  /*  productionSourceMap: false,
  configureWebpack: (config) => {
    if (process.env.NODE_ENV === 'production') {
      config.optimization = {
        minimize: true,
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true, // console.log 제거
                drop_debugger: true, // debugger 제거
              },
              output: {
                comments: false, // 주석 제거
              },
            },
          }),
        ],
      };
    }
  },
  devServer: {
    port: 8084,
    proxy: {},
  },*/
};
