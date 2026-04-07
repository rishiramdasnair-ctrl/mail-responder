import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style>{`
          /* Remove browser default blue link color so React Native inline styles win */
          a, a:visited, a:hover, a:active {
            color: inherit;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
