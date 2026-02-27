import './globals.css';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export const metadata = {
  title: 'Latent Space Hub',
  description: 'Your personal AI knowledge companion',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem('theme') || 'system';
                  var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = theme === 'system' ? (isDark ? 'dark' : 'light') : theme;
                  document.documentElement.setAttribute('data-theme', resolved);
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
