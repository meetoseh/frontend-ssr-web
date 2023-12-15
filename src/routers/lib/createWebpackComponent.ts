import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { inspect } from 'util';
import * as slack from '../../slack';
import os from 'os';
import { formatDuration } from '../../lib/formatDuration';
import { spawn } from 'child_process';
import { colorNow } from '../../logging';

export type WebpackComponentArgs = {
  /**
   * The path to the file containing the component, relative to the project
   * root. Generally starts with `src/routers`. Must contain a default export
   * that is a React component.
   */
  componentPath: string;

  /**
   * JSON-serializable props to pass to the component. Optional. If
   * `window.__INITIAL_PROPS__` is set, it will be merged with these props
   * (preferring `window.__INITIAL_PROPS__`)
   */
  props?: Record<string, any>;

  /**
   * A unique key used when creating the various temporary files; each
   * concurrently generated bundle for the same component needs a different
   * key. Optional, defaults to a random string.
   */
  key?: string;

  /**
   * The folder where the generated bundle should be located, relative to the
   * project root. Generally starts with `build/routers`. This is not modified
   * by the key and thus must be unique for each bundle.
   */
  bundleFolder: string;

  /**
   * https://webpack.js.org/configuration/output/#outputpublicpath
   *
   * This is from the clients perspective. The path to the folder where
   * emitted CSS files will be located. The CSS files will be emitted
   * adjacent to the bundle file.
   *
   * So for example, if the bundlePath is `build/routers/example`,
   * then there may be a CSS file `build/routers/example/main.css` that is emitted,
   * and it must be served at `${cssPublicPath}/main.css`. So for example, if
   * `cssPublicPath` is `/shared/assets/example`, then the CSS file must be served
   * at `/shared/assets/example/main.css`.
   */
  cssPublicPath: string;
};

/**
 * Generates a bundle that loads the given component with the given
 * props, without caching / hashing.
 *
 * This works as follows:
 * - Generate an entrypoint file for the given component
 * - Generate a tsconfig that emits a bundle
 * - Generate a webpack configuration that uses the tsconfig
 *   and targets the entrypoint
 * - Run webpack with the generated configuration
 * - Delete the generated files
 */
