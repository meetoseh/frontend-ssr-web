2. hash the bundles, include hash in path, increase cache control settings to immutable
3. add createComponentRoutes which accepts
   component / componentPath / props / key /
   templatedRelativePath / `Omit<OASOperation, 'responses'>`
   and returns PendingRoute[]
4. ensure updater lock isn't released and we don't start accepting requests
   until routes are built (i think latter already true?)
5. add build server
