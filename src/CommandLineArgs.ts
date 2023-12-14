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
   */
  artifacts: 'reuse' | 'rebuild';
};
