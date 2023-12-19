export type SitemapEntry = {
  /**
   * The path to where the content can be accessed.
   */
  path: `/${string}`;

  /**
   * This should be a sha512 hash of the significant content on the page.
   * This value is used to update `lastmod` in the sitemap, via the database
   * table `sitemap_entries`, keyed by path.
   *
   * Generally, if you have an app like
   *
   * ```tsx
   * export const MyApp = (props: MyProps) => {
   *   return (
   *    <html>
   *      <head>
   *        ...omitted...
   *      </head>
   *      <body>
   *        <div id="root">
   *          <MyHeader />
   *          <MyContent {...props} />
   *          <MyFooter />
   *        </div>
   *      </body>
   *    </html>
   *   );
   * }
   * ```
   *
   * Then this should be a hash of the server-side rendered MyContent component
   * with the appropriate props.
   *
   * @see https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping#the-lastmod-element
   */
  significantContentSHA512: string;
};

export type Sitemap = {
  /**
   * The entries within the sitemap
   */
  entries: SitemapEntry[];
};
