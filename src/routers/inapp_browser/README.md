We get a significant portion of traffic from instagram/facebook mobile apps.
When opening a link in these apps, you don't actually open the link in the
browser by default. Instead, it opens inside an in-app browser with lots of
additional tracking and somewhat reduced functionality (e.g., no tabs, Sign in
with Google doesn't work, doesn't have a proper browser history, etc).

We can detect this reliably via user-agent tests looking for either `Instagram`,
`FBAN`, or `FBAV` in the user-agent string.

We perform precisely that test in the reverse proxy responsible for selecting which
type of server to send the request to. On a match without a file extension and not
starting with /iab/, the request is _internally_ rewritten to `/iab/{path}`. We
send /iab/\* requests to the frontend-ssr-web server.