export const createWebpackComponent = async ({
  componentPath,
  props,
  key,
  bundleFolder,
  cssPublicPath,
}: WebpackComponentArgs) => {
  // verify componentPath points to a file
  const componentFullPath = path.resolve(componentPath);
  if (!componentFullPath.endsWith('.tsx')) {
    throw new Error(`Component path must point to a .tsx file, but got ${componentFullPath}`);
  }
  try {
    await fs.promises.access(componentFullPath, fs.constants.R_OK);
  } catch (e) {
    throw new Error(`Could not access component file at ${componentFullPath}: ${e}`);
  }

  const bundleDirectory = path.resolve(bundleFolder);
  try {
    await fs.promises.rm(bundleDirectory, { recursive: true });
  } catch (e) {}
  const bundleNameFormat = '[name].[contenthash].js';

  const realKey = key ?? 'k' + Math.random().toString(36).substring(3);

  const componentDir = path.dirname(componentFullPath);
  const componentName = path.basename(componentFullPath, '.tsx');

  const entrypoint = path.join(componentDir, `${componentName}.${realKey}.entrypoint.tsx`);

  try {
    await fs.promises.access(entrypoint, fs.constants.R_OK);
    throw new Error(`Entrypoint file already exists at ${entrypoint}`);
  } catch (e) {}

  const tsconfig = path.join(process.cwd(), `${componentName}.${realKey}.tsconfig.json`);

  try {
    await fs.promises.access(tsconfig, fs.constants.R_OK);
    throw new Error(`TSConfig file already exists at ${tsconfig}`);
  } catch (e) {}

  const webpackConfigFile = path.join(
    process.cwd(),
    `${componentName}.${realKey}.webpack.config.js`
  );

  try {
    await fs.promises.access(webpackConfigFile, fs.constants.R_OK);
    throw new Error(`Webpack config file already exists at ${webpackConfigFile}`);
  } catch (e) {}

  const bundleForLog = `${chalk.cyan(componentName)} ${chalk.gray('with key')} ${chalk.white(
    realKey
  )}`;

  console.info(
    `${colorNow()} ${chalk.whiteBright('webpack:')} ${chalk.gray(
      'generating bundle for'
    )} ${bundleForLog}`
  );

  let hadError = false;
  const startedAt = performance.now();
  try {
    // entrypoint
    await fs.promises.writeFile(
      entrypoint,
      `import { hydrateRoot } from 'react-dom/client';
import App from './${componentName}';

const bundledProps = ${props === undefined ? '{}' : JSON.stringify(props)};
const props = Object.assign(
  {},
  bundledProps,
  (window as any)['__INITIAL_PROPS__']
);
hydrateRoot(document, <App {...props} />);
`
    );
    // tsconfig
    await fs.promises.writeFile(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          lib: ['DOM'],
          allowJs: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          noFallthroughCasesInSwitch: true,
          module: 'esnext',
          moduleResolution: 'node',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: false,
          sourceMap: false,
          jsx: 'react-jsx',
          plugins: [{ name: 'typescript-plugin-css-modules' }],
        },
        include: ['src'],
        'ts-node': {
          files: true,
        },
        files: ['src/Globals.d.ts'],
      })
    );
    // webpack config
    const webpackMode = process.env.ENVIRONMENT === 'dev' ? 'development' : 'production';
    await fs.promises.writeFile(
      webpackConfigFile,
      `// AUTO GENERATED
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const entrypoint = ${JSON.stringify(entrypoint)};
const bundleDirectory = ${JSON.stringify(bundleDirectory)};
const bundleNameFormat = ${JSON.stringify(bundleNameFormat)};
const tsconfig = ${JSON.stringify(tsconfig)};
const cssPublicPath = ${JSON.stringify(cssPublicPath)};
const webpackMode = ${JSON.stringify(webpackMode)};

export default {
  mode: webpackMode,
  entry: entrypoint,
  stats: 'errors-only',
  output: {
    path: bundleDirectory,
    filename: bundleNameFormat,
    chunkFilename: '[name].[contenthash].js',
    assetModuleFilename: '[name].[contenthash][ext]',
  },
  devtool: false,
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
              configFile: tsconfig,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.module\.css$/i,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: cssPublicPath,
            },
          },
          'css-loader',
        ],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
    }),
  ],
};
`
    );
    // run webpack in a separate process so we get cpu parallelism
    await new Promise<void>((resolve, reject) => {
      const child = spawn(`npx webpack --config ${webpackConfigFile} --color`, {
        shell: true,
        detached: false,
        env: process.env,
        stdio: 'pipe',
      });
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const stdout = child.stdout.read();
          const stderr = child.stderr.read();
          console.log(
            `${colorNow()} ${chalk.whiteBright('webpack stdout:\n')}${chalk.white(stdout)}`
          );
          console.error(
            `${colorNow()} ${chalk.redBright('webpack stderr:\n')}${chalk.red(stderr)}`
          );
          reject(new Error(`webpack exited with code ${code}`));
        }
      });
    });
  } catch (e) {
    hadError = true;
    console.error(
      `${colorNow()} ${chalk.redBright('error constructing webpack bundle for')} ${chalk.cyanBright(
        componentName
      )}${chalk.white(':')}\n${inspect(e, { colors: chalk.level >= 1 })}`
    );
    await slack.sendMessageTo(
      'web-errors',
      `${os.hostname()} frontend-ssr-web error constructing webpack bundle for ${componentName} with key ${realKey}`
    );
  } finally {
    console.debug(
      `${colorNow()} ${chalk.gray('webpack:')} ${chalk.gray('cleaning up')} ${bundleForLog}`
    );

    for (const filePath of [entrypoint, tsconfig, webpackConfigFile]) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        hadError = true;
        console.error(
          `${colorNow()} ${chalk.redBright('webpack:')} ${chalk.gray(
            'could not delete'
          )} ${bundleForLog}: ${chalk.redBright(inspect(e))}`
        );
      }
    }

    const finishedAt = performance.now();
    const timeTakenPretty = chalk.whiteBright(formatDuration(finishedAt - startedAt));
    if (!hadError) {
      console.debug(
        `${colorNow()} ${chalk.gray('webpack:')} ${chalk.gray(
          'finished generating bundle for'
        )} ${bundleForLog} ${chalk.gray('in')} ${timeTakenPretty}`
      );
    } else {
      console.error(
        `${colorNow()} ${chalk.redBright('webpack:')} ${chalk.gray(
          'finished generating bundle for'
        )} ${bundleForLog} ${chalk.redBright('with errors')} ${chalk.gray('in')} ${timeTakenPretty}`
      );
    }
  }
};
