import path from 'path';
import nodeExternals from 'webpack-node-externals';
import process from 'process';
import webpack from 'webpack';

const isDev = process.env.ENVIRONMENT === 'dev';

export default {
  mode: isDev ? 'development' : 'production',
  target: 'node',
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      importType: 'module',
    }),
  ],
  entry: './src/index.ts',
  output: {
    path: path.resolve('build/server'),
    filename: 'server.bundle.js',
    chunkFormat: 'module',
    chunkLoading: 'import',
    module: true,
  },
  devtool: 'source-map',
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              allowTsInNodeModules: true,
            },
          },
        ],
      },
      {
        test: /\.module\.css$/i,
        loader: 'css-loader',
        options: {
          modules: {
            exportOnlyLocals: true,
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      document: 'undefined',
      window: 'undefined',
    }),
  ],
};
