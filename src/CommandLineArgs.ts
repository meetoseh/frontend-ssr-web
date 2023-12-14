export type CommandLineArgs = {
  /**
   * The hostname to bind to. Ignored if not serving.
   */
  host?: string;
  /**
   * The port to bind to. Ignored if not serving.
   */
  port?: number;
  /**
   * The path to the SSL certificate file to use. Ignored if not serving.
   * If serving and not specified, regular HTTP will be used.
   */
  sslCertfile?: string;
  /**
   * The path to the SSL key file to use. Ignored if not serving.
   * If serving and not specified, regular HTTP will be used.
   */
  sslKeyfile?: string;
  /**
   * True if we are serving the site, false if we are just building
   * artifacts.
   */
  serve: boolean;

  /**
   * If `rebuild` then routes should clean all artifacts and rebuild
   * them. If `reuse`, then routes should assume that their artifacts
   * are already available.
   *
   * If 'reuse', tmp files will be reconstructed if missing, but assumed to be
   * correct if present.
   */
  artifacts: 'reuse' | 'rebuild';

  /**
   * The maximum number of routes to build simultaneously. This is
   * ignored if reusing artifacts.
   */
  buildParallelism: number;

  /**
   * If true we are constructing routes solely for the purpose of building
   * the openapi schema / sitemap etc. This may be run in parallel with
   * a standard build and hence must be essentially side-effect free.
   */
  docsOnly: boolean;
};
