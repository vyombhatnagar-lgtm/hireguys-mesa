import './globals.css';

export const metadata = { title: 'Kargo Hiring', description: 'Internal hiring dashboard' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <strong>Kargo Hiring</strong>
          <a href="/">Upload</a>
          <a href="/dashboard">Dashboard</a>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
