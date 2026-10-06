import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#F6F7F2" />

        {/* --- GOOGLE ADS GLOBAL SITE TAG --- */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-674352071"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-674352071');
            `,
          }}
        />
        {/* ---------------------------------- */}

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
