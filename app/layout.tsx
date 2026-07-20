import './globals.css';

export const metadata = {
  title: 'Memoria',
  description: '기억을 함께 나누는 돌봄 동반자',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-canvas text-navy font-sans">{children}</body>
    </html>
  );
}
